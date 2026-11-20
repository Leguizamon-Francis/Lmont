import { Router } from 'express';
import { calcularCambio, cambioSchema, errorPagosCambio, type CambioResumen } from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';
import { bloquearVariante, moverStock } from '../catalogo/stock.js';
import { buscarVenta, resumenCambio, selectResumenCambio } from '../ventas/detalle.js';
import { calcularPagos, nombreVariante, prendasVendibles, verificarStock } from '../ventas/salida.js';

export const cambiosRouter = Router();

/** Últimos cambios y devoluciones. */
cambiosRouter.get(
  '/',
  handler(async (_req, res) => {
    const filas = await prisma.cambio.findMany({ orderBy: { creadoEn: 'desc' }, take: 30, select: selectResumenCambio });
    const body: CambioResumen[] = filas.map(resumenCambio);
    res.json(body);
  }),
);

/**
 * Registra un cambio o una devolución sobre una venta:
 * - lo que vuelve suma stock (solo prendas de esa venta y no más de las vendidas);
 * - lo que se lleva descuenta stock (nunca por debajo de 0);
 * - la diferencia se cobra o se le devuelve al cliente.
 * Todo o nada: si algo falla no cambia nada.
 */
cambiosRouter.post(
  '/',
  handler(async (req, res) => {
    const d = validar(cambioSchema, req.body);
    const detalle = await prisma.$transaction(async (tx) => {
      // Bloquea la venta: dos cambios a la vez sobre la misma venta no pueden devolver de más,
      // y no se puede anular mientras tanto.
      const [venta] = await tx.$queryRaw<{ anulada: boolean }[]>`SELECT anulada FROM ventas WHERE id = ${d.ventaId} FOR UPDATE`;
      if (!venta) throw noEncontrado('la venta');
      if (venta.anulada) throw new HttpError(409, 'Esta venta está anulada: no se pueden hacer cambios ni devoluciones');

      if (d.vendedorId) {
        const vend = await tx.vendedor.findUnique({ where: { id: d.vendedorId } });
        if (!vend || !vend.activo) throw new HttpError(400, 'Elegí un vendedor de la lista', { vendedorId: 'Elegí un vendedor de la lista' });
      }

      // --- Lo que vuelve ---
      const vendidos = await tx.ventaItem.findMany({
        where: { ventaId: d.ventaId, id: { in: d.devueltos.map((x) => x.ventaItemId) } },
        select: {
          id: true,
          varianteId: true,
          cantidad: true,
          precioUnitario: true,
          devoluciones: { select: { cantidad: true } },
          variante: { select: { color: { select: { nombre: true } }, talle: { select: { nombre: true } }, producto: { select: { nombre: true, tipo: { select: { nombre: true } } } } } },
        },
      });
      if (vendidos.length !== d.devueltos.length) {
        throw new HttpError(400, 'Solo se puede devolver lo que se vendió en esta venta');
      }
      const porItem = new Map(vendidos.map((v) => [v.id, v]));
      const devueltos = d.devueltos.map((x) => {
        const it = porItem.get(x.ventaItemId)!;
        const yaDevueltas = it.devoluciones.reduce((s, dv) => s + dv.cantidad, 0);
        const quedan = it.cantidad - yaDevueltas;
        if (x.cantidad > quedan) {
          const nombre = nombreVariante(it.variante);
          throw new HttpError(
            400,
            quedan === 0
              ? `${nombre} ya se devolvió completo`
              : `De ${nombre} se ${it.cantidad === 1 ? 'vendió 1' : `vendieron ${it.cantidad}`}${yaDevueltas ? ` y ya ${yaDevueltas === 1 ? 'volvió 1' : `volvieron ${yaDevueltas}`}` : ''}: puede devolver hasta ${quedan}`,
          );
        }
        return { ...x, varianteId: it.varianteId, precioUnitario: num(it.precioUnitario) };
      });

      // --- Lo que se lleva ---
      const porId = d.llevados.length ? await prendasVendibles(tx, d.llevados.map((x) => x.varianteId)) : new Map();

      const { totalDevuelto, totalLlevado, diferencia } = calcularCambio(devueltos, d.llevados);
      const error = errorPagosCambio(diferencia, d.pagos, d.medioReintegro);
      if (error) throw new HttpError(400, error, { pagos: error });
      const pagos =
        diferencia > 0
          ? await calcularPagos(tx, d.pagos)
          : diferencia < 0
            ? [{ medio: d.medioReintegro!, cuotas: 1, monto: diferencia, porcentaje: 0, ajuste: 0, cobrado: diferencia }]
            : [];

      // Bloqueamos todas las prendas involucradas en orden de id antes de mover nada.
      const involucradas = [...new Set([...devueltos.map((x) => x.varianteId), ...d.llevados.map((x) => x.varianteId)])].sort((a, b) => a - b);
      for (const id of involucradas) await bloquearVariante(tx, id);

      const cambio = await tx.cambio.create({
        data: {
          ventaId: d.ventaId,
          vendedorId: d.vendedorId ?? null,
          nota: d.nota,
          totalDevuelto,
          totalLlevado,
          diferencia,
          devueltos: { create: devueltos.map((x) => ({ ventaItemId: x.ventaItemId, cantidad: x.cantidad, precioUnitario: x.precioUnitario })) },
          llevados: {
            create: d.llevados.map((x) => {
              const p = porId.get(x.varianteId)!.producto;
              return { varianteId: x.varianteId, cantidad: x.cantidad, precioUnitario: x.precioUnitario, precioLista: p.precioVenta, costoUnitario: p.precioCompra };
            }),
          },
          pagos: { create: pagos },
        },
        select: { id: true },
      });

      // Primero vuelve lo devuelto (si cambia por la misma prenda, esa unidad ya cuenta), después sale lo nuevo.
      const extra = { ventaId: d.ventaId, cambioId: cambio.id };
      for (const x of devueltos) await moverStock(tx, x.varianteId, x.cantidad, 'DEVOLUCION', extra);
      if (d.llevados.length) {
        await verificarStock(tx, d.llevados, porId);
        for (const x of d.llevados) await moverStock(tx, x.varianteId, -x.cantidad, 'CAMBIO', extra);
      }
      return buscarVenta(tx, d.ventaId);
    });
    res.status(201).json(detalle);
  }),
);
