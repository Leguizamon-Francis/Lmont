import { Router } from 'express';
import { prisma } from '../db.js';
import { handler } from '../http/errors.js';
import { ordenVariantes, selectEncontrada, varianteEncontrada } from '../catalogo/serializar.js';

export const stockRouter = Router();

/**
 * Variantes activas (de productos activos) con stock en o por debajo del mínimo.
 * Con `sinStock=1` incluye también las que están en 0 aunque no tengan mínimo.
 */
stockRouter.get(
  '/bajo',
  handler(async (req, res) => {
    const sinStock = req.query.sinStock === '1';
    const candidatas = await prisma.variante.findMany({
      where: {
        activo: true,
        producto: { activo: true },
        OR: [{ stockMinimo: { gt: 0 } }, ...(sinStock ? [{ stock: 0 }] : [])],
      },
      select: selectEncontrada,
      orderBy: [{ producto: { tipo: { nombre: 'asc' } } }, { producto: { nombre: 'asc' } }, ...ordenVariantes],
    });
    // Prisma no compara dos columnas entre sí: el filtro stock <= mínimo se hace acá (son pocas filas).
    const bajas = candidatas.filter((v) => v.stock === 0 || v.stock <= v.stockMinimo);
    res.json(bajas.map(varianteEncontrada));
  }),
);

/** Resumen para la pantalla de inicio. */
stockRouter.get(
  '/resumen',
  handler(async (_req, res) => {
    const [r] = await prisma.$queryRaw<{ bajo: bigint; sin_stock: bigint; unidades: bigint | null }[]>`
      SELECT
        COUNT(*) FILTER (WHERE v.stock_minimo > 0 AND v.stock <= v.stock_minimo) AS bajo,
        COUNT(*) FILTER (WHERE v.stock = 0) AS sin_stock,
        SUM(v.stock) AS unidades
      FROM variantes v JOIN productos p ON p.id = v.producto_id
      WHERE v.activo AND p.activo`;
    res.json({ stockBajo: Number(r?.bajo ?? 0), sinStock: Number(r?.sin_stock ?? 0), unidades: Number(r?.unidades ?? 0) });
  }),
);
