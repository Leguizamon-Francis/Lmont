import { Router } from 'express';
import { z } from 'zod';
import {
  anularVentaSchema,
  aplicarPorcentaje,
  hoy,
  idSchema,
  nombrePlan,
  rangoDelDia,
  redondear,
  subtotalVenta,
  ventaSchema,
  type ListaVentas,
  type MedioPago,
  type VentaDetalle,
  type VentaResumen,
} from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { num, selectEncontrada, varianteEncontrada } from '../catalogo/serializar.js';
import { bloquearVariante, moverStock } from '../catalogo/stock.js';

export const ventasRouter = Router();

type Tx = Prisma.TransactionClient;

const filtrosSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional()
    .transform((v) => v ?? hoy()),
});

const selectResumen = {
  id: true,
  creadoEn: true,
  subtotal: true,
  total: true,
  anulada: true,
  vendedor: { select: { id: true, nombre: true } },
  pagos: { select: { medio: true, cuotas: true, cobrado: true }, orderBy: { id: 'asc' } },
  items: {
    select: { cantidad: true, variante: { select: { producto: { select: { nombre: true, tipo: { select: { nombre: true } } } } } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.VentaSelect;

function resumen(v: Prisma.VentaGetPayload<{ select: typeof selectResumen }>): VentaResumen {
  const nombres = [...new Set(v.items.map((it) => `${it.variante.producto.tipo.nombre} ${it.variante.producto.nombre}`))];
  const descripcion = nombres.length > 3 ? `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más` : nombres.join(', ');
  return {
    id: v.id,
    creadoEn: v.creadoEn.toISOString(),
    vendedor: v.vendedor,
    unidades: v.items.reduce((s, it) => s + it.cantidad, 0),
    descripcion,
    subtotal: num(v.subtotal),
    total: num(v.total),
    pagos: v.pagos.map((p) => ({ medio: p.medio, cuotas: p.cuotas, cobrado: num(p.cobrado) })),
    anulada: v.anulada,
  };
}

/** Ventas de un día (por defecto hoy) con los totales por medio de pago. Las anuladas no suman. */
ventasRouter.get(
  '/',
  handler(async (req, res) => {
    const { fecha } = validar(filtrosSchema, req.query);
    const { desde, hasta } = rangoDelDia(fecha);
    const filas = await prisma.venta.findMany({
      where: { creadoEn: { gte: desde, lt: hasta } },
      orderBy: { creadoEn: 'desc' },
      select: selectResumen,
    });
    const ventas = filas.map(resumen);
    const validas = ventas.filter((v) => !v.anulada);
    const porMedio = new Map<MedioPago, number>();
    for (const v of validas) for (const p of v.pagos) porMedio.set(p.medio, redondear((porMedio.get(p.medio) ?? 0) + p.cobrado));
    const body: ListaVentas = {
      fecha,
      ventas,
      totales: {
        ventas: validas.length,
        unidades: validas.reduce((s, v) => s + v.unidades, 0),
        total: redondear(validas.reduce((s, v) => s + v.total, 0)),
        porMedio: [...porMedio].map(([medio, total]) => ({ medio, total })),
      },
    };
    res.json(body);
  }),
);

ventasRouter.get(
  '/:id',
  handler(async (req, res) => {
    res.json(await buscarVenta(prisma, validar(idSchema, req.params.id)));
  }),
);

/**
 * Registra una venta: descuenta el stock de cada prenda (nunca por debajo de 0),
 * guarda el precio cobrado y el costo de ese momento, y aplica el recargo o descuento
 * configurado para cada medio de pago. Todo o nada: si algo falla no cambia nada.
 */
ventasRouter.post(
  '/',
  handler(async (req, res) => {
    const d = validar(ventaSchema, req.body);
    const detalle = await prisma.$transaction(async (tx) => {
      if (d.vendedorId) {
        const vend = await tx.vendedor.findUnique({ where: { id: d.vendedorId } });
        if (!vend || !vend.activo) throw new HttpError(400, 'Elegí un vendedor de la lista', { vendedorId: 'Elegí un vendedor de la lista' });
      }

      const ids = d.items.map((it) => it.varianteId);
      const variantes = await tx.variante.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          activo: true,
          color: { select: { nombre: true } },
          talle: { select: { nombre: true } },
          producto: { select: { nombre: true, activo: true, precioCompra: true, precioVenta: true, tipo: { select: { nombre: true } } } },
        },
      });
      if (variantes.length !== ids.length) {
        throw new HttpError(400, 'Alguna de las prendas ya no existe. Recargá la página y probá de nuevo.');
      }
      const porId = new Map(variantes.map((v) => [v.id, v]));
      const nombre = (v: (typeof variantes)[number]) => `${v.producto.tipo.nombre} ${v.producto.nombre} ${v.color.nombre} ${v.talle.nombre}`;

      const inactivas = variantes.filter((v) => !v.activo || !v.producto.activo);
      if (inactivas.length) {
        throw new HttpError(400, `${inactivas.map(nombre).join(', ')} está desactivado y no se puede vender`);
      }

      // Bloqueamos las filas en orden de id (evita bloqueos cruzados entre dos ventas a la vez)
      // y revisamos todo el stock antes de tocar nada, para avisar de todas las faltas juntas.
      const faltantes: string[] = [];
      for (const id of [...ids].sort((a, b) => a - b)) {
        const stock = (await bloquearVariante(tx, id))!;
        const pedido = d.items.find((it) => it.varianteId === id)!.cantidad;
        if (pedido > stock) faltantes.push(`${nombre(porId.get(id)!)} (${stock === 0 ? 'no queda ninguna' : `quedan ${stock}`})`);
      }
      if (faltantes.length) throw new HttpError(409, `No hay stock suficiente de ${faltantes.join(', ')}`);

      const planes = await tx.planPago.findMany({ where: { activo: true } });
      const pagos = d.pagos.map((p) => {
        const plan = planes.find((x) => x.medio === p.medio && x.cuotas === p.cuotas);
        if (!plan) {
          throw new HttpError(400, `El pago con ${nombrePlan(p)} no está habilitado. Revisá los medios de pago en Configuración.`);
        }
        const porcentaje = num(plan.porcentaje);
        return { ...p, porcentaje, ...aplicarPorcentaje(p.monto, porcentaje) };
      });

      const venta = await tx.venta.create({
        data: {
          vendedorId: d.vendedorId ?? null,
          nota: d.nota,
          subtotal: subtotalVenta(d.items),
          total: redondear(pagos.reduce((s, p) => s + p.cobrado, 0)),
          items: {
            create: d.items.map((it) => {
              const p = porId.get(it.varianteId)!.producto;
              return { varianteId: it.varianteId, cantidad: it.cantidad, precioUnitario: it.precioUnitario, precioLista: p.precioVenta, costoUnitario: p.precioCompra };
            }),
          },
          pagos: { create: pagos },
        },
        select: { id: true },
      });
      for (const it of d.items) await moverStock(tx, it.varianteId, -it.cantidad, 'VENTA', { ventaId: venta.id });
      return buscarVenta(tx, venta.id);
    });
    res.status(201).json(detalle);
  }),
);

/** Anula una venta cargada por error: devuelve el stock y deja de sumar en los totales. */
ventasRouter.post(
  '/:id/anular',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const { motivo } = validar(anularVentaSchema, req.body);
    const detalle = await prisma.$transaction(async (tx) => {
      const r = await tx.venta.updateMany({ where: { id, anulada: false }, data: { anulada: true, anuladaEn: new Date(), motivoAnulacion: motivo } });
      if (r.count === 0) {
        if (!(await tx.venta.findUnique({ where: { id }, select: { id: true } }))) throw noEncontrado('la venta');
        throw new HttpError(409, 'Esta venta ya estaba anulada');
      }
      const items = await tx.ventaItem.findMany({ where: { ventaId: id }, orderBy: { varianteId: 'asc' } });
      for (const it of items) await moverStock(tx, it.varianteId, it.cantidad, 'ANULACION_VENTA', { ventaId: id, detalle: motivo });
      return buscarVenta(tx, id);
    });
    res.json(detalle);
  }),
);

