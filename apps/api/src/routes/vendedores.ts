import { Router } from 'express';
import { idSchema, vendedorSchema } from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, noEncontrado, validar } from '../http/errors.js';

export const vendedoresRouter = Router();

const select = { id: true, nombre: true, activo: true } as const;

vendedoresRouter.get(
  '/',
  handler(async (req, res) => {
    const soloActivos = req.query.activos === '1';
    const vendedores = await prisma.vendedor.findMany({
      where: soloActivos ? { activo: true } : undefined,
      orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
      select,
    });
    res.json(vendedores);
  }),
);

vendedoresRouter.post(
  '/',
  handler(async (req, res) => {
    const data = validar(vendedorSchema, req.body);
    const v = await prisma.vendedor.create({ data, select });
    res.status(201).json(v);
  }),
);

vendedoresRouter.put(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const data = validar(vendedorSchema, req.body);
    const existe = await prisma.vendedor.findUnique({ where: { id } });
    if (!existe) throw noEncontrado('el vendedor');
    const v = await prisma.vendedor.update({ where: { id }, data, select });
    res.json(v);
  }),
);
