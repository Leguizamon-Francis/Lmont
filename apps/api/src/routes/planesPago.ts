import { Router } from 'express';
import { idSchema, nuevoPlanCuotasSchema, planPagoSchema, type PlanPago } from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';
import type { Prisma } from '../generated/prisma/client.js';

/** Recargos y descuentos por medio de pago (y planes de cuotas con crédito). */
export const planesPagoRouter = Router();

type PlanDb = Prisma.PlanPagoGetPayload<object>;
const plan = (p: PlanDb): PlanPago => ({ id: p.id, medio: p.medio, cuotas: p.cuotas, porcentaje: num(p.porcentaje), activo: p.activo });
const ORDEN_MEDIOS = ['EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA'];

planesPagoRouter.get(
  '/',
  handler(async (req, res) => {
    const soloActivos = req.query.activos === '1';
    const filas = await prisma.planPago.findMany({ where: soloActivos ? { activo: true } : undefined, orderBy: { cuotas: 'asc' } });
    filas.sort((a, b) => ORDEN_MEDIOS.indexOf(a.medio) - ORDEN_MEDIOS.indexOf(b.medio) || a.cuotas - b.cuotas);
    res.json(filas.map(plan));
  }),
);

/** Nuevo plan de cuotas con crédito (ej.: 3 cuotas con 15% de recargo). */
planesPagoRouter.post(
  '/',
  handler(async (req, res) => {
    const d = validar(nuevoPlanCuotasSchema, req.body);
    const existe = await prisma.planPago.findUnique({ where: { medio_cuotas: { medio: 'CREDITO', cuotas: d.cuotas } } });
    if (existe) {
      const msg = `Ya existe el plan de ${d.cuotas} ${d.cuotas === 1 ? 'cuota' : 'cuotas'}: editalo desde la lista`;
      throw new HttpError(409, msg, { cuotas: msg });
    }
    res.status(201).json(plan(await prisma.planPago.create({ data: { medio: 'CREDITO', ...d } })));
  }),
);

planesPagoRouter.put(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const d = validar(planPagoSchema, req.body);
    const actual = await prisma.planPago.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('el medio de pago');
    if (!d.activo && actual.activo) {
      const otrosActivos = await prisma.planPago.count({ where: { activo: true, id: { not: id } } });
      if (!otrosActivos) throw new HttpError(400, 'Tiene que quedar al menos un medio de pago habilitado');
    }
    res.json(plan(await prisma.planPago.update({ where: { id }, data: d })));
  }),
);
