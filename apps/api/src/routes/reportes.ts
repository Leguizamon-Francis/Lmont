import { Router } from 'express';
import { z } from 'zod';
import {
  diasReporteSchema,
  hoy,
  mesSchema,
  rangoDelDia,
  redondear,
  type ProductoSinVentas,
  type ProductoVendido,
  type PromocionVendida,
  type ReporteDia,
  type ReporteMes,
  type ReporteMeses,
  type ReporteProductos,
  type ResultadoPeriodo,
} from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, validar } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';

export const reportesRouter = Router();

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
/** Columna DATE: se guarda a medianoche UTC. */
const aDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

function sumarDias(iso: string, n: number) {
  const d = aDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fechaIso(d);
}

function sumarMeses(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// Lectura: todo lo que se vendió, devolvió y gastó entre dos fechas
// ---------------------------------------------------------------------------

/**
 * Un renglón por prenda que salió o volvió: una venta suma, una devolución resta y lo que
 * se lleva en un cambio suma. `importe` ya tiene el descuento de las promociones.
 */
type Renglon = {
  fecha: string;
  productoId: number;
  varianteId: number;
  unidades: number;
  importe: number;
  costo: number;
};

type Datos = {
  renglones: Renglon[];
  /** Recargos o descuentos de los medios de pago (ventas y cambios). */
  ajustes: { fecha: string; monto: number }[];
  /** Fecha de cada venta no anulada. */
  ventas: string[];
  gastos: { fecha: string; concepto: string; monto: number; cuenta: boolean }[];
};

/** Lee el período [desde, hasta): fechas "AAAA-MM-DD" del local. */
async function leerPeriodo(desde: string, hasta: string): Promise<Datos> {
  const enRango = { gte: rangoDelDia(desde).desde, lt: rangoDelDia(hasta).desde };
  const [ventas, cambios, gastos] = await Promise.all([
    prisma.venta.findMany({
      where: { anulada: false, creadoEn: enRango },
      select: {
        creadoEn: true,
        items: {
          select: {
            cantidad: true,
            precioUnitario: true,
            descuentoPromo: true,
            costoUnitario: true,
            varianteId: true,
            variante: { select: { productoId: true } },
          },
        },
        pagos: { select: { ajuste: true } },
      },
    }),
    prisma.cambio.findMany({
      where: { creadoEn: enRango },
      select: {
        creadoEn: true,
        pagos: { select: { ajuste: true } },
        devueltos: {
          select: {
            cantidad: true,
            precioUnitario: true,
            ventaItem: { select: { costoUnitario: true, varianteId: true, variante: { select: { productoId: true } } } },
          },
        },
        llevados: {
          select: { cantidad: true, precioUnitario: true, costoUnitario: true, varianteId: true, variante: { select: { productoId: true } } },
        },
      },
    }),
    prisma.movimientoCaja.findMany({
      where: { tipo: 'GASTO', fecha: { gte: aDate(desde), lt: aDate(hasta) } },
      select: { fecha: true, monto: true, concepto: { select: { nombre: true, cuentaEnGanancia: true } } },
    }),
  ]);

  const d: Datos = { renglones: [], ajustes: [], ventas: [], gastos: [] };
  for (const v of ventas) {
    const fecha = hoy(v.creadoEn);
    d.ventas.push(fecha);
    for (const it of v.items) {
      d.renglones.push({
        fecha,
        productoId: it.variante.productoId,
        varianteId: it.varianteId,
        unidades: it.cantidad,
        importe: it.cantidad * num(it.precioUnitario) - num(it.descuentoPromo),
        costo: it.cantidad * num(it.costoUnitario),
      });
    }
    for (const p of v.pagos) d.ajustes.push({ fecha, monto: num(p.ajuste) });
  }
  for (const c of cambios) {
    const fecha = hoy(c.creadoEn);
    for (const x of c.devueltos) {
      d.renglones.push({
        fecha,
        productoId: x.ventaItem.variante.productoId,
        varianteId: x.ventaItem.varianteId,
        unidades: -x.cantidad,
        // Se devolvió al precio que había pagado (ya con la promo).
        importe: -x.cantidad * num(x.precioUnitario),
        costo: -x.cantidad * num(x.ventaItem.costoUnitario),
      });
    }
    for (const x of c.llevados) {
      d.renglones.push({
        fecha,
        productoId: x.variante.productoId,
        varianteId: x.varianteId,
        unidades: x.cantidad,
        importe: x.cantidad * num(x.precioUnitario),
        costo: x.cantidad * num(x.costoUnitario),
      });
    }
    for (const p of c.pagos) d.ajustes.push({ fecha, monto: num(p.ajuste) });
  }
  for (const g of gastos) {
    d.gastos.push({ fecha: fechaIso(g.fecha), concepto: g.concepto.nombre, monto: num(g.monto), cuenta: g.concepto.cuentaEnGanancia });
  }
  return d;
}

const suma = (xs: number[]) => redondear(xs.reduce((s, x) => s + x, 0));

/** Resultado de las fechas que empiezan con `prefijo` ("2026-11" = el mes, "2026-11-05" = el día, "" = todo). */
function resultado(d: Datos, prefijo = ''): ResultadoPeriodo {
  const es = (f: string) => f.startsWith(prefijo);
  const renglones = d.renglones.filter((r) => es(r.fecha));
  const ventasProductos = suma(renglones.map((r) => r.importe));
  const ajustes = d.ajustes.filter((a) => es(a.fecha)).map((a) => a.monto);
  // Recargos (positivos): costo de la tarjeta, no ganancia. Descuentos (negativos): sí restan.
  const descuentosMedios = suma(ajustes.filter((m) => m < 0));
  const recargos = suma(ajustes.filter((m) => m > 0));
  const ingresos = redondear(ventasProductos + descuentosMedios);
  const costo = suma(renglones.map((r) => r.costo));
  const gananciaBruta = redondear(ingresos - costo);
  const gastos = suma(d.gastos.filter((g) => g.cuenta && es(g.fecha)).map((g) => g.monto));
  return {
    cantidadVentas: d.ventas.filter(es).length,
    unidades: renglones.reduce((s, r) => s + r.unidades, 0),
    ventasProductos,
    descuentosMedios,
    recargos,
    ingresos,
    costo,
    gananciaBruta,
    gastos,
    ganancia: redondear(gananciaBruta - gastos),
  };
}

const mesActual = () => hoy().slice(0, 7);
const mesQuery = (nombre: string) => z.object({ [nombre]: mesSchema.optional().transform((v) => v ?? mesActual()) });

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/** Ganancia del mes, ventas día por día, gastos por concepto y promociones vendidas. */
reportesRouter.get(
  '/mes',
  handler(async (req, res) => {
    const { mes } = validar(mesQuery('mes'), req.query) as { mes: string };
    const desde = `${mes}-01`;
    const hasta = `${sumarMeses(mes, 1)}-01`;
    const [d, promos] = await Promise.all([
      leerPeriodo(desde, hasta),
      prisma.ventaPromocion.findMany({
        where: { venta: { anulada: false, creadoEn: { gte: rangoDelDia(desde).desde, lt: rangoDelDia(hasta).desde } } },
        // El nombre guardado en la venta (la promo pudo cambiar de nombre o eliminarse después).
        select: { promocionId: true, nombre: true, veces: true, precio: true, descuento: true },
      }),
    ]);

    const dias: ReporteDia[] = [];
    for (let f = desde; f < hasta && f <= hoy(); f = sumarDias(f, 1)) {
      const r = resultado(d, f);
      if (r.cantidadVentas || r.unidades || r.ingresos) {
        dias.push({ fecha: f, cantidadVentas: r.cantidadVentas, unidades: r.unidades, ingresos: r.ingresos, gananciaBruta: r.gananciaBruta });
      }
    }

    const porConcepto = new Map<string, number>();
    for (const g of d.gastos) if (g.cuenta) porConcepto.set(g.concepto, redondear((porConcepto.get(g.concepto) ?? 0) + g.monto));

    const porPromo = new Map<number, PromocionVendida>();
    for (const p of promos) {
      const x = porPromo.get(p.promocionId) ?? { promocionId: p.promocionId, nombre: p.nombre, veces: 0, precio: 0, descuento: 0 };
      x.veces += p.veces;
      x.precio = redondear(x.precio + num(p.precio));
      x.descuento = redondear(x.descuento + num(p.descuento));
      porPromo.set(p.promocionId, x);
    }

    const body: ReporteMes = {
      mes,
      resultado: resultado(d),
      dias,
      gastosPorConcepto: [...porConcepto].map(([concepto, total]) => ({ concepto, total })).sort((a, b) => b.total - a.total),
      gastosNoCuentan: suma(d.gastos.filter((g) => !g.cuenta).map((g) => g.monto)),
      promociones: [...porPromo.values()].sort((a, b) => b.veces - a.veces || b.precio - a.precio),
    };
    res.json(body);
  }),
);

/** Los 12 meses que terminan en `hasta` (el mes actual si no se indica), del más viejo al más nuevo. */
reportesRouter.get(
  '/meses',
  handler(async (req, res) => {
    const { hasta } = validar(mesQuery('hasta'), req.query) as { hasta: string };
    const primero = sumarMeses(hasta, -11);
    const d = await leerPeriodo(`${primero}-01`, `${sumarMeses(hasta, 1)}-01`);
    const body: ReporteMeses = {
      meses: Array.from({ length: 12 }, (_, i) => {
        const mes = sumarMeses(primero, i);
        return { mes, ...resultado(d, mes) };
      }),
    };
    res.json(body);
  }),
);

/** Lo más vendido y lo que no se vende en los últimos N días (para decidir qué recomprar). */
reportesRouter.get(
  '/productos',
  handler(async (req, res) => {
    const { dias } = validar(z.object({ dias: diasReporteSchema }), req.query);
    const desde = sumarDias(hoy(), -(dias - 1));
    const d = await leerPeriodo(desde, sumarDias(hoy(), 1));

    type Acum = { unidades: number; vendidas: number; importe: number; costo: number; variantes: Map<number, number> };
    const porProducto = new Map<number, Acum>();
    for (const r of d.renglones) {
      const a = porProducto.get(r.productoId) ?? { unidades: 0, vendidas: 0, importe: 0, costo: 0, variantes: new Map() };
      a.unidades += r.unidades;
      if (r.unidades > 0) a.vendidas += r.unidades;
      a.importe += r.importe;
      a.costo += r.costo;
      a.variantes.set(r.varianteId, (a.variantes.get(r.varianteId) ?? 0) + r.unidades);
      porProducto.set(r.productoId, a);
    }

    const productos = await prisma.producto.findMany({
      where: { OR: [{ activo: true }, { id: { in: [...porProducto.keys()] } }] },
      select: {
        id: true,
        nombre: true,
        activo: true,
        precioCompra: true,
        tipo: { select: { nombre: true } },
        variantes: { select: { id: true, stock: true, activo: true, color: { select: { nombre: true } }, talle: { select: { nombre: true } } } },
      },
    });
    const stockDe = (p: (typeof productos)[number]) => p.variantes.reduce((s, v) => s + (v.activo ? v.stock : 0), 0);

    const masVendidos: ProductoVendido[] = productos
      .filter((p) => (porProducto.get(p.id)?.unidades ?? 0) > 0)
      .map((p) => {
        const a = porProducto.get(p.id)!;
        const variantes = p.variantes
          .map((v) => ({ color: v.color.nombre, talle: v.talle.nombre, unidades: a.variantes.get(v.id) ?? 0, stock: v.activo ? v.stock : 0 }))
          .filter((v) => v.unidades > 0)
          .sort((x, y) => y.unidades - x.unidades);
        return {
          productoId: p.id,
          producto: p.nombre,
          tipo: p.tipo.nombre,
          unidades: a.unidades,
          importe: redondear(a.importe),
          ganancia: redondear(a.importe - a.costo),
          stock: stockDe(p),
          variantes,
        };
      })
      .sort((x, y) => y.unidades - x.unidades || y.importe - x.importe)
      .slice(0, 50);

    const quietos = productos.filter((p) => p.activo && !porProducto.get(p.id)?.vendidas && stockDe(p) > 0);
    const ultimas = await ultimaVenta(quietos.map((p) => p.id));
    const sinVentas: ProductoSinVentas[] = quietos
      .map((p) => {
        const stock = stockDe(p);
        return {
          productoId: p.id,
          producto: p.nombre,
          tipo: p.tipo.nombre,
          stock,
          valorStock: redondear(stock * num(p.precioCompra)),
          ultimaVenta: ultimas.get(p.id) ?? null,
        };
      })
      .sort((x, y) => y.valorStock - x.valorStock || y.stock - x.stock);

    const body: ReporteProductos = { dias, desde, masVendidos, sinVentas };
    res.json(body);
  }),
);

/** Última fecha en que salió cada producto (en una venta no anulada o llevado en un cambio). */
async function ultimaVenta(productoIds: number[]): Promise<Map<number, string>> {
  if (!productoIds.length) return new Map();
  const filas = await prisma.$queryRaw<{ productoId: number; ultima: Date }[]>`
    SELECT x.producto_id AS "productoId", MAX(x.fecha) AS ultima FROM (
      SELECT v.producto_id, ve.creado_en AS fecha
        FROM venta_items vi JOIN variantes v ON v.id = vi.variante_id JOIN ventas ve ON ve.id = vi.venta_id
       WHERE NOT ve.anulada
      UNION ALL
      SELECT v.producto_id, c.creado_en AS fecha
        FROM cambio_llevados cl JOIN variantes v ON v.id = cl.variante_id JOIN cambios c ON c.id = cl.cambio_id
    ) x
    WHERE x.producto_id = ANY(${productoIds}::int[])
    GROUP BY x.producto_id`;
  return new Map(filas.map((f) => [Number(f.productoId), hoy(f.ultima)]));
}
