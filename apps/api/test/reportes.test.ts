import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { hoy } from '@lmont/shared';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearPlanesBase, crearUsuario, limpiarDb } from './helpers.js';

let agent: TestAgent;
/** Remera Básica: costo 8.000, venta 15.000. Negro M (10) y Blanco M (10). */
let remera: number;
let negro: number;
let blanco: number;
/** Bermuda Rústica: costo 12.000, venta 25.000, 4 en stock. Nunca se vende. */
let bermuda: number;
let alquiler: number;
let retiro: number;

const MES = hoy().slice(0, 7);

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
  await crearPlanesBase();
  // Crédito con 10 % de recargo.
  await prisma.planPago.updateMany({ where: { medio: 'CREDITO' }, data: { porcentaje: 10 } });
  agent = await agenteLogueado();
  const tipo = async (nombre: string) => (await agent.post('/api/tipos').send({ nombre })).body.id as number;
  const color = async (nombre: string) => (await agent.post('/api/colores').send({ nombre })).body.id as number;
  const [cNegro, cBlanco] = [await color('Negro'), await color('Blanco')];
  const m = (await agent.post('/api/talles').send({ nombre: 'M' })).body.id;

  const r = (
    await agent
      .post('/api/productos')
      .send({
        tipoId: await tipo('Remera'),
        nombre: 'Básica',
        precioCompra: 8000,
        precioVenta: 15000,
        colorIds: [cNegro, cBlanco],
        talleIds: [m],
        cantidades: [
          { colorId: cNegro, talleId: m, cantidad: 10 },
          { colorId: cBlanco, talleId: m, cantidad: 10 },
        ],
      })
      .expect(201)
  ).body;
  remera = r.id;
  negro = r.variantes.find((v: { color: { nombre: string } }) => v.color.nombre === 'Negro').id;
  blanco = r.variantes.find((v: { color: { nombre: string } }) => v.color.nombre === 'Blanco').id;
  bermuda = (
    await agent
      .post('/api/productos')
      .send({
        tipoId: await tipo('Bermuda'),
        nombre: 'Rústica',
        precioCompra: 12000,
        precioVenta: 25000,
        colorIds: [cNegro],
        talleIds: [m],
        cantidades: [{ colorId: cNegro, talleId: m, cantidad: 4 }],
      })
      .expect(201)
  ).body.id;

  alquiler = (await agent.post('/api/caja/conceptos').send({ nombre: 'Alquiler', tipo: 'GASTO' }).expect(201)).body.id;
  retiro = (await agent.post('/api/caja/conceptos').send({ nombre: 'Retiro', tipo: 'GASTO', cuentaEnGanancia: false }).expect(201)).body.id;
});
afterAll(() => prisma.$disconnect());

const vender = async (varianteId: number, cantidad: number, medio = 'EFECTIVO', extra: object = {}) =>
  (
    await agent
      .post('/api/ventas')
      .send({ items: [{ varianteId, cantidad, precioUnitario: 15000 }], pagos: [{ medio, monto: cantidad * 15000 }], ...extra })
      .expect(201)
  ).body;