async function buscarVenta(db: Tx, id: number): Promise<VentaDetalle> {
  const v = await db.venta.findUnique({
    where: { id },
    select: {
      ...selectResumen,
      nota: true,
      anuladaEn: true,
      motivoAnulacion: true,
      pagos: { orderBy: { id: 'asc' } },
      items: {
        select: { id: true, cantidad: true, precioLista: true, precioUnitario: true, variante: { select: selectEncontrada } },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!v) throw noEncontrado('la venta');
  const base = resumen({
    ...v,
    pagos: v.pagos,
    items: v.items.map((it) => ({ cantidad: it.cantidad, variante: { producto: it.variante.producto } })),
  });
  return {
    ...base,
    nota: v.nota,
    anuladaEn: v.anuladaEn?.toISOString() ?? null,
    motivoAnulacion: v.motivoAnulacion,
    items: v.items.map((it) => ({
      id: it.id,
      cantidad: it.cantidad,
      precioLista: num(it.precioLista),
      precioUnitario: num(it.precioUnitario),
      variante: varianteEncontrada(it.variante),
    })),
    pagos: v.pagos.map((p) => ({
      id: p.id,
      medio: p.medio,
      cuotas: p.cuotas,
      monto: num(p.monto),
      porcentaje: num(p.porcentaje),
      ajuste: num(p.ajuste),
      cobrado: num(p.cobrado),
    })),
  };
}
