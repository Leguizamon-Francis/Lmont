import { Router } from 'express';
import { z } from 'zod';
import {
  DIAS_REPOSICION,
  diasInactivoSchema,
  hoy,
  MOTIVOS_AJUSTE,
  mesSchema,
  periodoSchema,
  rangoDelDia,
  redondear,
  ZONA_HORARIA,
  type CambiosTasa,
  type CeldaCalor,
  type ClienteInactivo,
  type ClienteReporte,
  type DistribucionTipo,
  type MedioPago,
  type MercaderiaProveedor,
  type MercaderiaTipo,
  type MotivoCambio,
  type Perdida,
  type Periodo,
  type PeriodoComparado,
  type ProductoSinVentas,
  type ProductoVendido,
  type PromocionVendida,
  type PuntoSerie,
  type Reponer,
  type ReporteCambios,
  type ReporteClientes,
  type ReporteMercaderia,
  type ReporteMeses,
  type ReporteResumen,
  type ReporteVentas,
  type ResultadoPeriodo,
  type VentasMedio,
  type VentasVendedor,
} from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, validar } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';
import type { Prisma } from '../generated/prisma/client.js';

export const reportesRouter = Router();

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

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

/** Días de un período, contando los dos extremos. */
const diasEntre = (desde: string, hasta: string) => Math.round((aDate(hasta).getTime() - aDate(desde).getTime()) / 86_400_000) + 1;

/** Instantes para filtrar `creadoEn` en el período [desde, hasta] (inclusive, días del local). */
const enRango = (p: Periodo) => ({ gte: rangoDelDia(p.desde).desde, lt: rangoDelDia(p.hasta).hasta });

/** El mismo largo de días, justo antes. */
function periodoAnterior(p: Periodo): Periodo {
  const n = diasEntre(p.desde, p.hasta);
  return { desde: sumarDias(p.desde, -n), hasta: sumarDias(p.desde, -1) };
}

