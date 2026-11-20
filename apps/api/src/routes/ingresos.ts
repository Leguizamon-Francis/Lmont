import { Router } from 'express';
import { idSchema, ingresoSchema, redondear, type IngresoDetalle, type ListaIngresos } from '@lmont/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { num, selectEncontrada, varianteEncontrada } from '../catalogo/serializar.js';
import { moverStock } from '../catalogo/stock.js';

export const ingresosRouter = Router();

type Tx = Prisma.TransactionClient;
const POR_PAGINA = 30;

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
/** Columna DATE: se guarda a medianoche UTC para que no cambie de día por la zona horaria. */
const aDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

const filtrosSchema = z.object({
  proveedorId: idSchema.optional(),
  pagina: z.coerce.number().int().positive().default(1),
});

ingresosRouter.get(
  '/',
  handler(async (req, res) => {
    const f = validar(filtrosSchema, req.query);
    const where: Prisma.IngresoWhereInput = f.proveedorId ? { proveedorId: f.proveedorId } : {};
    const [total, filas] = await Promise.all([
      prisma.ingreso.count({ where }),
      prisma.ingreso.findMany({
        where,
        orderBy: [{ fecha: 'desc' }, { id: 'desc' }],
        skip: (f.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          fecha: true,
          total: true,
          pagadoConCaja: true,
          proveedor: { select: { id: true, nombre: true, activo: true } },
          items: { select: { cantidad: true } },
        },
      }),
    ]);
    const body: ListaIngresos = {
      total,
      ingresos: filas.map((i) => ({
        id: i.id,
        fecha: fechaIso(i.fecha),
        proveedor: i.proveedor,
        total: num(i.total),
        unidades: i.items.reduce((s, it) => s + it.cantidad, 0),
        pagadoConCaja: i.pagadoConCaja,
      })),
    };
    res.json(body);
  }),
);

ingresosRouter.get(
  '/:id',
  handler(async (req, res) => {
    res.json(await buscarIngreso(prisma, validar(idSchema, req.params.id)));
  }),
);

/**
 * Registra un ingreso: suma stock a cada variante (con su movimiento) y, si el costo
 * de un producto cambió, actualiza su precio de compra y lo deja en el historial.
 */
ingresosRouter.post(
  '/',
  handler(async (req, res) => {
    const d = validar(ingresoSchema, req.body);
    const detalle = await prisma.$transaction(async (tx) => {
      if (d.proveedorId) {
        const prov = await tx.proveedor.findUnique({ where: { id: d.proveedorId } });
        if (!prov || !prov.activo) {
          throw new HttpError(400, 'Elegí un proveedor de la lista', { proveedorId: 'Elegí un proveedor de la lista' });
        }
      }

      const ids = d.items.map((it) => it.varianteId);
      const variantes = await tx.variante.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          producto: { select: { id: true, nombre: true, precioCompra: true, precioVenta: true, tipo: { select: { nombre: true } } } },
        },
      });
      if (variantes.length !== ids.length) {
        throw new HttpError(400, 'Alguna de las prendas ya no existe. Recargá la página y probá de nuevo.');
      }
      const productoDe = new Map(variantes.map((v) => [v.id, v.producto]));

      // Un solo costo por modelo en cada ingreso.
      const costoPorProducto = new Map<number, number>();
      for (const it of d.items) {
        const p = productoDe.get(it.varianteId)!;
        const previo = costoPorProducto.get(p.id);
        if (previo !== undefined && previo !== it.costoUnitario) {
          throw new HttpError(400, `${p.tipo.nombre} ${p.nombre} tiene costos distintos: usá un solo costo por modelo`);
        }
        costoPorProducto.set(p.id, it.costoUnitario);
      }

      const total = redondear(d.items.reduce((s, it) => s + it.cantidad * it.costoUnitario, 0));
      const ingreso = await tx.ingreso.create({
        data: {
          fecha: aDate(d.fecha),
          proveedorId: d.proveedorId ?? null,
          pagadoConCaja: d.pagadoConCaja,
          nota: d.nota,
          total,
          items: { create: d.items.map((it) => ({ varianteId: it.varianteId, cantidad: it.cantidad, costoUnitario: it.costoUnitario })) },
        },
        select: { id: true },
      });
      for (const it of d.items) {
        await moverStock(tx, it.varianteId, it.cantidad, 'INGRESO', { ingresoId: ingreso.id });
      }

      const preciosActualizados: NonNullable<IngresoDetalle['preciosActualizados']> = [];
      const productos = new Map(variantes.map((v) => [v.producto.id, v.producto]));
      for (const [productoId, costo] of costoPorProducto) {
        const p = productos.get(productoId)!;
        if (num(p.precioCompra) === costo) continue;
        await tx.producto.update({ where: { id: productoId }, data: { precioCompra: costo } });
        await tx.precioHistorial.create({ data: { productoId, precioCompra: costo, precioVenta: p.precioVenta } });
        preciosActualizados.push({ productoId, nombre: `${p.tipo.nombre} ${p.nombre}`, antes: num(p.precioCompra), ahora: costo });
      }

      return { ...(await buscarIngreso(tx, ingreso.id)), preciosActualizados };
    });
    res.status(201).json(detalle);
  }),
);

async function buscarIngreso(db: Tx, id: number): Promise<IngresoDetalle> {
  const i = await db.ingreso.findUnique({
    where: { id },
    select: {
      id: true,
      fecha: true,
      total: true,
      pagadoConCaja: true,
      nota: true,
      creadoEn: true,
      proveedor: { select: { id: true, nombre: true, activo: true } },
      items: {
        select: { id: true, cantidad: true, costoUnitario: true, variante: { select: selectEncontrada } },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!i) throw noEncontrado('el ingreso');
  return {
    id: i.id,
    fecha: fechaIso(i.fecha),
    proveedor: i.proveedor,
    total: num(i.total),
    unidades: i.items.reduce((s, it) => s + it.cantidad, 0),
    pagadoConCaja: i.pagadoConCaja,
    nota: i.nota,
    creadoEn: i.creadoEn.toISOString(),
    items: i.items.map((it) => ({
      id: it.id,
      cantidad: it.cantidad,
      costoUnitario: num(it.costoUnitario),
      variante: varianteEncontrada(it.variante),
    })),
  };
}
