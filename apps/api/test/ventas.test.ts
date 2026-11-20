import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { hoy } from '@lmont/shared';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearPlanesBase, crearUsuario, limpiarDb } from './helpers.js';

let agent: TestAgent;
/** Camisa Oxford (compra 18.000 / venta 40.000): Blanco S con 3 y Blanco M con 1. Remera (8.000 / 15.000): Negro S con 5. */
let blancoS: number;
let blancoM: number;
let remeraS: number;
let camisa: number;
let vendedor: number;

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
        precioCompra: '18.000',
        precioVenta: '40.000',
        colorIds: [blanco],
        talleIds: [s, m],
        cantidades: [
          { colorId: blanco, talleId: s, cantidad: 3 },
          { colorId: blanco, talleId: m, cantidad: 1 },
        ],
      })
      .expect(201)
  ).body;
  camisa = p1.id;
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
  vendedor = (await agent.post('/api/vendedores').send({ nombre: 'Lucía' }).expect(201)).body.id;
});
afterAll(() => prisma.$disconnect());

const stockDe = async (id: number) => (await prisma.variante.findUniqueOrThrow({ where: { id } })).stock;
const planDe = (medio: 'EFECTIVO' | 'CREDITO' | 'DEBITO' | 'TRANSFERENCIA', cuotas = 1) =>
  prisma.planPago.findUniqueOrThrow({ where: { medio_cuotas: { medio, cuotas } } });

