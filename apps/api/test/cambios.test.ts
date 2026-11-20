import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearPlanesBase, crearUsuario, limpiarDb } from './helpers.js';

let agent: TestAgent;
/** Camisa Oxford (venta 40.000): Blanco S con 3 y Blanco M con 1. Remera Básica (15.000): Negro S con 5. */
let blancoS: number;
let blancoM: number;
let remeraS: number;

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
  await crearPlanesBase();
  agent = await agenteLogueado();
  const camisas = (await agent.post('/api/tipos').send({ nombre: 'Camisa' })).body.id;
  const remeras = (await agent.post('/api/tipos').send({ nombre: 'Remera' })).body.id;
  const blanco = (await agent.post('/api/colores').send({ nombre: 'Blanco' })).body.id;
  const negro = (await agent.post('/api/colores').send({ nombre: 'Negro' })).body.id;
  const s = (await agent.post('/api/talles').send({ nombre: 'S' })).body.id;
  const m = (await agent.post('/api/talles').send({ nombre: 'M' })).body.id;
  const p1 = (
    await agent
      .post('/api/productos')
      .send({
        tipoId: camisas,
        nombre: 'Oxford',
        precioCompra: 18000,
        precioVenta: 40000,
        colorIds: [blanco],
        talleIds: [s, m],
        cantidades: [
          { colorId: blanco, talleId: s, cantidad: 3 },
          { colorId: blanco, talleId: m, cantidad: 1 },
        ],
      })
      .expect(201)
  ).body;
  [blancoS, blancoM] = p1.variantes.map((v: { id: number }) => v.id);
  const p2 = (
    await agent
      .post('/api/productos')
      .send({
        tipoId: remeras,
        nombre: 'Básica',
        precioCompra: 8000,
        precioVenta: 15000,
        colorIds: [negro],
        talleIds: [s],
        cantidades: [{ colorId: negro, talleId: s, cantidad: 5 }],
      })
      .expect(201)
  ).body;
  remeraS = p2.variantes[0].id;
});
afterAll(() => prisma.$disconnect());

const stockDe = async (id: number) => (await prisma.variante.findUniqueOrThrow({ where: { id } })).stock;

/** Vende y devuelve el detalle de la venta. */
async function vender(items: { varianteId: number; cantidad: number; precioUnitario: number }[], medio = 'EFECTIVO') {
  const monto = items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0);
  return (await agent.post('/api/ventas').send({ items, pagos: [{ medio, monto }] }).expect(201)).body;
}
const itemDe = (venta: { items: { id: number; variante: { id: number } }[] }, varianteId: number) =>
  venta.items.find((it) => it.variante.id === varianteId)!.id;

