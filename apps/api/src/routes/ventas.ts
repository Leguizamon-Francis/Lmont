import { Router } from 'express';
import { z } from 'zod';
import {
  anularVentaSchema,
  hoy,
  idSchema,
  rangoDelDia,
  redondear,
  subtotalVenta,
  ventaSchema,
  type ListaVentas,
  type MedioPago,
  type VentaResumen,
} from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import { moverStock } from '../catalogo/stock.js';
import { calcularPagos, prendasVendibles, verificarStock } from '../ventas/salida.js';
import { buscarVenta, resumenVenta, selectResumenVenta } from '../ventas/detalle.js';

export const ventasRouter = Router();

const filtrosSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional()
    .transform((v) => v ?? hoy()),
});

/** Ventas de un día (por defecto hoy) con los totales por medio de pago. Las anuladas no suman. */
ventasRouter.get(
  '/',
  handler(async (req, res) => {
    const { fecha } = validar(filtrosSchema, req.query);
    const { desde, hasta } = rangoDelDia(fecha);
    const filas = await prisma.venta.findMany({
      where: { creadoEn: { gte: desde, lt: hasta } },
      orderBy: { creadoEn: 'desc' },
      select: selectResumenVenta,
    });
    const ventas = filas.map(resumenVenta);
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

const buscarSchema = z
  .object({ varianteId: idSchema.optional(), clienteId: idSchema.optional() })
  .refine((d) => d.varianteId || d.clienteId, 'Indicá la prenda o el cliente');

/**
 * Para cambios y devoluciones: ventas (no anuladas) que incluyen una prenda o que son de un
 * cliente, de la más nueva a la más vieja.
 */
ventasRouter.get(
  '/buscar',
  handler(async (req, res) => {
    const { varianteId, clienteId } = validar(buscarSchema, req.query);
    const filas = await prisma.venta.findMany({
      where: { anulada: false, clienteId, items: varianteId ? { some: { varianteId } } : undefined },
      orderBy: { creadoEn: 'desc' },
      take: 30,
      select: selectResumenVenta,
    });
    const body: VentaResumen[] = filas.map(resumenVenta);
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
      if (d.clienteId) {
        const cli = await tx.cliente.findUnique({ where: { id: d.clienteId } });
        if (!cli || !cli.activo) throw new HttpError(400, 'Elegí un cliente de la lista', { clienteId: 'Elegí un cliente de la lista' });
      }

      const porId = await prendasVendibles(tx, d.items.map((it) => it.varianteId));
      await verificarStock(tx, d.items, porId);
      const pagos = await calcularPagos(tx, d.pagos);

      const venta = await tx.venta.create({
        data: {
          vendedorId: d.vendedorId ?? null,
          clienteId: d.clienteId ?? null,
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
      // Si ya hubo cambios, anularla (el UPDATE de arriba ya bloqueó la venta) devolvería al stock prendas que ya volvieron (o que el cliente se llevó en el cambio).
      if (await tx.cambio.count({ where: { ventaId: id } })) {
        throw new HttpError(409, 'Esta venta tiene cambios o devoluciones registrados y ya no se puede anular');
      }
      const items = await tx.ventaItem.findMany({ where: { ventaId: id }, orderBy: { varianteId: 'asc' } });
      for (const it of items) await moverStock(tx, it.varianteId, it.cantidad, 'ANULACION_VENTA', { ventaId: id, detalle: motivo });
      return buscarVenta(tx, id);
    });
    res.json(detalle);
  }),
);