describe('ventas', () => {
  it('descuenta el stock, guarda precios y costos del momento y registra los movimientos', async () => {
    const r = await agent
      .post('/api/ventas')
      .send({
        vendedorId: vendedor,
        items: [
          { varianteId: blancoS, cantidad: 2, precioUnitario: '40.000' },
          { varianteId: remeraS, cantidad: 1, precioUnitario: '15.000' },
        ],
        pagos: [{ medio: 'EFECTIVO', monto: '95.000' }],
      })
      .expect(201);
    expect(r.body).toMatchObject({ subtotal: 95000, total: 95000, unidades: 3, anulada: false, vendedor: { nombre: 'Lucía' } });
    expect(r.body.descripcion).toBe('Camisa Oxford, Remera Básica');
    expect(r.body.items[0]).toMatchObject({ cantidad: 2, precioLista: 40000, precioUnitario: 40000, variante: { talle: { nombre: 'S' } } });

    expect(await stockDe(blancoS)).toBe(1);
    expect(await stockDe(remeraS)).toBe(4);
    const movs = await prisma.movimientoStock.findMany({ where: { tipo: 'VENTA' }, orderBy: { id: 'asc' } });
    expect(movs.map((m) => [m.cantidad, m.stockResultante, m.ventaId])).toEqual([
      [-2, 1, r.body.id],
      [-1, 4, r.body.id],
    ]);
    const item = await prisma.ventaItem.findFirstOrThrow({ where: { varianteId: blancoS } });
    expect(item.costoUnitario.toNumber()).toBe(18000);
  });

  it('la venta conserva el precio cobrado aunque después cambie el precio del producto', async () => {
    const r = await agent
      .post('/api/ventas')
      .send({ items: [{ varianteId: blancoS, cantidad: 1, precioUnitario: '36.000' }], pagos: [{ medio: 'DEBITO', monto: '36.000' }] })
      .expect(201);
    expect(r.body.items[0]).toMatchObject({ precioLista: 40000, precioUnitario: 36000 });
    const p = (await agent.get(`/api/productos/${camisa}`)).body;
    await agent.put(`/api/productos/${camisa}`).send({ ...p, precioCompra: 20000, precioVenta: 45000 }).expect(200);
    const despues = (await agent.get(`/api/ventas/${r.body.id}`).expect(200)).body;
    expect(despues.items[0]).toMatchObject({ precioLista: 40000, precioUnitario: 36000 });
    expect(despues.total).toBe(36000);
  });

  it('no deja vender más de lo que hay y, si falla, no cambia nada', async () => {
    const r = await agent
      .post('/api/ventas')
      .send({
        items: [
          { varianteId: remeraS, cantidad: 2, precioUnitario: 15000 },
          { varianteId: blancoM, cantidad: 2, precioUnitario: 40000 },
        ],
        pagos: [{ medio: 'EFECTIVO', monto: 110000 }],
      })
      .expect(409);
    expect(r.body.error).toBe('No hay stock suficiente de Camisa Oxford Blanco M (quedan 1)');
    expect(await stockDe(remeraS)).toBe(5);
    expect(await stockDe(blancoM)).toBe(1);
    expect(await prisma.venta.count()).toBe(0);
    expect(await prisma.movimientoStock.count({ where: { tipo: 'VENTA' } })).toBe(0);
  });

  it('dos ventas al mismo tiempo de la última unidad: solo una se registra', async () => {
    const venta = { items: [{ varianteId: blancoM, cantidad: 1, precioUnitario: 40000 }], pagos: [{ medio: 'EFECTIVO', monto: 40000 }] };
    const otro = await agenteLogueado();
    const [a, b] = await Promise.all([agent.post('/api/ventas').send(venta), otro.post('/api/ventas').send(venta)]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await stockDe(blancoM)).toBe(0);
  });

  it('aplica el descuento por efectivo y el recargo por cuotas configurados', async () => {
    const efectivo = await planDe('EFECTIVO');
    await agent.put(`/api/planes-pago/${efectivo.id}`).send({ porcentaje: '-10', activo: true }).expect(200);
    await agent.post('/api/planes-pago').send({ cuotas: 3, porcentaje: '15' }).expect(201);

    const r = await agent
      .post('/api/ventas')
      .send({
        items: [{ varianteId: blancoS, cantidad: 2, precioUnitario: 40000 }],
        pagos: [
          { medio: 'EFECTIVO', monto: '20.000' },
          { medio: 'CREDITO', cuotas: 3, monto: '60.000' },
        ],
      })
      .expect(201);
    expect(r.body.subtotal).toBe(80000);
    expect(r.body.pagos.map((p: { porcentaje: number; ajuste: number; cobrado: number }) => [p.porcentaje, p.ajuste, p.cobrado])).toEqual([
      [-10, -2000, 18000],
      [15, 9000, 69000],
    ]);
    expect(r.body.total).toBe(87000);

    // Cambiar el porcentaje después no modifica la venta ya hecha.
    await agent.put(`/api/planes-pago/${efectivo.id}`).send({ porcentaje: 0, activo: true }).expect(200);
    expect((await agent.get(`/api/ventas/${r.body.id}`)).body.total).toBe(87000);
  });

  it('rechaza planes de cuotas que no existen o están deshabilitados', async () => {
    const venta = (pago: object) => ({ items: [{ varianteId: remeraS, cantidad: 1, precioUnitario: 15000 }], pagos: [{ monto: 15000, ...pago }] });
    const r = await agent.post('/api/ventas').send(venta({ medio: 'CREDITO', cuotas: 6 })).expect(400);
    expect(r.body.error).toBe('El pago con Crédito 6 cuotas no está habilitado. Revisá los medios de pago en Configuración.');
    const transf = await planDe('TRANSFERENCIA');
    await agent.put(`/api/planes-pago/${transf.id}`).send({ porcentaje: 0, activo: false }).expect(200);
    await agent.post('/api/ventas').send(venta({ medio: 'TRANSFERENCIA' })).expect(400);
    expect(await stockDe(remeraS)).toBe(5);
  });

  it('valida en el servidor: pagos que no suman, sin productos, vendedor inactivo y productos desactivados', async () => {
    const item = { varianteId: remeraS, cantidad: 1, precioUnitario: 15000 };
    const r = await agent.post('/api/ventas').send({ items: [item], pagos: [{ medio: 'EFECTIVO', monto: 10000 }] }).expect(400);
    expect(r.body.error).toBe('Los pagos suman $ 10.000 y la venta es de $ 15.000: tienen que coincidir');
    await agent.post('/api/ventas').send({ items: [], pagos: [] }).expect(400);

    await agent.put(`/api/vendedores/${vendedor}`).send({ nombre: 'Lucía', activo: false }).expect(200);
    await agent.post('/api/ventas').send({ vendedorId: vendedor, items: [item], pagos: [{ medio: 'EFECTIVO', monto: 15000 }] }).expect(400);

    await agent.put(`/api/variantes/${remeraS}`).send({ activo: false, stockMinimo: 0 }).expect(200);
    const r2 = await agent.post('/api/ventas').send({ items: [item], pagos: [{ medio: 'EFECTIVO', monto: 15000 }] }).expect(400);
    expect(r2.body.error).toBe('Remera Básica Negro S está desactivado y no se puede vender');
  });

  it('anular devuelve el stock, deja de sumar en el día y no se puede anular dos veces', async () => {
    const r = await agent
      .post('/api/ventas')
      .send({ items: [{ varianteId: remeraS, cantidad: 3, precioUnitario: 15000 }], pagos: [{ medio: 'TRANSFERENCIA', monto: 45000 }] })
      .expect(201);
    await agent
      .post('/api/ventas')
      .send({ items: [{ varianteId: blancoS, cantidad: 1, precioUnitario: 40000 }], pagos: [{ medio: 'EFECTIVO', monto: 40000 }] })
      .expect(201);
    expect(await stockDe(remeraS)).toBe(2);

    await agent.post(`/api/ventas/${r.body.id}/anular`).send({ motivo: '' }).expect(400);
    const a = await agent.post(`/api/ventas/${r.body.id}/anular`).send({ motivo: 'Se cargó dos veces' }).expect(200);
    expect(a.body).toMatchObject({ anulada: true, motivoAnulacion: 'Se cargó dos veces' });
    expect(await stockDe(remeraS)).toBe(5);
    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { tipo: 'ANULACION_VENTA' } });
    expect(mov).toMatchObject({ cantidad: 3, ventaId: r.body.id, detalle: 'Se cargó dos veces' });

    const otra = await agent.post(`/api/ventas/${r.body.id}/anular`).send({ motivo: 'De nuevo' }).expect(409);
    expect(otra.body.error).toBe('Esta venta ya estaba anulada');
    expect(await stockDe(remeraS)).toBe(5);

    const dia = (await agent.get('/api/ventas').expect(200)).body;
    expect(dia.fecha).toBe(hoy());
    expect(dia.ventas).toHaveLength(2);
    expect(dia.totales).toEqual({ ventas: 1, unidades: 1, total: 40000, porMedio: [{ medio: 'EFECTIVO', total: 40000 }] });
  });

  it('lista por fecha y los totales por medio de pago suman lo cobrado', async () => {
    await agent
      .post('/api/ventas')
      .send({
        items: [{ varianteId: remeraS, cantidad: 2, precioUnitario: 15000 }],
        pagos: [
          { medio: 'EFECTIVO', monto: 10000 },
          { medio: 'DEBITO', monto: 20000 },
        ],
      })
      .expect(201);
    const dia = (await agent.get(`/api/ventas?fecha=${hoy()}`).expect(200)).body;
    expect(dia.totales.porMedio).toEqual([
      { medio: 'EFECTIVO', total: 10000 },
      { medio: 'DEBITO', total: 20000 },
    ]);
    const vacio = (await agent.get('/api/ventas?fecha=2026-01-01').expect(200)).body;
    expect(vacio).toMatchObject({ ventas: [], totales: { ventas: 0, total: 0 } });
    await agent.get('/api/ventas?fecha=ayer').expect(400);
  });
});

describe('medios de pago', () => {
  it('lista los planes, crea cuotas sin repetir y no deja deshabilitar todos', async () => {
    const lista = (await agent.get('/api/planes-pago').expect(200)).body;
    expect(lista.map((p: { medio: string }) => p.medio)).toEqual(['EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA']);
    await agent.post('/api/planes-pago').send({ cuotas: 1, porcentaje: 5 }).expect(409);
    await agent.post('/api/planes-pago').send({ cuotas: 6, porcentaje: 'mucho' }).expect(400);

    for (const p of lista.slice(0, 3)) await agent.put(`/api/planes-pago/${p.id}`).send({ porcentaje: 0, activo: false }).expect(200);
    const r = await agent.put(`/api/planes-pago/${lista[3].id}`).send({ porcentaje: 0, activo: false }).expect(400);
    expect(r.body.error).toBe('Tiene que quedar al menos un medio de pago habilitado');
    expect((await agent.get('/api/planes-pago?activos=1')).body).toHaveLength(1);
  });
});
