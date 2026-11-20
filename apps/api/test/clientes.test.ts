import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearPlanesBase, crearUsuario, limpiarDb } from './helpers.js';

let agent: TestAgent;
let talleM: number;
let talle42: number;
let remeraS: number;

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
  await crearPlanesBase();
  agent = await agenteLogueado();
  talleM = (await agent.post('/api/talles').send({ nombre: 'M' })).body.id;
  talle42 = (await agent.post('/api/talles').send({ nombre: '42' })).body.id;
  const tipo = (await agent.post('/api/tipos').send({ nombre: 'Remera' })).body.id;
  const negro = (await agent.post('/api/colores').send({ nombre: 'Negro' })).body.id;
  const p = (
    await agent
      .post('/api/productos')
      .send({
        tipoId: tipo,
        nombre: 'Básica',
        precioCompra: 8000,
        precioVenta: 15000,
        colorIds: [negro],
        talleIds: [talleM],
        cantidades: [{ colorId: negro, talleId: talleM, cantidad: 10 }],
      })
      .expect(201)
  ).body;
  remeraS = p.variantes[0].id;
});
afterAll(() => prisma.$disconnect());

const venta = (clienteId: number | null, cantidad = 1) => ({
  clienteId,
  items: [{ varianteId: remeraS, cantidad, precioUnitario: 15000 }],
  pagos: [{ medio: 'EFECTIVO', monto: 15000 * cantidad }],
});

describe('clientes', () => {
  it('crea un cliente con sus talles y guarda solo los dígitos del WhatsApp', async () => {
    const r = await agent
      .post('/api/clientes')
      .send({ nombre: '  Juan Pérez ', whatsapp: '(342) 555-1234', talleIds: [talle42, talleM, talleM], notas: 'Le gustan los colores lisos' })
      .expect(201);
    expect(r.body).toMatchObject({ nombre: 'Juan Pérez', whatsapp: '3425551234', activo: true });
    expect(r.body.talles.map((t: { nombre: string }) => t.nombre).sort()).toEqual(['42', 'M']);

    const edit = await agent.put(`/api/clientes/${r.body.id}`).send({ nombre: 'Juan Pérez', whatsapp: '3425551234', talleIds: [talleM] }).expect(200);
    expect(edit.body.talles.map((t: { nombre: string }) => t.nombre)).toEqual(['M']);
  });

  it('valida nombre, WhatsApp y talles con mensajes en español', async () => {
    const r = await agent.post('/api/clientes').send({ nombre: '', whatsapp: 'abc', talleIds: [999] }).expect(400);
    expect(r.body.campos).toMatchObject({ nombre: 'Completá el nombre', whatsapp: 'El WhatsApp solo puede tener números' });
    const t = await agent.post('/api/clientes').send({ nombre: 'Ana', talleIds: [999] }).expect(400);
    expect(t.body.error).toBe('Elegí los talles de la lista');
  });

  it('no permite dos clientes con el mismo WhatsApp aunque esté escrito distinto', async () => {
    await agent.post('/api/clientes').send({ nombre: 'Juan', whatsapp: '342 555-1234' }).expect(201);
    const r = await agent.post('/api/clientes').send({ nombre: 'Juancito', whatsapp: '+54 9 342 555 1234' }).expect(409);
    expect(r.body.error).toBe('Ese WhatsApp ya es de Juan');
  });

  it('busca por nombre o por número', async () => {
    await agent.post('/api/clientes').send({ nombre: 'Juan Pérez', whatsapp: '3425551234' }).expect(201);
    await agent.post('/api/clientes').send({ nombre: 'Ana Gómez' }).expect(201);
    const porNombre = (await agent.get('/api/clientes?q=pér').expect(200)).body;
    expect(porNombre.clientes.map((c: { nombre: string }) => c.nombre)).toEqual(['Juan Pérez']);
    const porNumero = (await agent.get('/api/clientes?q=555').expect(200)).body;
    expect(porNumero.total).toBe(1);
    expect((await agent.get('/api/clientes').expect(200)).body.total).toBe(2);
  });

  it('historial de compras: suma ventas y devoluciones, sin las anuladas', async () => {
    const c = (await agent.post('/api/clientes').send({ nombre: 'Juan' }).expect(201)).body;
    const v1 = (await agent.post('/api/ventas').send(venta(c.id, 2)).expect(201)).body;
    expect(v1.cliente).toEqual({ id: c.id, nombre: 'Juan' });
    const v2 = (await agent.post('/api/ventas').send(venta(c.id)).expect(201)).body;
    await agent.post('/api/ventas').send(venta(null)).expect(201);
    await agent.post(`/api/ventas/${v2.id}/anular`).send({ motivo: 'error' }).expect(200);
    await agent
      .post('/api/cambios')
      .send({ ventaId: v1.id, devueltos: [{ ventaItemId: v1.items[0].id, cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(201);

    const d = (await agent.get(`/api/clientes/${c.id}`).expect(200)).body;
    expect(d).toMatchObject({ compras: 1, totalComprado: 15000 });
    expect(d.ventas.map((v: { id: number }) => v.id)).toEqual([v2.id, v1.id]);
    expect(d.ultimaCompra).toBe(v1.creadoEn);

    const buscadas = (await agent.get(`/api/ventas/buscar?clienteId=${c.id}`).expect(200)).body;
    expect(buscadas.map((v: { id: number }) => v.id)).toEqual([v1.id]);
  });

  it('un cliente desactivado no se puede elegir en una venta nueva', async () => {
    const c = (await agent.post('/api/clientes').send({ nombre: 'Juan', activo: false }).expect(201)).body;
    const r = await agent.post('/api/ventas').send(venta(c.id)).expect(400);
    expect(r.body.campos).toEqual({ clienteId: 'Elegí un cliente de la lista' });
  });
});
