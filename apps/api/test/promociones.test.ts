import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { hoy } from '@lmont/shared';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearPlanesBase, crearUsuario, limpiarDb } from './helpers.js';

let agent: TestAgent;
let tipoBoxer: number;
let remera: number;
let bermuda: number;
/** Remera Básica 15.000 (5), Bermuda Rústica 25.000 (5), Boxer Liso 6.000 (10). */
let remeraS: number;
let bermudaS: number;
let boxerS: number;

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
  await crearPlanesBase();
  agent = await agenteLogueado();
  const tipo = async (nombre: string) => (await agent.post('/api/tipos').send({ nombre })).body.id as number;
  const [tRemera, tBermuda] = [await tipo('Remera'), await tipo('Bermuda')];
  tipoBoxer = await tipo('Boxer');
  const negro = (await agent.post('/api/colores').send({ nombre: 'Negro' })).body.id;
  const s = (await agent.post('/api/talles').send({ nombre: 'S' })).body.id;
  const producto = async (tipoId: number, nombre: string, precioVenta: number, cantidad: number) =>
    (
      await agent
        .post('/api/productos')
        .send({ tipoId, nombre, precioCompra: 1000, precioVenta, colorIds: [negro], talleIds: [s], cantidades: [{ colorId: negro, talleId: s, cantidad }] })
        .expect(201)
    ).body;
  const r = await producto(tRemera, 'Básica', 15000, 5);
  const b = await producto(tBermuda, 'Rústica', 25000, 5);
  const x = await producto(tipoBoxer, 'Liso', 6000, 10);
  [remera, bermuda] = [r.id, b.id];
  [remeraS, bermudaS, boxerS] = [r.variantes[0].id, b.variantes[0].id, x.variantes[0].id];
});
afterAll(() => prisma.$disconnect());

const crearCombo = (extra: object = {}) =>
  agent
    .post('/api/promociones')
    .send({
      nombre: 'Combo verano',
      modo: 'PRECIO_FIJO',
      precio: '30.000',
      componentes: [
        { productoId: remera, cantidad: 1 },
        { productoId: bermuda, cantidad: 1 },
      ],
      ...extra,
    });

const ventaCombo = (promocionId: number, monto = 30000) => ({
  items: [
    { varianteId: remeraS, cantidad: 1, precioUnitario: 15000 },
    { varianteId: bermudaS, cantidad: 1, precioUnitario: 25000 },
  ],
  pagos: [{ medio: 'EFECTIVO', monto }],
  promos: [{ promocionId, veces: 1 }],
});