/** Las mismas fechas un año antes (el 29/2 pasa al 28/2). */
function unAnioAntes(p: Periodo): Periodo {
  const menosUno = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
    const ultimo = new Date(Date.UTC(a - 1, m, 0)).getUTCDate();
    return `${a - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
  };
  return { desde: menosUno(p.desde), hasta: menosUno(p.hasta) };
}

const fmtHora = new Intl.DateTimeFormat('en-US', { timeZone: ZONA_HORARIA, hour: 'numeric', hourCycle: 'h23' });
/** Hora del local (0–23). */
const horaLocal = (d: Date) => Number(fmtHora.format(d)) % 24;
/** Día de la semana del local: 0 = lunes … 6 = domingo. */
const diaSemana = (fecha: string) => (aDate(fecha).getUTCDay() + 6) % 7;

const suma = (xs: number[]) => redondear(xs.reduce((s, x) => s + x, 0));
const porcentaje = (parte: number, total: number) => (total ? redondear((parte / total) * 100) : 0);

// ---------------------------------------------------------------------------
// Lectura: todo lo que se vendió, devolvió y gastó en un período
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
  /** Cada venta no anulada: lo cobrado por las prendas y cuántas eran (para el ticket). */
  ventas: { fecha: string; importe: number; unidades: number }[];
  gastos: { fecha: string; concepto: string; monto: number; cuenta: boolean }[];
};

async function leerPeriodo(p: Periodo): Promise<Datos> {
  const rango = enRango(p);
  const [ventas, cambios, gastos] = await Promise.all([
    prisma.venta.findMany({
      where: { anulada: false, creadoEn: rango },
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
      where: { creadoEn: rango },
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
      where: { tipo: 'GASTO', fecha: { gte: aDate(p.desde), lte: aDate(p.hasta) } },
      select: { fecha: true, monto: true, concepto: { select: { nombre: true, cuentaEnGanancia: true } } },
    }),
  ]);

  const d: Datos = { renglones: [], ajustes: [], ventas: [], gastos: [] };
  for (const v of ventas) {
    const fecha = hoy(v.creadoEn);
    let importe = 0;
    let unidades = 0;
    for (const it of v.items) {
      const r: Renglon = {
        fecha,
        productoId: it.variante.productoId,
        varianteId: it.varianteId,
        unidades: it.cantidad,
        importe: it.cantidad * num(it.precioUnitario) - num(it.descuentoPromo),
        costo: it.cantidad * num(it.costoUnitario),
      };
      d.renglones.push(r);
      importe += r.importe;
      unidades += r.unidades;
    }
    d.ventas.push({ fecha, importe, unidades });
    for (const pg of v.pagos) d.ajustes.push({ fecha, monto: num(pg.ajuste) });
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
    for (const pg of c.pagos) d.ajustes.push({ fecha, monto: num(pg.ajuste) });
  }
  for (const g of gastos) {
    d.gastos.push({ fecha: fechaIso(g.fecha), concepto: g.concepto.nombre, monto: num(g.monto), cuenta: g.concepto.cuentaEnGanancia });
  }
  return d;
}

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
  const ventas = d.ventas.filter((v) => es(v.fecha));
  return {
    cantidadVentas: ventas.length,
    unidades: renglones.reduce((s, r) => s + r.unidades, 0),
    ventasProductos,
    descuentosMedios,
    recargos,
    ingresos,
    costo,
    gananciaBruta,
    gastos,
    ganancia: redondear(gananciaBruta - gastos),
    ticketPromedio: ventas.length ? redondear(suma(ventas.map((v) => v.importe)) / ventas.length) : 0,
    prendasPorVenta: ventas.length ? redondear(ventas.reduce((s, v) => s + v.unidades, 0) / ventas.length) : 0,
  };
}

const leerPeriodoQuery = (query: unknown) => validar(periodoSchema, query) as Periodo;

// ---------------------------------------------------------------------------
// Resumen del período, comparado con el anterior y con el año pasado
// ---------------------------------------------------------------------------

reportesRouter.get(
  '/resumen',
  handler(async (req, res) => {
    const p = leerPeriodoQuery(req.query);
    const anterior = periodoAnterior(p);
    const anioAnterior = unAnioAntes(p);
    const [d, dAnt, dAnio, promos] = await Promise.all([
      leerPeriodo(p),
      leerPeriodo(anterior),
      leerPeriodo(anioAnterior),
      prisma.ventaPromocion.findMany({
        where: { venta: { anulada: false, creadoEn: enRango(p) } },
        // El nombre guardado en la venta (la promo pudo cambiar de nombre o eliminarse después).
        select: { promocionId: true, nombre: true, veces: true, precio: true, descuento: true },
      }),
    ]);

    // Períodos de más de dos meses se agrupan por mes para que el gráfico se lea.
    const agrupacion = diasEntre(p.desde, p.hasta) > 62 ? 'mes' : 'dia';
    const serie: PuntoSerie[] = [];
    const ultimo = p.hasta < hoy() ? p.hasta : hoy();
    const punto = (fecha: string): PuntoSerie => {
      const r = resultado(d, fecha);
      return { fecha, cantidadVentas: r.cantidadVentas, unidades: r.unidades, ingresos: r.ingresos, gananciaBruta: r.gananciaBruta };
    };
    if (agrupacion === 'dia') {
      for (let f = p.desde; f <= ultimo; f = sumarDias(f, 1)) serie.push(punto(f));
    } else {
      for (let m = p.desde.slice(0, 7); m <= ultimo.slice(0, 7); m = sumarMeses(m, 1)) serie.push(punto(m));
    }

    const porConcepto = new Map<string, number>();
    for (const g of d.gastos) if (g.cuenta) porConcepto.set(g.concepto, redondear((porConcepto.get(g.concepto) ?? 0) + g.monto));

    const porPromo = new Map<number, PromocionVendida>();
    for (const pr of promos) {
      const x = porPromo.get(pr.promocionId) ?? { promocionId: pr.promocionId, nombre: pr.nombre, veces: 0, precio: 0, descuento: 0 };
      x.veces += pr.veces;
      x.precio = redondear(x.precio + num(pr.precio));
      x.descuento = redondear(x.descuento + num(pr.descuento));
      porPromo.set(pr.promocionId, x);
    }

    const comparado = (q: Periodo, datos: Datos): PeriodoComparado => ({ ...q, resultado: resultado(datos) });
    const body: ReporteResumen = {
      ...p,
      resultado: resultado(d),
      anterior: comparado(anterior, dAnt),
      anioAnterior: comparado(anioAnterior, dAnio),
      agrupacion,
      serie,
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
    const { hasta } = validar(z.object({ hasta: mesSchema.optional().transform((v) => v ?? hoy().slice(0, 7)) }), req.query);
    const primero = sumarMeses(hasta, -11);
    const d = await leerPeriodo({ desde: `${primero}-01`, hasta: sumarDias(`${sumarMeses(hasta, 1)}-01`, -1) });
    const body: ReporteMeses = {
      meses: Array.from({ length: 12 }, (_, i) => {
        const mes = sumarMeses(primero, i);
        return { mes, ...resultado(d, mes) };
      }),
    };
    res.json(body);
  }),
);

// ---------------------------------------------------------------------------
// Ventas: por vendedor, medio de pago, día y hora, ticket
// ---------------------------------------------------------------------------

const SIN_VENDEDOR = 'Sin vendedor';

reportesRouter.get(
  '/ventas',
  handler(async (req, res) => {
    const p = leerPeriodoQuery(req.query);
    const anterior = periodoAnterior(p);
    const selectVenta = {
      creadoEn: true,
      vendedorId: true,
      items: { select: { cantidad: true, precioUnitario: true, descuentoPromo: true, costoUnitario: true } },
    } as const;
    const [ventas, ventasAnt, cambios, vendedores] = await Promise.all([
      prisma.venta.findMany({
        where: { anulada: false, creadoEn: enRango(p) },
        select: { ...selectVenta, pagos: { select: { medio: true, cuotas: true, cobrado: true, ajuste: true } } },
      }),
      prisma.venta.findMany({ where: { anulada: false, creadoEn: enRango(anterior) }, select: selectVenta }),
      prisma.cambio.findMany({
        where: { creadoEn: enRango(p) },
        select: {
          venta: { select: { vendedorId: true } },
          devueltos: { select: { cantidad: true, precioUnitario: true, ventaItem: { select: { costoUnitario: true } } } },
          llevados: { select: { cantidad: true, precioUnitario: true, costoUnitario: true } },
          pagos: { select: { ajuste: true } },
        },
      }),
      prisma.vendedor.findMany({ select: { id: true, nombre: true } }),
    ]);
    const nombreVendedor = new Map(vendedores.map((v) => [v.id, v.nombre]));

    type Item = { cantidad: number; precioUnitario: Prisma.Decimal; descuentoPromo: Prisma.Decimal; costoUnitario: Prisma.Decimal };
    const totalesVenta = (items: Item[]) => ({
      importe: items.reduce((s, it) => s + it.cantidad * num(it.precioUnitario) - num(it.descuentoPromo), 0),
      costo: items.reduce((s, it) => s + it.cantidad * num(it.costoUnitario), 0),
      unidades: items.reduce((s, it) => s + it.cantidad, 0),
    });

    // Por vendedor
    type Acum = Omit<VentasVendedor, 'ticketPromedio' | 'nombre' | 'vendedorId'> & { costo: number };
    const vacio = (): Acum => ({ ventas: 0, unidades: 0, importe: 0, costo: 0, ganancia: 0, devueltas: 0, importeAnterior: 0 });
    const porVendedor = new Map<number | null, Acum>();
    const acum = (id: number | null) => {
      let a = porVendedor.get(id);
      if (!a) porVendedor.set(id, (a = vacio()));
      return a;
    };

    // Medios, mapa de calor y ticket
    const porMedio = new Map<string, VentasMedio>();
    const calor = new Map<string, CeldaCalor>();
    const distribucion = [0, 0, 0, 0];
    let importeTotal = 0;
    let unidadesTotal = 0;

    for (const v of ventas) {
      const t = totalesVenta(v.items);
      const a = acum(v.vendedorId);
      a.ventas += 1;
      a.unidades += t.unidades;
      a.importe += t.importe;
      a.costo += t.costo;
      importeTotal += t.importe;
      unidadesTotal += t.unidades;
      distribucion[Math.min(t.unidades, 4) - 1]! += 1;

      const fecha = hoy(v.creadoEn);
      const clave = `${diaSemana(fecha)}-${horaLocal(v.creadoEn)}`;
      const c = calor.get(clave) ?? { dia: diaSemana(fecha), hora: horaLocal(v.creadoEn), ventas: 0, importe: 0 };
      c.ventas += 1;
      c.importe += t.importe;
      calor.set(clave, c);

      for (const pg of v.pagos) {
        // Los descuentos del medio de pago (efectivo, transferencia) restan, como en el Resumen; los recargos no suman.
        if (num(pg.ajuste) < 0) a.ganancia += num(pg.ajuste);
        const k = `${pg.medio}-${pg.cuotas}`;
        const m = porMedio.get(k) ?? { medio: pg.medio as MedioPago, cuotas: pg.cuotas, pagos: 0, cobrado: 0, ajuste: 0 };
        m.pagos += 1;
        m.cobrado += num(pg.cobrado);
        m.ajuste += num(pg.ajuste);
        porMedio.set(k, m);
      }
    }
    for (const v of ventasAnt) acum(v.vendedorId).importeAnterior += totalesVenta(v.items).importe;
    // Los cambios y devoluciones se le cuentan al vendedor que hizo la venta original: resta lo que
    // volvió y suma lo que se llevó a cambio (con su costo y el descuento del medio, si hubo).
    for (const c of cambios) {
      const a = acum(c.venta.vendedorId);
      for (const x of c.devueltos) {
        a.devueltas += x.cantidad;
        a.ganancia -= x.cantidad * (num(x.precioUnitario) - num(x.ventaItem.costoUnitario));
      }
      for (const l of c.llevados) a.ganancia += l.cantidad * (num(l.precioUnitario) - num(l.costoUnitario));
      for (const pg of c.pagos) if (num(pg.ajuste) < 0) a.ganancia += num(pg.ajuste);
    }

    const ordenMedio: MedioPago[] = ['EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA'];
    const anteriores = ventasAnt.map((v) => totalesVenta(v.items));
    const body: ReporteVentas = {
      ...p,
      porVendedor: [...porVendedor]
        .map(([id, a]): VentasVendedor => ({
          vendedorId: id,
          nombre: id === null ? SIN_VENDEDOR : (nombreVendedor.get(id) ?? SIN_VENDEDOR),
          ventas: a.ventas,
          unidades: a.unidades,
          importe: redondear(a.importe),
          ticketPromedio: a.ventas ? redondear(a.importe / a.ventas) : 0,
          ganancia: redondear(a.importe - a.costo + a.ganancia),
          devueltas: a.devueltas,
          importeAnterior: redondear(a.importeAnterior),
        }))
        .filter((v) => v.ventas || v.devueltas)
        .sort((x, y) => y.importe - x.importe),
      porMedio: [...porMedio.values()]
        .map((m) => ({ ...m, cobrado: redondear(m.cobrado), ajuste: redondear(m.ajuste) }))
        .sort((x, y) => ordenMedio.indexOf(x.medio) - ordenMedio.indexOf(y.medio) || x.cuotas - y.cuotas),
      calor: [...calor.values()].map((c) => ({ ...c, importe: redondear(c.importe) })).sort((x, y) => x.dia - y.dia || x.hora - y.hora),
      ticket: {
        ventas: ventas.length,
        promedio: ventas.length ? redondear(importeTotal / ventas.length) : 0,
        prendasPorVenta: ventas.length ? redondear(unidadesTotal / ventas.length) : 0,
        anterior: {
          ventas: anteriores.length,
          promedio: anteriores.length ? redondear(suma(anteriores.map((x) => x.importe)) / anteriores.length) : 0,
          prendasPorVenta: anteriores.length ? redondear(anteriores.reduce((s, x) => s + x.unidades, 0) / anteriores.length) : 0,
        },
        distribucion: ['1', '2', '3', '4 o más'].map((prendas, i) => ({ prendas, ventas: distribucion[i]! })),
      },
    };
    res.json(body);
  }),
);

// ---------------------------------------------------------------------------
// Mercadería
// ---------------------------------------------------------------------------

/** "Rotura o falla: se descosió" -> "Rotura o falla". Los ajustes guardan el motivo en el detalle. */
function motivoAjuste(detalle: string | null) {
  const base = (detalle ?? '').split(':')[0]!.trim();
  const conocidos = Object.values(MOTIVOS_AJUSTE).map((m) => m.replace(/ \(.*\)$/, ''));
  return conocidos.find((m) => m === base) ?? (base || 'Sin motivo');
}

reportesRouter.get(
  '/mercaderia',
  handler(async (req, res) => {
    const p = leerPeriodoQuery(req.query);
    const dias = diasEntre(p.desde, p.hasta);
    const [d, productos, compras, ajustes, ultimosProveedores] = await Promise.all([
      leerPeriodo(p),
      prisma.producto.findMany({
        select: {
          id: true,
          nombre: true,
          activo: true,
          precioCompra: true,
          precioVenta: true,
          tipo: { select: { nombre: true } },
          variantes: {
            select: {
              id: true,
              stock: true,
              activo: true,
              color: { select: { nombre: true } },
              talle: { select: { nombre: true, orden: true } },
            },
          },
        },
      }),
      prisma.ingresoItem.findMany({
        where: { ingreso: { fecha: { gte: aDate(p.desde), lte: aDate(p.hasta) } } },
        select: { cantidad: true, costoUnitario: true, ingreso: { select: { proveedor: { select: { id: true, nombre: true } } } } },
      }),
      prisma.movimientoStock.findMany({
        where: { tipo: 'AJUSTE', creadoEn: enRango(p) },
        select: { creadoEn: true, cantidad: true, detalle: true, varianteId: true },
        orderBy: { creadoEn: 'desc' },
      }),
      // Último proveedor que le vendió cada producto (para atribuirle las ventas).
      prisma.$queryRaw<{ productoId: number; proveedorId: number }[]>`
        SELECT DISTINCT ON (v.producto_id) v.producto_id AS "productoId", i.proveedor_id AS "proveedorId"
          FROM ingreso_items ii JOIN ingresos i ON i.id = ii.ingreso_id JOIN variantes v ON v.id = ii.variante_id
         WHERE i.proveedor_id IS NOT NULL
         ORDER BY v.producto_id, i.fecha DESC, i.id DESC`,
    ]);

    type Variante = (typeof productos)[number]['variantes'][number];
    const variantes = new Map<number, { v: Variante; p: (typeof productos)[number] }>();
    for (const pr of productos) for (const v of pr.variantes) variantes.set(v.id, { v, p: pr });
    const stockActivo = (pr: (typeof productos)[number]) => pr.variantes.reduce((s, v) => s + (v.activo ? v.stock : 0), 0);

    // Lo vendido (neto de devoluciones) por variante y por producto.
    type Acum = { unidades: number; importe: number; costo: number };
    const sumar = (m: Map<number, Acum>, id: number, r: Renglon) => {
      const a = m.get(id) ?? { unidades: 0, importe: 0, costo: 0 };
      a.unidades += r.unidades;
      a.importe += r.importe;
      a.costo += r.costo;
      m.set(id, a);
    };
    const porVariante = new Map<number, Acum>();
    const porProducto = new Map<number, Acum>();
    for (const r of d.renglones) {
      sumar(porVariante, r.varianteId, r);
      sumar(porProducto, r.productoId, r);
    }

    // Por tipo de prenda
    const tipos = new Map<string, MercaderiaTipo>();
    const tipo = (nombre: string) => {
      let t = tipos.get(nombre);
      if (!t) tipos.set(nombre, (t = { tipo: nombre, unidades: 0, importe: 0, costo: 0, ganancia: 0, margen: 0, stock: 0 }));
      return t;
    };
    for (const pr of productos) {
      const a = porProducto.get(pr.id);
      if (!a && !stockActivo(pr)) continue;
      const t = tipo(pr.tipo.nombre);
      t.stock += stockActivo(pr);
      if (a) {
        t.unidades += a.unidades;
        t.importe += a.importe;
        t.costo += a.costo;
      }
    }
    const porTipo = [...tipos.values()]
      .map((t) => ({
        ...t,
        importe: redondear(t.importe),
        costo: redondear(t.costo),
        ganancia: redondear(t.importe - t.costo),
        margen: porcentaje(t.importe - t.costo, t.importe),
      }))
      .sort((x, y) => y.unidades - x.unidades || y.stock - x.stock);

    // Talles y colores por tipo: lo vendido y lo que queda.
    const distribucion = (clave: (v: Variante) => { nombre: string; orden: number }): DistribucionTipo[] => {
      const porTipoNombre = new Map<string, Map<string, { nombre: string; orden: number; unidades: number; stock: number }>>();
      for (const { v, p: pr } of variantes.values()) {
        const vendidas = porVariante.get(v.id)?.unidades ?? 0;
        const stock = v.activo ? v.stock : 0;
        if (!vendidas && !stock) continue;
        const k = clave(v);
        let filas = porTipoNombre.get(pr.tipo.nombre);
        if (!filas) porTipoNombre.set(pr.tipo.nombre, (filas = new Map()));
        const f = filas.get(k.nombre) ?? { ...k, unidades: 0, stock: 0 };
        f.unidades += vendidas;
        f.stock += stock;
        filas.set(k.nombre, f);
      }
      return [...porTipoNombre]
        .map(([t, filas]) => ({
          tipo: t,
          unidades: [...filas.values()].reduce((s, f) => s + f.unidades, 0),
          filas: [...filas.values()]
            .sort((x, y) => x.orden - y.orden || y.unidades - x.unidades || x.nombre.localeCompare(y.nombre))
            .map(({ nombre, unidades, stock }) => ({ nombre, unidades, stock })),
        }))
        .sort((x, y) => y.unidades - x.unidades);
    };
    const talles = distribucion((v) => ({ nombre: v.talle.nombre, orden: v.talle.orden }));
    // Los colores se ordenan por lo vendido.
    const colores = distribucion((v) => ({ nombre: v.color.nombre, orden: 0 }));

    // Productos vendidos: margen, ritmo y cuánto dura el stock.
    const ritmo = (unidades: number) => unidades / dias;
    const cobertura = (stock: number, unidades: number) => (unidades > 0 ? Math.round(stock / ritmo(unidades)) : null);
    const productosVendidos: ProductoVendido[] = productos
      .filter((pr) => (porProducto.get(pr.id)?.unidades ?? 0) > 0)
      .map((pr) => {
        const a = porProducto.get(pr.id)!;
        const stock = stockActivo(pr);
        return {
          productoId: pr.id,
          producto: pr.nombre,
          tipo: pr.tipo.nombre,
          unidades: a.unidades,
          importe: redondear(a.importe),
          ganancia: redondear(a.importe - a.costo),
          margen: porcentaje(a.importe - a.costo, a.importe),
          stock,
          porDia: redondear(ritmo(a.unidades)),
          cobertura: cobertura(stock, a.unidades),
          variantes: pr.variantes
            .map((v) => ({ color: v.color.nombre, talle: v.talle.nombre, unidades: porVariante.get(v.id)?.unidades ?? 0, stock: v.activo ? v.stock : 0 }))
            .filter((v) => v.unidades > 0)
            .sort((x, y) => y.unidades - x.unidades),
        };
      })
      .sort((x, y) => y.unidades - x.unidades || y.importe - x.importe)
      .slice(0, 100);

    // Qué reponer: variantes que se venden y cuyo stock no llega a DIAS_REPOSICION días.
    const reponer: Reponer[] = [];
    for (const [id, a] of porVariante) {
      const x = variantes.get(id);
      if (!x || a.unidades <= 0 || !x.v.activo || !x.p.activo) continue;
      const cob = cobertura(x.v.stock, a.unidades)!;
      // redondear antes de ceil: 0,3 × 30 no siempre da 9 exacto en punto flotante.
      const sugerido = Math.ceil(redondear(ritmo(a.unidades) * DIAS_REPOSICION)) - x.v.stock;
      if (cob >= DIAS_REPOSICION || sugerido <= 0) continue;
      reponer.push({
        varianteId: id,
        productoId: x.p.id,
        producto: x.p.nombre,
        tipo: x.p.tipo.nombre,
        color: x.v.color.nombre,
        talle: x.v.talle.nombre,
        vendidas: a.unidades,
        stock: x.v.stock,
        cobertura: cob,
        sugerido,
      });
    }
    reponer.sort((x, y) => x.cobertura - y.cobertura || y.vendidas - x.vendidas);

    // Lo que no se vende
    const quietos = productos.filter((pr) => pr.activo && !((porProducto.get(pr.id)?.unidades ?? 0) > 0) && stockActivo(pr) > 0);
    const ultimas = await ultimaVenta(quietos.map((pr) => pr.id));
    const sinVentas: ProductoSinVentas[] = quietos
      .map((pr) => {
        const stock = stockActivo(pr);
        return {
          productoId: pr.id,
          producto: pr.nombre,
          tipo: pr.tipo.nombre,
          stock,
          valorStock: redondear(stock * num(pr.precioCompra)),
          ultimaVenta: ultimas.get(pr.id) ?? null,
        };
      })
      .sort((x, y) => y.valorStock - x.valorStock || y.stock - x.stock);

    // Proveedores: lo comprado en el período y lo vendido de sus productos.
    const nombreProveedor = new Map<number, string>();
    const provs = new Map<number | null, Omit<MercaderiaProveedor, 'proveedor' | 'margen' | 'ganancia'> & { costo: number }>();
    const prov = (id: number | null) => {
      let x = provs.get(id);
      if (!x) provs.set(id, (x = { proveedorId: id, comprado: 0, unidadesCompradas: 0, vendidas: 0, importe: 0, costo: 0 }));
      return x;
    };
    for (const c of compras) {
      const pv = c.ingreso.proveedor;
      if (pv) nombreProveedor.set(pv.id, pv.nombre);
      const x = prov(pv?.id ?? null);
      x.comprado += c.cantidad * num(c.costoUnitario);
      x.unidadesCompradas += c.cantidad;
    }
    const provDe = new Map(ultimosProveedores.map((r) => [Number(r.productoId), Number(r.proveedorId)]));
    for (const [productoId, a] of porProducto) {
      const x = prov(provDe.get(productoId) ?? null);
      x.vendidas += a.unidades;
      x.importe += a.importe;
      x.costo += a.costo;
    }
    const faltan = [...provs.keys()].filter((id): id is number => id !== null && !nombreProveedor.has(id));
    if (faltan.length) {
      for (const pv of await prisma.proveedor.findMany({ where: { id: { in: faltan } }, select: { id: true, nombre: true } })) {
        nombreProveedor.set(pv.id, pv.nombre);
      }
    }
    const porProveedor: MercaderiaProveedor[] = [...provs.values()]
      .map((x) => ({
        proveedorId: x.proveedorId,
        proveedor: x.proveedorId === null ? 'Sin proveedor' : (nombreProveedor.get(x.proveedorId) ?? 'Sin proveedor'),
        comprado: redondear(x.comprado),
        unidadesCompradas: x.unidadesCompradas,
        vendidas: x.vendidas,
        importe: redondear(x.importe),
        ganancia: redondear(x.importe - x.costo),
        margen: porcentaje(x.importe - x.costo, x.importe),
      }))
      .filter((x) => x.comprado || x.vendidas)
      .sort((x, y) => y.importe - x.importe || y.comprado - x.comprado);

    // Valor del stock de hoy
    const stockTipos = new Map<string, { tipo: string; unidades: number; costo: number; venta: number }>();
    for (const pr of productos) {
      const unidades = pr.variantes.reduce((s, v) => s + Math.max(0, v.stock), 0);
      if (!unidades) continue;
      const t = stockTipos.get(pr.tipo.nombre) ?? { tipo: pr.tipo.nombre, unidades: 0, costo: 0, venta: 0 };
      t.unidades += unidades;
      t.costo += unidades * num(pr.precioCompra);
      t.venta += unidades * num(pr.precioVenta);
      stockTipos.set(pr.tipo.nombre, t);
    }
    const stockPorTipo = [...stockTipos.values()]
      .map((t) => ({ ...t, costo: redondear(t.costo), venta: redondear(t.venta) }))
      .sort((x, y) => y.costo - x.costo);

    // Pérdidas: ajustes de stock con su motivo.
    const detalle: Perdida[] = ajustes.flatMap((a) => {
      const x = variantes.get(a.varianteId);
      if (!x) return [];
      return [
        {
          fecha: hoy(a.creadoEn),
          productoId: x.p.id,
          producto: `${x.p.tipo.nombre} ${x.p.nombre}`,
          color: x.v.color.nombre,
          talle: x.v.talle.nombre,
          cantidad: a.cantidad,
          motivo: motivoAjuste(a.detalle),
          valor: redondear(a.cantidad * num(x.p.precioCompra)),
        },
      ];
    });
    const motivos = new Map<string, { motivo: string; unidades: number; valor: number }>();
    for (const x of detalle) {
      const m = motivos.get(x.motivo) ?? { motivo: x.motivo, unidades: 0, valor: 0 };
      // En positivo = lo que se perdió.
      m.unidades -= x.cantidad;
      m.valor = redondear(m.valor - x.valor);
      motivos.set(x.motivo, m);
    }

    const body: ReporteMercaderia = {
      ...p,
      dias,
      porTipo,
      talles,
      colores,
      productos: productosVendidos,
      reponer,
      sinVentas,
      porProveedor,
      stock: {
        unidades: stockPorTipo.reduce((s, t) => s + t.unidades, 0),
        costo: suma(stockPorTipo.map((t) => t.costo)),
        venta: suma(stockPorTipo.map((t) => t.venta)),
        porTipo: stockPorTipo,
      },
      perdidas: {
        unidades: -detalle.reduce((s, x) => s + x.cantidad, 0),
        valor: -suma(detalle.map((x) => x.valor)) || 0,
        porMotivo: [...motivos.values()].sort((x, y) => y.valor - x.valor),
        detalle,
      },
    };
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

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

reportesRouter.get(
  '/clientes',
  handler(async (req, res) => {
    const p = leerPeriodoQuery(req.query);
    const { inactivos: diasInactivo } = validar(z.object({ inactivos: diasInactivoSchema }), req.query);
    const mesFin = p.hasta.slice(0, 7);
    const mesInicio = sumarMeses(mesFin, -11);
    const desdeMeses = `${mesInicio}-01` < p.desde ? `${mesInicio}-01` : p.desde;

    const [ventas, historia] = await Promise.all([
      // Ventas del período y de los últimos 12 meses (para nuevos y recurrentes).
      prisma.venta.findMany({
        where: { anulada: false, creadoEn: enRango({ desde: desdeMeses, hasta: p.hasta }) },
        select: {
          creadoEn: true,
          clienteId: true,
          items: { select: { cantidad: true, precioUnitario: true, descuentoPromo: true } },
        },
      }),
      // Toda la historia de cada cliente: primera y última compra, compras e importe.
      prisma.$queryRaw<{ clienteId: number; nombre: string; whatsapp: string | null; primera: Date; ultima: Date; compras: bigint; importe: unknown }[]>`
        SELECT c.id AS "clienteId", c.nombre, c.whatsapp,
               MIN(ve.creado_en) AS primera, MAX(ve.creado_en) AS ultima, COUNT(DISTINCT ve.id) AS compras,
               SUM(vi.cantidad * vi.precio_unitario - vi.descuento_promo) AS importe
          FROM clientes c JOIN ventas ve ON ve.cliente_id = c.id AND NOT ve.anulada
          JOIN venta_items vi ON vi.venta_id = ve.id
         GROUP BY c.id`,
    ]);
    const hist = new Map(historia.map((h) => [Number(h.clienteId), h]));

    const enPeriodo = ventas.filter((v) => hoy(v.creadoEn) >= p.desde);
    const porCliente = new Map<number, { compras: number; prendas: number; importe: number; ultima: Date }>();
    for (const v of enPeriodo) {
      if (v.clienteId === null) continue;
      const a = porCliente.get(v.clienteId) ?? { compras: 0, prendas: 0, importe: 0, ultima: v.creadoEn };
      a.compras += 1;
      for (const it of v.items) {
        a.prendas += it.cantidad;
        a.importe += it.cantidad * num(it.precioUnitario) - num(it.descuentoPromo);
      }
      if (v.creadoEn > a.ultima) a.ultima = v.creadoEn;
      porCliente.set(v.clienteId, a);
    }
    const mejores: ClienteReporte[] = [...porCliente]
      .map(([id, a]) => ({
        clienteId: id,
        nombre: hist.get(id)?.nombre ?? '',
        whatsapp: hist.get(id)?.whatsapp ?? null,
        compras: a.compras,
        prendas: a.prendas,
        importe: redondear(a.importe),
        ticketPromedio: redondear(a.importe / a.compras),
        ultima: hoy(a.ultima),
      }))
      .sort((x, y) => y.importe - x.importe || y.compras - x.compras)
      .slice(0, 50);

    const limite = sumarDias(hoy(), -diasInactivo);
    const inactivos: ClienteInactivo[] = historia
      .filter((h) => hoy(h.ultima) <= limite)
      .map((h) => ({
        clienteId: Number(h.clienteId),
        nombre: h.nombre,
        whatsapp: h.whatsapp,
        compras: Number(h.compras),
        importe: redondear(Number(h.importe)),
        ultima: hoy(h.ultima),
        dias: diasEntre(hoy(h.ultima), hoy()) - 1,
      }))
      .sort((x, y) => y.importe - x.importe)
      .slice(0, 200);

    const primeraCompra = (id: number) => (hist.get(id) ? hoy(hist.get(id)!.primera) : '');
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = sumarMeses(mesInicio, i);
      const delMes = ventas.filter((v) => hoy(v.creadoEn).startsWith(mes));
      const clientes = new Set(delMes.flatMap((v) => (v.clienteId === null ? [] : [v.clienteId])));
      const nuevos = [...clientes].filter((id) => primeraCompra(id).startsWith(mes)).length;
      return { mes, nuevos, recurrentes: clientes.size - nuevos, sinCliente: delMes.filter((v) => v.clienteId === null).length };
    });

    const body: ReporteClientes = {
      ...p,
      resumen: {
        ventas: enPeriodo.length,
        conCliente: enPeriodo.filter((v) => v.clienteId !== null).length,
        clientesDistintos: porCliente.size,
        nuevos: [...porCliente.keys()].filter((id) => primeraCompra(id) >= p.desde && primeraCompra(id) <= p.hasta).length,
      },
      mejores,
      inactivos: { dias: diasInactivo, clientes: inactivos },
      meses,
    };
    res.json(body);
  }),
);

// ---------------------------------------------------------------------------
// Cambios y devoluciones
// ---------------------------------------------------------------------------

reportesRouter.get(
  '/cambios',
  handler(async (req, res) => {
    const p = leerPeriodoQuery(req.query);
    const selectVariante = {
      productoId: true,
      producto: { select: { nombre: true, tipo: { select: { nombre: true } } } },
      talle: { select: { nombre: true, orden: true } },
    } as const;
    const [cambios, vendidos] = await Promise.all([
      prisma.cambio.findMany({
        where: { creadoEn: enRango(p) },
        select: {
          motivo: true,
          pagos: { select: { cobrado: true } },
          devueltos: { select: { cantidad: true, ventaItem: { select: { variante: { select: selectVariante } } } } },
          llevados: { select: { cantidad: true, variante: { select: selectVariante } } },
        },
      }),
      prisma.ventaItem.findMany({
        where: { venta: { anulada: false, creadoEn: enRango(p) } },
        select: { cantidad: true, variante: { select: selectVariante } },
      }),
    ]);

    type Tasa = CambiosTasa & { orden: number; productoId: number; tipo: string };
    const productos = new Map<number, Tasa>();
    const talles = new Map<string, Tasa>();
    type V = { productoId: number; producto: { nombre: string; tipo: { nombre: string } }; talle: { nombre: string; orden: number } };
    const contar = (v: V, campo: 'vendidas' | 'devueltas', n: number) => {
      const pr = productos.get(v.productoId) ?? {
        productoId: v.productoId,
        nombre: v.producto.nombre,
        tipo: v.producto.tipo.nombre,
        vendidas: 0,
        devueltas: 0,
        tasa: 0,
        orden: 0,
      };
      pr[campo] += n;
      productos.set(v.productoId, pr);
      const t = talles.get(v.talle.nombre) ?? { productoId: 0, nombre: v.talle.nombre, tipo: '', vendidas: 0, devueltas: 0, tasa: 0, orden: v.talle.orden };
      t[campo] += n;
      talles.set(v.talle.nombre, t);
    };
    for (const it of vendidos) contar(it.variante, 'vendidas', it.cantidad);

    const motivos = new Map<MotivoCambio | null, number>();
    const deTalle = new Map<string, { productoId: number; producto: string; de: string; a: string; veces: number }>();
    let unidadesDevueltas = 0;
    let devuelto = 0;
    for (const c of cambios) {
      const motivo = (c.motivo as MotivoCambio | null) ?? null;
      motivos.set(motivo, (motivos.get(motivo) ?? 0) + 1);
      for (const x of c.devueltos) {
        contar(x.ventaItem.variante, 'devueltas', x.cantidad);
        unidadesDevueltas += x.cantidad;
      }
      for (const pg of c.pagos) if (num(pg.cobrado) < 0) devuelto -= num(pg.cobrado);
      // Mismo producto, otro talle: "lo cambió de M a L". Se empareja prenda por prenda: primero se
      // descartan las que se llevaron en el mismo talle (cambio de color) y el resto se aparea en orden.
      const unidades = (xs: { cantidad: number; v: V }[]) => xs.flatMap((x) => Array.from({ length: x.cantidad }, () => x.v));
      const vuelven = unidades(c.devueltos.map((x) => ({ cantidad: x.cantidad, v: x.ventaItem.variante })));
      const salen = unidades(c.llevados.map((l) => ({ cantidad: l.cantidad, v: l.variante })));
      for (const productoId of new Set(vuelven.map((v) => v.productoId))) {
        const de = vuelven.filter((v) => v.productoId === productoId).map((v) => v.talle.nombre);
        const a = salen.filter((v) => v.productoId === productoId).map((v) => v.talle.nombre);
        for (const t of [...de]) {
          const i = a.indexOf(t);
          if (i === -1) continue;
          a.splice(i, 1);
          de.splice(de.indexOf(t), 1);
        }
        const producto = vuelven.find((v) => v.productoId === productoId)!.producto;
        for (let i = 0; i < Math.min(de.length, a.length); i++) {
          const k = `${productoId}|${de[i]}|${a[i]}`;
          const e = deTalle.get(k) ?? { productoId, producto: `${producto.tipo.nombre} ${producto.nombre}`, de: de[i]!, a: a[i]!, veces: 0 };
          e.veces += 1;
          deTalle.set(k, e);
        }
      }
    }

    const conTasa = (t: Tasa) => ({ ...t, tasa: porcentaje(t.devueltas, t.vendidas) });
    const unidadesVendidas = vendidos.reduce((s, it) => s + it.cantidad, 0);
    const body: ReporteCambios = {
      ...p,
      cambios: cambios.filter((c) => c.llevados.length > 0).length,
      devoluciones: cambios.filter((c) => c.llevados.length === 0).length,
      unidadesDevueltas,
      devuelto: redondear(devuelto),
      unidadesVendidas,
      tasa: porcentaje(unidadesDevueltas, unidadesVendidas),
      porMotivo: [...motivos].map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((x, y) => y.cantidad - x.cantidad),
      porProducto: [...productos.values()]
        .filter((x) => x.devueltas > 0)
        .map(conTasa)
        .map(({ productoId, nombre, tipo, vendidas, devueltas, tasa }) => ({ productoId, nombre, tipo, vendidas, devueltas, tasa }))
        .sort((x, y) => y.devueltas - x.devueltas || y.tasa - x.tasa),
      porTalle: [...talles.values()]
        .sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre))
        .map(conTasa)
        .map(({ nombre, vendidas, devueltas, tasa }) => ({ nombre, vendidas, devueltas, tasa })),
      cambiosDeTalle: [...deTalle.values()].sort((x, y) => y.veces - x.veces),
    };
    res.json(body);
  }),
);
