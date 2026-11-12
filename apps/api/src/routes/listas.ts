import { Router } from 'express';
import { colorSchema, idSchema, ordenTallesSchema, talleSchema, tipoPrendaSchema } from '@lmont/shared';
import type { ZodType } from 'zod';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';

/** Lo mínimo que usamos de un modelo de Prisma para las listas simples. */
type Delegate = {
  findMany(args: object): Promise<unknown[]>;
  findUnique(args: object): Promise<unknown>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
};

/**
 * Router de una lista administrable (nombre + activo): listar, crear y editar.
 * No se borran: se desactivan para que no aparezcan al cargar productos nuevos.
 */
function routerLista(opts: {
  modelo: Delegate;
  schema: ZodType<{ nombre: string; activo: boolean }>;
  que: string;
  select: object;
  orderBy: object[];
  alCrear?: () => Promise<object>;
}) {
  const r = Router();

  r.get(
    '/',
    handler(async (req, res) => {
      const soloActivos = req.query.activos === '1';
      res.json(
        await opts.modelo.findMany({
          where: soloActivos ? { activo: true } : undefined,
          orderBy: opts.orderBy,
          select: opts.select,
        }),
      );
    }),
  );

  r.post(
    '/',
    handler(async (req, res) => {
      const data = validar(opts.schema, req.body);
      const extra = opts.alCrear ? await opts.alCrear() : {};
      res.status(201).json(await opts.modelo.create({ data: { ...data, ...extra }, select: opts.select }));
    }),
  );

  r.put(
    '/:id',
    handler(async (req, res) => {
      const id = validar(idSchema, req.params.id);
      const data = validar(opts.schema, req.body);
      if (!(await opts.modelo.findUnique({ where: { id } }))) throw noEncontrado(opts.que);
      res.json(await opts.modelo.update({ where: { id }, data, select: opts.select }));
    }),
  );

  return r;
}

const SELECT = { id: true, nombre: true, activo: true } as const;
const SELECT_TALLE = { ...SELECT, orden: true } as const;

export const tiposRouter = routerLista({
  modelo: prisma.tipoPrenda,
  schema: tipoPrendaSchema,
  que: 'el tipo de prenda',
  select: SELECT,
  orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
});

export const coloresRouter = routerLista({
  modelo: prisma.color,
  schema: colorSchema,
  que: 'el color',
  select: SELECT,
  orderBy: [{ activo: 'desc' }, { nombre: 'asc' }],
});

export const tallesRouter = Router();

/** Cambia el orden en que se muestran los talles. Tiene que incluir todos. */
tallesRouter.put(
  '/orden',
  handler(async (req, res) => {
    const { ids } = validar(ordenTallesSchema, req.body);
    const existentes = await prisma.talle.findMany({ select: { id: true } });
    const unicos = new Set(ids);
    if (unicos.size !== ids.length || existentes.length !== ids.length || existentes.some((t) => !unicos.has(t.id))) {
      throw new HttpError(400, 'La lista de talles cambió. Recargá la página y probá de nuevo.');
    }
    await prisma.$transaction(ids.map((id, i) => prisma.talle.update({ where: { id }, data: { orden: (i + 1) * 10 } })));
    res.json(await prisma.talle.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }], select: SELECT_TALLE }));
  }),
);

tallesRouter.use(
  routerLista({
    modelo: prisma.talle,
    schema: talleSchema,
    que: 'el talle',
    select: SELECT_TALLE,
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    // Los talles nuevos van al final de la lista.
    alCrear: async () => {
      const max = await prisma.talle.aggregate({ _max: { orden: true } });
      return { orden: (max._max.orden ?? 0) + 10 };
    },
  }),
);
