import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { hoy } from '@lmont/shared';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearPlanesBase, crearUsuario, limpiarDb } from './helpers.js';

let agent: TestAgent;
let variante: number;
let alquiler: number;
let sueldos: number;
let aporte: number;
let proveedor: number;

const HOY = hoy();
const MES = HOY.slice(0, 7);

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
  await crearPlanesBase();
  agent = await agenteLogueado();
  const tipo = (await agent.post('/api/tipos').send({ nombre: 'Remera' })).body.id;
  const color = (await agent.post('/api/colores').send({ nombre: 'Negro' })).body.id;
  const talle = (await agent.post('/api/talles').send({ nombre: 'M' })).body.id;
  const p = (
    await agent
      .post('/api/productos')
      .send({
        tipoId: tipo,
        nombre: 'Básica',
        precioCompra: 8000,
        precioVenta: 15000,
        colorIds: [color],
        talleIds: [talle],
        cantidades: [{ colorId: color, talleId: talle, cantidad: 20 }],
      })
      .expect(201)
  ).body;
  variante = p.variantes[0].id;
  alquiler = (await agent.post('/api/caja/conceptos').send({ nombre: 'Alquiler', tipo: 'GASTO' }).expect(201)).body.id;
  sueldos = (await agent.post('/api/caja/conceptos').send({ nombre: 'Sueldos', tipo: 'GASTO' }).expect(201)).body.id;
  aporte = (await agent.post('/api/caja/conceptos').send({ nombre: 'Cambio inicial', tipo: 'INGRESO' }).expect(201)).body.id;
  proveedor = (await agent.post('/api/proveedores').send({ nombre: 'Textil Sur' }).expect(201)).body.id;
});
afterAll(() => prisma.$disconnect());

const vender = (cantidad: number, pagos: object[]) =>
  agent.post('/api/ventas').send({ items: [{ varianteId: variante, cantidad, precioUnitario: 15000 }], pagos }).expect(201);

describe('caja del día', () => {
  it('suma ventas por medio, ingresos y gastos manuales y compras pagadas con la caja', async () => {
    await vender(2, [{ medio: 'EFECTIVO', monto: 30000 }]);
    await vender(1, [{ medio: 'DEBITO', monto: 15000 }]);
    const anulada = await vender(1, [{ medio: 'EFECTIVO', monto: 15000 }]);
    await agent.post(`/api/ventas/${anulada.body.id}/anular`).send({ motivo: 'Error' }).expect(200);

    await agent.post('/api/caja/movimientos').send({ tipo: 'INGRESO', conceptoId: aporte, monto: '5.000' }).expect(201);
    await agent
      .post('/api/caja/movimientos')
      .send({ tipo: 'GASTO', conceptoId: alquiler, monto: '20.000', medio: 'TRANSFERENCIA', detalle: 'Noviembre' })
      .expect(201);
    await agent
      .post('/api/ingresos')
      .send({ proveedorId: proveedor, pagadoConCaja: true, items: [{ varianteId: variante, cantidad: 1, costoUnitario: 8000 }] })
      .expect(201);
    // Una compra que NO se pagó con la caja no cuenta.
    await agent.post('/api/ingresos').send({ items: [{ varianteId: variante, cantidad: 1, costoUnitario: 8000 }] }).expect(201);

    const r = (await agent.get('/api/caja/dia').expect(200)).body;
    expect(r.fecha).toBe(HOY);
    expect(r.ventas).toEqual({
      cantidad: 2,
      porMedio: [
        { medio: 'EFECTIVO', total: 30000 },
        { medio: 'DEBITO', total: 15000 },
      ],
    });
    expect(r.totales).toEqual({
      ventas: 45000,
      otrosIngresos: 5000,
      gastos: 28000,
      saldo: 22000,
      // 30.000 ventas en efectivo + 5.000 de cambio − 8.000 de mercadería (el alquiler fue por transferencia).
      efectivo: 27000,
    });
    expect(r.movimientos.map((m: { concepto: string; origen: string; detalle: string | null }) => [m.concepto, m.origen, m.detalle])).toEqual([
      ['Cambio inicial', 'MANUAL', null],
      ['Alquiler', 'MANUAL', 'Noviembre'],
      ['Compra de mercadería', 'MERCADERIA', 'Textil Sur'],
    ]);
  });

  it('los días sin movimientos dan todo en cero', async () => {
    const r = (await agent.get('/api/caja/dia?fecha=2026-01-05').expect(200)).body;
    expect(r).toMatchObject({ movimientos: [], ventas: { cantidad: 0, porMedio: [] }, totales: { saldo: 0, efectivo: 0 } });
  });
});

