import { Router } from 'express';
import { z } from 'zod';
import { clienteSchema, finWhatsapp, idSchema, redondear, type Cliente, type ClienteDetalle, type ClienteResumen, type ListaClientes } from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';
import type { Prisma } from '../generated/prisma/client.js';
import { resumenVenta, selectResumenVenta } from '../ventas/detalle.js';

export const clientesRouter = Router();

const select = {
  id: true,
  nombre: true,
  whatsapp: true,
  notas: true,
  activo: true,
  talles: { select: { id: true, nombre: true, activo: true, orden: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] },
} satisfies Prisma.ClienteSelect;

/** Compras, total y última compra de cada cliente (ventas no anuladas + cambios). */
async function conCompras(clientes: Cliente[]): Promise<ClienteResumen[]> {
  const ids = clientes.map((c) => c.id);
  if (!ids.length) return [];
  const [ventas, cambios] = await Promise.all([
    prisma.venta.groupBy({
      by: ['clienteId'],
      where: { clienteId: { in: ids }, anulada: false },
      _count: true,
      _sum: { total: true },
      _max: { creadoEn: true },
    }),
    prisma.cambioPago.findMany({
      where: { cambio: { venta: { clienteId: { in: ids } } } },
      select: { cobrado: true, cambio: { select: { venta: { select: { clienteId: true } } } } },
    }),
  ]);
  const extra = new Map<number, number>();
  for (const p of cambios) {
    const id = p.cambio.venta.clienteId!;
    extra.set(id, (extra.get(id) ?? 0) + num(p.cobrado));
  }
  return clientes.map((c) => {
    const v = ventas.find((x) => x.clienteId === c.id);
    return {
      ...c,
      compras: v?._count ?? 0,
      totalComprado: redondear((v?._sum.total ? num(v._sum.total) : 0) + (extra.get(c.id) ?? 0)),
      ultimaCompra: v?._max.creadoEn?.toISOString() ?? null,
    };
  });
}

const filtrosSchema = z.object({
  q: z.string().trim().max(80).optional(),
  activos: z.literal('1').optional(),
});

clientesRouter.get(
  '/',
  handler(async (req, res) => {
    const { q, activos } = validar(filtrosSchema, req.query);
    const digitos = q?.replace(/\D/g, '') ?? '';
    const where: Prisma.ClienteWhereInput = {
      activo: activos ? true : undefined,
      OR: q
        ? [{ nombre: { contains: q, mode: 'insensitive' } }, ...(digitos.length >= 3 ? [{ whatsapp: { contains: digitos } }] : [])]
        : undefined,
    };
    const [filas, total] = await Promise.all([
      prisma.cliente.findMany({ where, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }], take: 100, select }),
      prisma.cliente.count({ where }),
    ]);
    const body: ListaClientes = { clientes: await conCompras(filas), total };
    res.json(body);
  }),
);

clientesRouter.get(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const c = await prisma.cliente.findUnique({ where: { id }, select: { ...select, creadoEn: true } });
    if (!c) throw noEncontrado('el cliente');
    const { creadoEn, ...cliente } = c;
    const ventas = await prisma.venta.findMany({ where: { clienteId: id }, orderBy: { creadoEn: 'desc' }, take: 200, select: selectResumenVenta });
    const [resumen] = await conCompras([cliente]);
    const body: ClienteDetalle = { ...resumen!, creadoEn: creadoEn.toISOString(), ventas: ventas.map(resumenVenta) };
    res.json(body);
  }),
);

async function validarCliente(d: z.output<typeof clienteSchema>, id?: number) {
  if (d.talleIds.length) {
    const n = await prisma.talle.count({ where: { id: { in: d.talleIds } } });
    if (n !== d.talleIds.length) throw new HttpError(400, 'Elegí los talles de la lista', { talleIds: 'Elegí los talles de la lista' });
  }
  if (d.whatsapp) {
    const otro = await prisma.cliente.findFirst({ where: { whatsapp: { endsWith: finWhatsapp(d.whatsapp) }, id: id ? { not: id } : undefined } });
    if (otro) {
      const msg = `Ese WhatsApp ya es de ${otro.nombre}`;
      throw new HttpError(409, msg, { whatsapp: msg });
    }
  }
}

clientesRouter.post(
  '/',
  handler(async (req, res) => {
    const { talleIds, ...d } = validar(clienteSchema, req.body);
    await validarCliente({ talleIds, ...d });
    const c: Cliente = await prisma.cliente.create({ data: { ...d, talles: { connect: talleIds.map((id) => ({ id })) } }, select });
    res.status(201).json(c);
  }),
);

clientesRouter.put(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const { talleIds, ...d } = validar(clienteSchema, req.body);
    if (!(await prisma.cliente.findUnique({ where: { id }, select: { id: true } }))) throw noEncontrado('el cliente');
    await validarCliente({ talleIds, ...d }, id);
    const c: Cliente = await prisma.cliente.update({ where: { id }, data: { ...d, talles: { set: talleIds.map((id) => ({ id })) } }, select });
    res.json(c);
  }),
);
