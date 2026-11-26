import { Router } from 'express';
import { z } from 'zod';
import { idSchema, promocionSchema, promoVigente, type Promocion } from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';
import type { Prisma } from '../generated/prisma/client.js';

export const promocionesRouter = Router();

type Db = Prisma.TransactionClient;
const ITEM = { select: { id: true, nombre: true, activo: true } } as const;
const fechaIso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const aDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

const select = {
  id: true,
  nombre: true,
  modo: true,
  precio: true,
  pagaCantidad: true,
  desde: true,
  hasta: true,
  activo: true,
  componentes: {
    select: { cantidad: true, tipo: ITEM, producto: { select: { id: true, nombre: true, tipo: ITEM } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PromocionSelect;

function promocion(p: Prisma.PromocionGetPayload<{ select: typeof select }>): Promocion {
  return { ...p, precio: p.precio ? num(p.precio) : null, desde: fechaIso(p.desde), hasta: fechaIso(p.hasta) };
}

/** Promos que se pueden usar hoy en una venta. */
export async function promocionesVigentes(db: Db): Promise<Promocion[]> {
  const filas = await db.promocion.findMany({ where: { activo: true, eliminada: false }, select, orderBy: { nombre: 'asc' } });
  return filas.map(promocion).filter((p) => promoVigente(p));
}

promocionesRouter.get(
  '/',
  handler(async (req, res) => {
    const { vigentes } = validar(z.object({ vigentes: z.literal('1').optional() }), req.query);
    if (vigentes) {
      res.json(await promocionesVigentes(prisma));
      return;
    }
    const [filas, vendidas] = await Promise.all([
      prisma.promocion.findMany({ where: { eliminada: false }, select, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] }),
      prisma.ventaPromocion.groupBy({ by: ['promocionId'], where: { venta: { anulada: false } }, _sum: { veces: true } }),
    ]);
    const body: Promocion[] = filas.map((p) => ({ ...promocion(p), vendidas: vendidas.find((v) => v.promocionId === p.id)?._sum.veces ?? 0 }));
    res.json(body);
  }),
);

async function datos(d: z.output<typeof promocionSchema>) {
  const productos = d.componentes.flatMap((c) => (c.productoId ? [c.productoId] : []));
  const tipos = d.componentes.flatMap((c) => (c.tipoId ? [c.tipoId] : []));
  if (productos.length && (await prisma.producto.count({ where: { id: { in: productos } } })) !== productos.length) {
    throw new HttpError(400, 'Elegí los productos de la lista');
  }
  if (tipos.length && (await prisma.tipoPrenda.count({ where: { id: { in: tipos } } })) !== tipos.length) {
    throw new HttpError(400, 'Elegí los tipos de prenda de la lista');
  }
  return {
    nombre: d.nombre,
    modo: d.modo,
    precio: d.precio,
    pagaCantidad: d.pagaCantidad,
    desde: aDate(d.desde),
    hasta: aDate(d.hasta),
    activo: d.activo,
    componentes: { create: d.componentes.map((c) => ({ productoId: c.productoId, tipoId: c.tipoId, cantidad: c.cantidad })) },
  };
}

promocionesRouter.post(
  '/',
  handler(async (req, res) => {
    const d = validar(promocionSchema, req.body);
    const p = await prisma.promocion.create({ data: await datos(d), select });
    res.status(201).json(promocion(p));
  }),
);

/**
 * Editar no cambia las ventas ya hechas: cada venta guarda el nombre, el precio y el
 * descuento que se aplicaron en ese momento.
 */
promocionesRouter.put(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const d = validar(promocionSchema, req.body);
    if (!(await prisma.promocion.findUnique({ where: { id, eliminada: false }, select: { id: true } }))) throw noEncontrado('la promoción');
    const data = await datos(d);
    const p = await prisma.$transaction(async (tx) => {
      await tx.promocionComponente.deleteMany({ where: { promocionId: id } });
      return tx.promocion.update({ where: { id }, data, select });
    });
    res.json(promocion(p));
  }),
);

/**
 * Eliminar: si nunca se usó, se borra. Si ya se vendió, las ventas la necesitan, así que queda guardada
 * como eliminada (no aparece más en la lista ni al vender) y se le cambia el nombre para que se pueda
 * volver a crear una con el mismo. Las ventas y los reportes usan el nombre que se guardó en cada venta.
 */
promocionesRouter.delete(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const p = await prisma.promocion.findUnique({ where: { id, eliminada: false }, select: { nombre: true, _count: { select: { ventas: true } } } });
    if (!p) throw noEncontrado('la promoción');
    if (p._count.ventas === 0) {
      await prisma.promocion.delete({ where: { id } });
    } else {
      await prisma.promocion.update({ where: { id }, data: { eliminada: true, activo: false, nombre: `${p.nombre} (eliminada #${id})` } });
    }
    res.status(204).end();
  }),
);