describe('movimientos manuales', () => {
  it('validan monto, concepto y que el concepto sea del tipo correcto', async () => {
    const sinMonto = await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: '' }).expect(400);
    expect(sinMonto.body.campos.monto).toBe('Ingresá un monto');
    const cero = await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: 0 }).expect(400);
    expect(cero.body.error).toBe('El monto tiene que ser mayor a 0');
    const sinConcepto = await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', monto: 100 }).expect(400);
    expect(sinConcepto.body.campos.conceptoId).toBe('Elegí el concepto');
    const cruzado = await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: aporte, monto: 100 }).expect(400);
    expect(cruzado.body.error).toBe('Ese concepto es de ingresos: elegí un concepto de gastos');
    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: 100, fecha: '2099-01-01' }).expect(400);
    expect(await prisma.movimientoCaja.count()).toBe(0);
  });

  it('se editan y se borran', async () => {
    const { id } = (await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: 1000 }).expect(201)).body;
    await agent.put(`/api/caja/movimientos/${id}`).send({ tipo: 'GASTO', conceptoId: sueldos, monto: '2.500,50' }).expect(200);
    const dia = (await agent.get('/api/caja/dia')).body;
    expect(dia.movimientos[0]).toMatchObject({ concepto: 'Sueldos', monto: 2500.5, medio: 'EFECTIVO' });
    await agent.delete(`/api/caja/movimientos/${id}`).expect(204);
    await agent.delete(`/api/caja/movimientos/${id}`).expect(404);
    expect((await agent.get('/api/caja/dia')).body.totales.gastos).toBe(0);
  });

  it('un concepto desactivado no se puede elegir y uno usado no cambia de tipo', async () => {
    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: 1000 }).expect(201);
    await agent.put(`/api/caja/conceptos/${alquiler}`).send({ nombre: 'Alquiler', tipo: 'INGRESO' }).expect(400);
    await agent.put(`/api/caja/conceptos/${sueldos}`).send({ nombre: 'Sueldos', tipo: 'GASTO', activo: false }).expect(200);
    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: sueldos, monto: 1000 }).expect(400);
    expect((await agent.get('/api/caja/conceptos?activos=1')).body.map((c: { nombre: string }) => c.nombre)).toEqual(['Alquiler', 'Cambio inicial']);
    await agent.post('/api/caja/conceptos').send({ nombre: 'Alquiler', tipo: 'GASTO' }).expect(409);
  });
});

describe('caja del mes', () => {
  it('totaliza por día y por mes, con gastos por concepto', async () => {
    // Un día anterior del mismo mes (si hoy es día 1, usamos hoy para los dos).
    const otroDia = HOY.endsWith('-01') ? HOY : `${MES}-01`;
    const v = await vender(1, [{ medio: 'CREDITO', monto: 15000 }]);
    await prisma.venta.update({ where: { id: v.body.id }, data: { creadoEn: new Date(`${otroDia}T23:30:00-03:00`) } });
    await vender(2, [{ medio: 'EFECTIVO', monto: 30000 }]);
    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: 20000, fecha: otroDia }).expect(201);
    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: sueldos, monto: 5000 }).expect(201);
    await agent
      .post('/api/ingresos')
      .send({ pagadoConCaja: true, items: [{ varianteId: variante, cantidad: 2, costoUnitario: 8000 }] })
      .expect(201);
    // Otro mes: no cuenta.
    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: 99999, fecha: '2025-12-31' }).expect(201);

    const r = (await agent.get(`/api/caja/mes?mes=${MES}`).expect(200)).body;
    expect(r.totales).toEqual({ ventas: 45000, otrosIngresos: 0, gastos: 41000, saldo: 4000, efectivo: 30000 - 41000 });
    expect(r.ventasPorMedio).toEqual([
      { medio: 'EFECTIVO', total: 30000 },
      { medio: 'CREDITO', total: 15000 },
    ]);
    expect(r.gastosPorConcepto).toEqual([
      { concepto: 'Alquiler', total: 20000 },
      { concepto: 'Compra de mercadería', total: 16000 },
      { concepto: 'Sueldos', total: 5000 },
    ]);
    if (otroDia !== HOY) {
      expect(r.dias.map((d: { fecha: string; saldo: number }) => [d.fecha, d.saldo])).toEqual([
        [otroDia, 15000 - 20000],
        [HOY, 30000 - 5000 - 16000],
      ]);
    }
    await agent.get('/api/caja/mes?mes=2026-13').expect(400);
  });
});
