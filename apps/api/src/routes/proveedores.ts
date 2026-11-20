import { Router } from 'express';
import { idSchema, proveedorSchema } from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, noEncontrado, validar } from '../http/errors.js';

export const proveedoresRouter = Router();

const select = { id: true, nombre: true, whatsapp: true, notas: true, activo: true } as const;

proveedoresRouter.get(
  '/',
  handler(async (req, res) => {
    const soloActivos = req.query.activos === '1';
    res.json(
      await prisma.proveedor.findMany({
        where: soloActivos ? { activo: true } : undefined,
        orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
        select,
      }),
    );
  }),
);

proveedoresRouter.post(
  '/',
  handler(async (req, res) => {
    const data = validar(proveedorSchema, req.body);
    res.status(201).json(await prisma.proveedor.create({ data, select }));
  }),
);

proveedoresRouter.put(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const data = validar(proveedorSchema, req.body);
    if (!(await prisma.proveedor.findUnique({ where: { id } }))) throw noEncontrado('el proveedor');
    res.json(await prisma.proveedor.update({ where: { id }, data, select }));
  }),
);