describe('promociones', () => {
  it('crea, lista y edita una promo', async () => {
    const p = (await crearCombo().expect(201)).body;
    expect(p).toMatchObject({ nombre: 'Combo verano', modo: 'PRECIO_FIJO', precio: 30000, pagaCantidad: null, activo: true });
    expect(p.componentes.map((c: { producto: { nombre: string } }) => c.producto.nombre)).toEqual(['Básica', 'Rústica']);

    await crearCombo().expect(409);
    const e = await agent
      .put(`/api/promociones/${p.id}`)
      .send({ nombre: '2x1 boxers', modo: 'NXM', pagaCantidad: 1, componentes: [{ tipoId: tipoBoxer, cantidad: 2 }] })
      .expect(200);
    expect(e.body).toMatchObject({ modo: 'NXM', precio: null, pagaCantidad: 1, componentes: [{ tipo: { nombre: 'Boxer' }, producto: null, cantidad: 2 }] });
    expect((await agent.get('/api/promociones').expect(200)).body).toHaveLength(1);
  });

  it('eliminar una promo sin ventas la borra', async () => {
    const p = (await crearCombo().expect(201)).body;
    await agent.delete(`/api/promociones/${p.id}`).expect(204);
    expect(await prisma.promocion.count()).toBe(0);
    expect(await prisma.promocionComponente.count()).toBe(0);
    await agent.delete(`/api/promociones/${p.id}`).expect(404);
  });

  it('eliminar una promo ya vendida la oculta sin tocar las ventas ni los reportes', async () => {
    const p = (await crearCombo().expect(201)).body;
    const v = (await agent.post('/api/ventas').send(ventaCombo(p.id)).expect(201)).body;
    await agent.delete(`/api/promociones/${p.id}`).expect(204);

    expect((await agent.get('/api/promociones').expect(200)).body).toEqual([]);
    expect((await agent.get('/api/promociones?vigentes=1').expect(200)).body).toEqual([]);
    await agent.put(`/api/promociones/${p.id}`).send({ nombre: 'Otra', modo: 'NXM', pagaCantidad: 1, componentes: [{ tipoId: tipoBoxer, cantidad: 2 }] }).expect(404);
    // Ya no se puede usar al vender.
    await agent.post('/api/ventas').send(ventaCombo(p.id)).expect(400);
    // La venta y el reporte conservan el nombre que tenía.
    expect((await agent.get(`/api/ventas/${v.id}`).expect(200)).body.promociones[0]).toMatchObject({ nombre: 'Combo verano', descuento: 10000 });
    expect((await agent.get('/api/reportes/resumen').expect(200)).body.promociones).toEqual([
      { promocionId: p.id, nombre: 'Combo verano', veces: 1, precio: 30000, descuento: 10000 },
    ]);
    // Se puede crear otra con el mismo nombre.
    await crearCombo().expect(201);
  });

  it('valida en el servidor con mensajes en español', async () => {
    const r = await agent.post('/api/promociones').send({ nombre: '', modo: 'PRECIO_FIJO', componentes: [] }).expect(400);
    expect(r.body.campos).toMatchObject({ nombre: 'Completá el nombre', componentes: 'Elegí qué prendas entran en la promo' });
    const p = await agent.post('/api/promociones').send({ nombre: 'X', modo: 'PRECIO_FIJO', precio: 1, componentes: [{ productoId: 9999, cantidad: 2 }] }).expect(400);
    expect(p.body.error).toBe('Elegí los productos de la lista');
  });

  it('la venta con promo guarda el descuento, repartido entre las prendas', async () => {
    const p = (await crearCombo().expect(201)).body;
    const v = (await agent.post('/api/ventas').send(ventaCombo(p.id)).expect(201)).body;
    expect(v).toMatchObject({ subtotal: 30000, total: 30000, descuentoPromos: 10000 });
    expect(v.promociones).toEqual([expect.objectContaining({ nombre: 'Combo verano', veces: 1, precioNormal: 40000, precio: 30000, descuento: 10000 })]);
    expect(v.items.map((it: { precioEfectivo: number }) => it.precioEfectivo)).toEqual([11250, 18750]);

    // Editar la promo no cambia la venta ya hecha.
    await agent.put(`/api/promociones/${p.id}`).send({ ...p, nombre: 'Otro nombre', precio: 35000, componentes: [{ productoId: remera, cantidad: 1 }, { productoId: bermuda, cantidad: 1 }] }).expect(200);
    expect((await agent.get(`/api/ventas/${v.id}`)).body.promociones[0]).toMatchObject({ nombre: 'Combo verano', precio: 30000 });
    expect((await agent.get('/api/promociones')).body[0].vendidas).toBe(1);
  });

  it('los pagos tienen que coincidir con el total con descuento', async () => {
    const p = (await crearCombo().expect(201)).body;
    const r = await agent.post('/api/ventas').send(ventaCombo(p.id, 40000)).expect(400);
    expect(r.body.error).toBe('Los pagos suman $ 40.000 y la venta es de $ 30.000: tienen que coincidir');
    expect(await prisma.venta.count()).toBe(0);
  });

  it('no aplica promos que no entran, inactivas o fuera de fecha', async () => {
    const p = (await crearCombo().expect(201)).body;
    const sinBermuda = await agent
      .post('/api/ventas')
      .send({ items: [{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }], pagos: [{ medio: 'EFECTIVO', monto: 5000 }], promos: [{ promocionId: p.id, veces: 1 }] })
      .expect(400);
    expect(sinBermuda.body.error).toBe('Para aplicar “Combo verano” faltan prendas: Bermuda Rústica');

    const futura = (await crearCombo({ nombre: 'Navidad', desde: '2099-12-01' }).expect(201)).body;
    const r = await agent.post('/api/ventas').send(ventaCombo(futura.id)).expect(400);
    expect(r.body.error).toContain('ya no está disponible');

    await agent.put(`/api/promociones/${p.id}`).send({ ...p, activo: false, componentes: [{ productoId: remera, cantidad: 1 }, { productoId: bermuda, cantidad: 1 }] }).expect(200);
    await agent.post('/api/ventas').send(ventaCombo(p.id)).expect(400);
    expect((await agent.get('/api/promociones?vigentes=1').expect(200)).body).toEqual([]);
  });

  it('2x1 en boxers aplicado dos veces', async () => {
    const p = (await agent.post('/api/promociones').send({ nombre: '2x1', modo: 'NXM', pagaCantidad: 1, componentes: [{ tipoId: tipoBoxer, cantidad: 2 }] }).expect(201)).body;
    const v = await agent
      .post('/api/ventas')
      .send({ items: [{ varianteId: boxerS, cantidad: 4, precioUnitario: 6000 }], pagos: [{ medio: 'EFECTIVO', monto: 12000 }], promos: [{ promocionId: p.id, veces: 2 }] })
      .expect(201);
    expect(v.body).toMatchObject({ subtotal: 12000, descuentoPromos: 12000 });
    expect(await prisma.variante.findUniqueOrThrow({ where: { id: boxerS } }).then((x) => x.stock)).toBe(6);
  });

  it('si devuelve una prenda de la promo, se le reintegra lo que pagó por ella', async () => {
    const p = (await crearCombo().expect(201)).body;
    const v = (await agent.post('/api/ventas').send(ventaCombo(p.id)).expect(201)).body;
    const r = await agent
      .post('/api/cambios')
      .send({ ventaId: v.id, devueltos: [{ ventaItemId: v.items[1].id, cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(201);
    expect(r.body.cambios[0]).toMatchObject({ totalDevuelto: 18750, diferencia: -18750 });
    const caja = (await agent.get(`/api/caja/dia?fecha=${hoy()}`)).body;
    expect(caja.totales.saldo).toBe(11250);
  });
});