describe('cambios y devoluciones', () => {
  it('cambio de talle sin diferencia: el stock se ajusta en los dos sentidos', async () => {
    const v = await vender([{ varianteId: blancoS, cantidad: 1, precioUnitario: 40000 }]);
    expect(await stockDe(blancoS)).toBe(2);

    const r = await agent
      .post('/api/cambios')
      .send({
        ventaId: v.id,
        devueltos: [{ ventaItemId: itemDe(v, blancoS), cantidad: 1 }],
        llevados: [{ varianteId: blancoM, cantidad: 1, precioUnitario: 40000 }],
      })
      .expect(201);

    expect(await stockDe(blancoS)).toBe(3);
    expect(await stockDe(blancoM)).toBe(0);
    expect(r.body.items[0].devueltas).toBe(1);
    expect(r.body.conCambios).toBe(true);
    expect(r.body.cambios).toHaveLength(1);
    expect(r.body.cambios[0]).toMatchObject({ totalDevuelto: 40000, totalLlevado: 40000, diferencia: 0, pagos: [] });
    expect(r.body.cambios[0].llevados[0].variante.talle.nombre).toBe('M');

    const movs = await prisma.movimientoStock.findMany({ where: { cambioId: r.body.cambios[0].id }, orderBy: { id: 'asc' } });
    expect(movs.map((m) => [m.tipo, m.varianteId, m.cantidad, m.ventaId])).toEqual([
      ['DEVOLUCION', blancoS, 1, v.id],
      ['CAMBIO', blancoM, -1, v.id],
    ]);
  });

  it('devolución: se le reintegra la plata y la caja la descuenta', async () => {
    const v = await vender([{ varianteId: remeraS, cantidad: 2, precioUnitario: 15000 }]);
    const r = await agent
      .post('/api/cambios')
      .send({ ventaId: v.id, devueltos: [{ ventaItemId: itemDe(v, remeraS), cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(201);
    expect(r.body.cambios[0]).toMatchObject({ diferencia: -15000, pagos: [{ medio: 'EFECTIVO', cobrado: -15000 }] });
    expect(await stockDe(remeraS)).toBe(4);

    const caja = (await agent.get('/api/caja/dia').expect(200)).body;
    expect(caja.totales).toMatchObject({ ventas: 30000, gastos: 15000, saldo: 15000, efectivo: 15000 });
    expect(caja.movimientos).toContainEqual(
      expect.objectContaining({ origen: 'CAMBIO', tipo: 'GASTO', monto: 15000, id: v.id, concepto: 'Devolución de dinero a un cliente' }),
    );
  });

  it('si se lleva algo más caro, hay que cobrar la diferencia (con el recargo del medio)', async () => {
    const v = await vender([{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }]);
    const base = { ventaId: v.id, devueltos: [{ ventaItemId: itemDe(v, remeraS), cantidad: 1 }], llevados: [{ varianteId: blancoS, cantidad: 1, precioUnitario: 40000 }] };

    const sinPago = await agent.post('/api/cambios').send(base).expect(400);
    expect(sinPago.body.error).toBe('El cliente tiene que pagar la diferencia de $ 25.000: elegí el medio de pago');
    const mal = await agent.post('/api/cambios').send({ ...base, pagos: [{ medio: 'DEBITO', monto: 20000 }] }).expect(400);
    expect(mal.body.error).toContain('tienen que coincidir');
    expect(await stockDe(remeraS)).toBe(4);

    const debito = await prisma.planPago.findUniqueOrThrow({ where: { medio_cuotas: { medio: 'DEBITO', cuotas: 1 } } });
    await agent.put(`/api/planes-pago/${debito.id}`).send({ porcentaje: '10', activo: true }).expect(200);
    const r = await agent.post('/api/cambios').send({ ...base, pagos: [{ medio: 'DEBITO', monto: 25000 }] }).expect(201);
    expect(r.body.cambios[0]).toMatchObject({ diferencia: 25000, pagos: [{ medio: 'DEBITO', monto: 25000, ajuste: 2500, cobrado: 27500 }] });
    expect(await stockDe(remeraS)).toBe(5);
    expect(await stockDe(blancoS)).toBe(2);

    const caja = (await agent.get('/api/caja/dia').expect(200)).body;
    expect(caja.totales).toMatchObject({ ventas: 15000, otrosIngresos: 27500, saldo: 42500 });
  });

  it('si lo que se lleva vale menos, exige elegir cómo devolver la diferencia', async () => {
    const v = await vender([{ varianteId: blancoS, cantidad: 1, precioUnitario: 40000 }]);
    const r = await agent
      .post('/api/cambios')
      .send({ ventaId: v.id, devueltos: [{ ventaItemId: itemDe(v, blancoS), cantidad: 1 }], llevados: [{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }] })
      .expect(400);
    expect(r.body.error).toBe('Hay que devolverle $ 25.000 al cliente: elegí cómo');
  });

  it('no deja devolver más de lo vendido, sumando las devoluciones anteriores', async () => {
    const v = await vender([{ varianteId: remeraS, cantidad: 2, precioUnitario: 15000 }]);
    const item = itemDe(v, remeraS);
    const devolver = (cantidad: number) =>
      agent.post('/api/cambios').send({ ventaId: v.id, devueltos: [{ ventaItemId: item, cantidad }], medioReintegro: 'EFECTIVO' });

    expect((await devolver(3).expect(400)).body.error).toBe('De Remera Básica Negro S se vendieron 2: puede devolver hasta 2');
    await devolver(1).expect(201);
    expect((await devolver(2).expect(400)).body.error).toBe('De Remera Básica Negro S se vendieron 2 y ya volvió 1: puede devolver hasta 1');
    await devolver(1).expect(201);
    expect((await devolver(1).expect(400)).body.error).toBe('Remera Básica Negro S ya se devolvió completo');
    expect(await stockDe(remeraS)).toBe(5);
  });

  it('dos devoluciones al mismo tiempo de la última unidad: solo una se registra', async () => {
    const v = await vender([{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }]);
    const cuerpo = { ventaId: v.id, devueltos: [{ ventaItemId: itemDe(v, remeraS), cantidad: 1 }], medioReintegro: 'EFECTIVO' };
    const otro = await agenteLogueado();
    const [a, b] = await Promise.all([agent.post('/api/cambios').send(cuerpo), otro.post('/api/cambios').send(cuerpo)]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await stockDe(remeraS)).toBe(5);
  });

  it('solo se puede devolver lo de esa venta', async () => {
    const v1 = await vender([{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }]);
    const v2 = await vender([{ varianteId: blancoS, cantidad: 1, precioUnitario: 40000 }]);
    const r = await agent
      .post('/api/cambios')
      .send({ ventaId: v2.id, devueltos: [{ ventaItemId: itemDe(v1, remeraS), cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(400);
    expect(r.body.error).toBe('Solo se puede devolver lo que se vendió en esta venta');
  });

  it('sin stock de lo que se lleva no cambia nada', async () => {
    const v = await vender([{ varianteId: blancoS, cantidad: 1, precioUnitario: 40000 }]);
    await vender([{ varianteId: blancoM, cantidad: 1, precioUnitario: 40000 }]);
    const r = await agent
      .post('/api/cambios')
      .send({ ventaId: v.id, devueltos: [{ ventaItemId: itemDe(v, blancoS), cantidad: 1 }], llevados: [{ varianteId: blancoM, cantidad: 1, precioUnitario: 40000 }] })
      .expect(409);
    expect(r.body.error).toBe('No hay stock suficiente de Camisa Oxford Blanco M (no queda ninguna)');
    expect(await stockDe(blancoS)).toBe(2);
    expect(await prisma.cambio.count()).toBe(0);
    expect(await prisma.movimientoStock.count({ where: { tipo: 'DEVOLUCION' } })).toBe(0);
  });

  it('cambia por la misma prenda (falla): la unidad que vuelve cuenta para el stock', async () => {
    const v = await vender([{ varianteId: blancoM, cantidad: 1, precioUnitario: 40000 }]);
    expect(await stockDe(blancoM)).toBe(0);
    await agent
      .post('/api/cambios')
      .send({ ventaId: v.id, devueltos: [{ ventaItemId: itemDe(v, blancoM), cantidad: 1 }], llevados: [{ varianteId: blancoM, cantidad: 1, precioUnitario: 40000 }] })
      .expect(201);
    expect(await stockDe(blancoM)).toBe(0);
  });

  it('una venta anulada no admite cambios y una venta con cambios no se puede anular', async () => {
    const v1 = await vender([{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }]);
    await agent.post(`/api/ventas/${v1.id}/anular`).send({ motivo: 'error' }).expect(200);
    const r1 = await agent
      .post('/api/cambios')
      .send({ ventaId: v1.id, devueltos: [{ ventaItemId: itemDe(v1, remeraS), cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(409);
    expect(r1.body.error).toContain('anulada');

    const v2 = await vender([{ varianteId: remeraS, cantidad: 2, precioUnitario: 15000 }]);
    await agent
      .post('/api/cambios')
      .send({ ventaId: v2.id, devueltos: [{ ventaItemId: itemDe(v2, remeraS), cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(201);
    const r2 = await agent.post(`/api/ventas/${v2.id}/anular`).send({ motivo: 'error' }).expect(409);
    expect(r2.body.error).toBe('Esta venta tiene cambios o devoluciones registrados y ya no se puede anular');
    expect(await stockDe(remeraS)).toBe(4);
  });

  it('busca las ventas de una prenda y lista los últimos cambios', async () => {
    const v1 = await vender([{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }]);
    await vender([{ varianteId: blancoS, cantidad: 1, precioUnitario: 40000 }]);
    const ventas = (await agent.get(`/api/ventas/buscar?varianteId=${remeraS}`).expect(200)).body;
    expect(ventas.map((v: { id: number }) => v.id)).toEqual([v1.id]);
    await agent.get('/api/ventas/buscar').expect(400);

    await agent
      .post('/api/cambios')
      .send({ ventaId: v1.id, devueltos: [{ ventaItemId: itemDe(v1, remeraS), cantidad: 1 }], medioReintegro: 'TRANSFERENCIA' })
      .expect(201);
    const lista = (await agent.get('/api/cambios').expect(200)).body;
    expect(lista[0]).toMatchObject({ ventaId: v1.id, devolucion: true, diferencia: -15000, descripcion: 'Vuelve: Remera Básica Negro S' });
  });
});