describe('reporte del mes', () => {
  it('ganancia = ventas − costo − gastos, con devoluciones, sin recargos de tarjeta, anuladas ni retiros', async () => {
    const v1 = await vender(negro, 2); // 30.000, costo 16.000
    await vender(blanco, 1, 'CREDITO'); // 15.000 + 1.500 de recargo (no es ganancia), costo 8.000
    const anulada = await vender(negro, 3);
    await agent.post(`/api/ventas/${anulada.id}/anular`).send({ motivo: 'Error' }).expect(200);

    // Devuelve una remera negra de la primera venta: se le reintegran 15.000.
    await agent
      .post('/api/cambios')
      .send({ ventaId: v1.id, devueltos: [{ ventaItemId: v1.items[0].id, cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(201);

    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: alquiler, monto: '20.000' }).expect(201);
    await agent.post('/api/caja/movimientos').send({ tipo: 'GASTO', conceptoId: retiro, monto: '5.000' }).expect(201);
    // La compra de mercadería no es gasto: su costo cuenta cuando se vende.
    await agent.post('/api/ingresos').send({ pagadoConCaja: true, items: [{ varianteId: negro, cantidad: 1, costoUnitario: 8000 }] }).expect(201);

    const r = (await agent.get('/api/reportes/mes').expect(200)).body;
    expect(r.mes).toBe(MES);
    expect(r.resultado).toEqual({
      cantidadVentas: 2,
      unidades: 2,
      ventasProductos: 30000,
      descuentosMedios: 0,
      recargos: 1500,
      ingresos: 30000,
      costo: 16000,
      gananciaBruta: 14000,
      gastos: 20000,
      ganancia: -6000,
    });
    expect(r.gastosPorConcepto).toEqual([{ concepto: 'Alquiler', total: 20000 }]);
    expect(r.gastosNoCuentan).toBe(5000);
    expect(r.dias).toEqual([{ fecha: hoy(), cantidadVentas: 2, unidades: 2, ingresos: 30000, gananciaBruta: 14000 }]);
    expect(r.promociones).toEqual([]);
  });

  it('un cambio suma lo que se lleva, resta lo que devuelve y cuenta la diferencia cobrada', async () => {
    const v = await vender(negro, 1);
    // Cambia la remera por una bermuda: paga 10.000 de diferencia con crédito (+10 %).
    const bermudaM = (await prisma.variante.findFirstOrThrow({ where: { productoId: bermuda } })).id;
    await agent
      .post('/api/cambios')
      .send({
        ventaId: v.id,
        devueltos: [{ ventaItemId: v.items[0].id, cantidad: 1 }],
        llevados: [{ varianteId: bermudaM, cantidad: 1, precioUnitario: 25000 }],
        pagos: [{ medio: 'CREDITO', monto: 10000 }],
      })
      .expect(201);

    const r = (await agent.get(`/api/reportes/mes?mes=${MES}`).expect(200)).body.resultado;
    expect(r).toMatchObject({ unidades: 1, ventasProductos: 25000, recargos: 1000, ingresos: 25000, costo: 12000, gananciaBruta: 13000 });
  });

  it('promociones vendidas', async () => {
    const promo = (
      await agent
        .post('/api/promociones')
        .send({ nombre: '2 remeras', modo: 'PRECIO_FIJO', precio: '25.000', componentes: [{ productoId: remera, cantidad: 2 }] })
        .expect(201)
    ).body.id;
    const conPromo = (veces: number) =>
      agent
        .post('/api/ventas')
        .send({
          items: [{ varianteId: negro, cantidad: 2 * veces, precioUnitario: 15000 }],
          pagos: [{ medio: 'EFECTIVO', monto: 25000 * veces }],
          promos: [{ promocionId: promo, veces }],
        })
        .expect(201);
    await conPromo(1);
    await conPromo(2);

    const r = (await agent.get('/api/reportes/mes').expect(200)).body;
    expect(r.promociones).toEqual([{ promocionId: promo, nombre: '2 remeras', veces: 3, precio: 75000, descuento: 15000 }]);
    expect(r.resultado).toMatchObject({ unidades: 6, ventasProductos: 75000, costo: 48000 });
  });

  it('un mes sin movimientos da todo en cero y valida el mes', async () => {
    const r = (await agent.get('/api/reportes/mes?mes=2020-01').expect(200)).body;
    expect(r.resultado.ganancia).toBe(0);
    expect(r.dias).toEqual([]);
    const e = (await agent.get('/api/reportes/mes?mes=2020-13').expect(400)).body;
    expect(e.error).toMatch(/Mes inválido/);
  });
});

describe('reporte de los últimos 12 meses', () => {
  it('devuelve 12 meses y el último es el actual', async () => {
    await vender(negro, 1);
    const r = (await agent.get('/api/reportes/meses').expect(200)).body.meses;
    expect(r).toHaveLength(12);
    expect(r[11]).toMatchObject({ mes: MES, cantidadVentas: 1, ingresos: 15000, gananciaBruta: 7000 });
    expect(r[0].ingresos).toBe(0);
  });
});

describe('reporte de productos', () => {
  it('lo más vendido con sus combinaciones y lo que no se vende con la plata parada', async () => {
    await vender(negro, 3);
    await vender(blanco, 1);

    const r = (await agent.get('/api/reportes/productos?dias=30').expect(200)).body;
    expect(r.dias).toBe(30);
    expect(r.masVendidos).toEqual([
      {
        productoId: remera,
        producto: 'Básica',
        tipo: 'Remera',
        unidades: 4,
        importe: 60000,
        ganancia: 28000,
        stock: 16,
        variantes: [
          { color: 'Negro', talle: 'M', unidades: 3, stock: 7 },
          { color: 'Blanco', talle: 'M', unidades: 1, stock: 9 },
        ],
      },
    ]);
    expect(r.sinVentas).toEqual([
      { productoId: bermuda, producto: 'Rústica', tipo: 'Bermuda', stock: 4, valorStock: 48000, ultimaVenta: null },
    ]);

    await agent.get('/api/reportes/productos?dias=7').expect(400);
  });

  it('muestra la última venta de un producto que hace mucho no se vende', async () => {
    const v = await vender(negro, 1);
    await prisma.venta.update({ where: { id: v.id }, data: { creadoEn: new Date('2026-01-10T15:00:00Z') } });
    const r = (await agent.get('/api/reportes/productos?dias=30').expect(200)).body;
    expect(r.masVendidos).toEqual([]);
    expect(r.sinVentas.find((p: { productoId: number }) => p.productoId === remera)).toMatchObject({ ultimaVenta: '2026-01-10', valorStock: 152000 });
  });
});
