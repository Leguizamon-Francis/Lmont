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
let negroL: number;
/** Bermuda Rústica: costo 12.000, venta 25.000, 4 en stock. Nunca se vende. */
let bermuda: number;
let talleL: number;
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
  talleL = (await agent.post('/api/talles').send({ nombre: 'L' })).body.id;

  const r = (
    await agent
      .post('/api/productos')
      .send({
        tipoId: await tipo('Remera'),
        nombre: 'Básica',
        precioCompra: 8000,
        precioVenta: 15000,
        colorIds: [cNegro, cBlanco],
        // L arranca sin stock.
        talleIds: [m, talleL],
        cantidades: [
          { colorId: cNegro, talleId: m, cantidad: 10 },
          { colorId: cBlanco, talleId: m, cantidad: 10 },
        ],
      })
      .expect(201)
  ).body;
  remera = r.id;
  type V = { id: number; color: { nombre: string }; talle: { nombre: string } };
  const variante = (color: string, talle: string) => (r.variantes as V[]).find((v) => v.color.nombre === color && v.talle.nombre === talle)!.id;
  negro = variante('Negro', 'M');
  blanco = variante('Blanco', 'M');
  negroL = variante('Negro', 'L');
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


const HOY = hoy();
/** Fecha "AAAA-MM-DD" a n días de hoy. */
const diaRelativo = (n: number) => {
  const d = new Date(`${HOY}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Mueve una venta a otra fecha (a las 15 h del local). */
const moverVenta = (id: number, fecha: string) =>
  prisma.venta.update({ where: { id }, data: { creadoEn: new Date(`${fecha}T15:00:00-03:00`) } });
const itemDe = (v: { items: { id: number; variante: { id: number } }[] }, varianteId: number) => v.items.find((it) => it.variante.id === varianteId)!.id;
/** Últimos 30 días, incluido hoy. */
const ULTIMOS_30 = `desde=${diaRelativo(-29)}&hasta=${HOY}`;

describe('resumen del período', () => {
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

    const r = (await agent.get('/api/reportes/resumen').expect(200)).body;
    // Sin fechas: del 1 del mes a hoy.
    expect([r.desde, r.hasta]).toEqual([`${MES}-01`, HOY]);
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
      // Solo ventas (sin la devolución): 30.000 y 15.000; 2 y 1 prendas.
      ticketPromedio: 22500,
      prendasPorVenta: 1.5,
    });
    expect(r.gastosPorConcepto).toEqual([{ concepto: 'Alquiler', total: 20000 }]);
    expect(r.gastosNoCuentan).toBe(5000);
    expect(r.agrupacion).toBe('dia');
    // Un punto por día, aunque no haya ventas.
    expect(r.serie).toHaveLength(Number(HOY.slice(8)));
    expect(r.serie.at(-1)).toEqual({ fecha: HOY, cantidadVentas: 2, unidades: 2, ingresos: 30000, gananciaBruta: 14000 });
    expect(r.promociones).toEqual([]);
  });

  it('se compara con el período anterior y con el mismo período del año pasado', async () => {
    await vender(negro, 1);
    await moverVenta((await vender(negro, 2)).id, diaRelativo(-1));
    const haceUnAnio = `${Number(HOY.slice(0, 4)) - 1}${HOY.slice(4)}`;
    if (!HOY.endsWith('02-29')) await moverVenta((await vender(blanco, 3)).id, haceUnAnio);

    const r = (await agent.get(`/api/reportes/resumen?desde=${HOY}&hasta=${HOY}`).expect(200)).body;
    expect(r.resultado).toMatchObject({ cantidadVentas: 1, unidades: 1, ingresos: 15000 });
    expect(r.anterior).toMatchObject({ desde: diaRelativo(-1), hasta: diaRelativo(-1), resultado: { cantidadVentas: 1, unidades: 2, ingresos: 30000 } });
    if (!HOY.endsWith('02-29')) {
      expect(r.anioAnterior).toMatchObject({ desde: haceUnAnio, hasta: haceUnAnio, resultado: { unidades: 3, ingresos: 45000 } });
    }
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

    const r = (await agent.get('/api/reportes/resumen').expect(200)).body.resultado;
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

    const r = (await agent.get('/api/reportes/resumen').expect(200)).body;
    expect(r.promociones).toEqual([{ promocionId: promo, nombre: '2 remeras', veces: 3, precio: 75000, descuento: 15000 }]);
    expect(r.resultado).toMatchObject({ unidades: 6, ventasProductos: 75000, costo: 48000 });
  });

  it('un período sin movimientos da todo en cero; los largos se agrupan por mes; valida las fechas', async () => {
    const enero = (await agent.get('/api/reportes/resumen?desde=2020-01-01&hasta=2020-01-31').expect(200)).body;
    expect(enero.resultado.ganancia).toBe(0);
    expect(enero.serie).toHaveLength(31);
    expect(enero.anterior).toMatchObject({ desde: '2019-12-01', hasta: '2019-12-31' });

    const anio = (await agent.get('/api/reportes/resumen?desde=2020-01-01&hasta=2020-12-31').expect(200)).body;
    expect(anio.agrupacion).toBe('mes');
    expect(anio.serie.map((p: { fecha: string }) => p.fecha)).toEqual(Array.from({ length: 12 }, (_, i) => `2020-${String(i + 1).padStart(2, '0')}`));

    expect((await agent.get('/api/reportes/resumen?desde=2020-02-01&hasta=2020-01-01').expect(400)).body.error).toMatch(/anterior/);
    expect((await agent.get('/api/reportes/resumen?desde=ayer').expect(400)).body.error).toMatch(/Fecha inválida/);
    expect((await agent.get('/api/reportes/resumen?desde=2015-01-01&hasta=2020-01-01').expect(400)).body.error).toMatch(/3 años/);
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

describe('reporte de ventas', () => {
  it('por vendedor, medio de pago, día y hora, y ticket comparado con el período anterior', async () => {
    const ana = (await agent.post('/api/vendedores').send({ nombre: 'Ana' }).expect(201)).body.id;
    const beto = (await agent.post('/api/vendedores').send({ nombre: 'Beto' }).expect(201)).body.id;
    const v = await vender(negro, 2, 'EFECTIVO', { vendedorId: ana });
    await vender(blanco, 1, 'CREDITO', { vendedorId: beto }); // +1.500 de recargo
    await moverVenta((await vender(negro, 1, 'EFECTIVO', { vendedorId: ana })).id, diaRelativo(-1));
    // Devuelven una remera de la venta de Ana: se le descuenta a ella.
    await agent.post('/api/cambios').send({ ventaId: v.id, devueltos: [{ ventaItemId: v.items[0].id, cantidad: 1 }], medioReintegro: 'EFECTIVO' }).expect(201);

    const r = (await agent.get(`/api/reportes/ventas?desde=${HOY}&hasta=${HOY}`).expect(200)).body;
    expect(r.porVendedor).toEqual([
      { vendedorId: ana, nombre: 'Ana', ventas: 1, unidades: 2, importe: 30000, ticketPromedio: 30000, ganancia: 7000, devueltas: 1, importeAnterior: 15000 },
      { vendedorId: beto, nombre: 'Beto', ventas: 1, unidades: 1, importe: 15000, ticketPromedio: 15000, ganancia: 7000, devueltas: 0, importeAnterior: 0 },
    ]);
    expect(r.porMedio).toEqual([
      { medio: 'EFECTIVO', cuotas: 1, pagos: 1, cobrado: 30000, ajuste: 0 },
      { medio: 'CREDITO', cuotas: 1, pagos: 1, cobrado: 16500, ajuste: 1500 },
    ]);
    const dia = (new Date(`${HOY}T12:00:00Z`).getUTCDay() + 6) % 7;
    expect(r.calor.every((c: { dia: number }) => c.dia === dia)).toBe(true);
    expect(r.calor.reduce((s: number, c: { ventas: number }) => s + c.ventas, 0)).toBe(2);
    expect(r.ticket).toEqual({
      ventas: 2,
      promedio: 22500,
      prendasPorVenta: 1.5,
      anterior: { ventas: 1, promedio: 15000, prendasPorVenta: 1 },
      distribucion: [
        { prendas: '1', ventas: 1 },
        { prendas: '2', ventas: 1 },
        { prendas: '3', ventas: 0 },
        { prendas: '4 o más', ventas: 0 },
      ],
    });
  });
});

describe('reporte de mercadería', () => {
  it('lo vendido por tipo, talle, color y producto, lo que no se vende y el valor del stock', async () => {
    await vender(negro, 3);
    await vender(blanco, 1);

    const r = (await agent.get(`/api/reportes/mercaderia?${ULTIMOS_30}`).expect(200)).body;
    expect(r.dias).toBe(30);
    expect(r.productos).toEqual([
      {
        productoId: remera,
        producto: 'Básica',
        tipo: 'Remera',
        unidades: 4,
        importe: 60000,
        ganancia: 28000,
        margen: 46.67,
        stock: 16,
        porDia: 0.13,
        // 16 prendas a 4 cada 30 días.
        cobertura: 120,
        variantes: [
          { color: 'Negro', talle: 'M', unidades: 3, stock: 7 },
          { color: 'Blanco', talle: 'M', unidades: 1, stock: 9 },
        ],
      },
    ]);
    expect(r.porTipo).toEqual([
      { tipo: 'Remera', unidades: 4, importe: 60000, costo: 32000, ganancia: 28000, margen: 46.67, stock: 16 },
      { tipo: 'Bermuda', unidades: 0, importe: 0, costo: 0, ganancia: 0, margen: 0, stock: 4 },
    ]);
    // El talle L no se vendió ni tiene stock: no aparece.
    expect(r.talles).toEqual([
      { tipo: 'Remera', unidades: 4, filas: [{ nombre: 'M', unidades: 4, stock: 16 }] },
      { tipo: 'Bermuda', unidades: 0, filas: [{ nombre: 'M', unidades: 0, stock: 4 }] },
    ]);
    expect(r.colores[0]).toEqual({
      tipo: 'Remera',
      unidades: 4,
      filas: [
        { nombre: 'Negro', unidades: 3, stock: 7 },
        { nombre: 'Blanco', unidades: 1, stock: 9 },
      ],
    });
    expect(r.sinVentas).toEqual([{ productoId: bermuda, producto: 'Rústica', tipo: 'Bermuda', stock: 4, valorStock: 48000, ultimaVenta: null }]);
    expect(r.stock).toMatchObject({ unidades: 20, costo: 16 * 8000 + 4 * 12000, venta: 16 * 15000 + 4 * 25000 });
    expect(r.reponer).toEqual([]);
    expect(r.perdidas).toEqual({ unidades: 0, valor: 0, porMotivo: [], detalle: [] });
  });

  it('qué reponer, lo comprado a cada proveedor y las pérdidas por ajustes', async () => {
    await vender(negro, 9); // quedan 1
    const proveedor = (await agent.post('/api/proveedores').send({ nombre: 'Textil Sur' }).expect(201)).body.id;
    await agent.post('/api/ingresos').send({ proveedorId: proveedor, items: [{ varianteId: negro, cantidad: 5, costoUnitario: 8000 }] }).expect(201);
    await agent.post(`/api/variantes/${blanco}/ajuste`).send({ stockReal: 8, motivo: 'PERDIDA' }).expect(200);

    const r = (await agent.get(`/api/reportes/mercaderia?${ULTIMOS_30}`).expect(200)).body;
    // 9 en 30 días = 0,3 por día: las 6 que quedan duran 20 días; para 30 días faltan 3.
    expect(r.reponer).toEqual([
      { varianteId: negro, productoId: remera, producto: 'Básica', tipo: 'Remera', color: 'Negro', talle: 'M', vendidas: 9, stock: 6, cobertura: 20, sugerido: 3 },
    ]);
    expect(r.porProveedor).toEqual([
      { proveedorId: proveedor, proveedor: 'Textil Sur', comprado: 40000, unidadesCompradas: 5, vendidas: 9, importe: 135000, ganancia: 63000, margen: 46.67 },
    ]);
    expect(r.perdidas).toEqual({
      unidades: 2,
      valor: 16000,
      porMotivo: [{ motivo: 'Pérdida o robo', unidades: 2, valor: 16000 }],
      detalle: [{ fecha: HOY, productoId: remera, producto: 'Remera Básica', color: 'Blanco', talle: 'M', cantidad: -2, motivo: 'Pérdida o robo', valor: -16000 }],
    });
  });

  it('muestra la última venta de un producto que hace mucho no se vende', async () => {
    const v = await vender(negro, 1);
    await prisma.venta.update({ where: { id: v.id }, data: { creadoEn: new Date('2026-01-10T15:00:00Z') } });
    const r = (await agent.get(`/api/reportes/mercaderia?${ULTIMOS_30}`).expect(200)).body;
    expect(r.productos).toEqual([]);
    expect(r.sinVentas.find((p: { productoId: number }) => p.productoId === remera)).toMatchObject({ ultimaVenta: '2026-01-10', valorStock: 152000 });
  });
});

describe('reporte de clientes', () => {
  it('mejores clientes, los que no vuelven y nuevos por mes', async () => {
    const carla = (await agent.post('/api/clientes').send({ nombre: 'Carla' }).expect(201)).body.id;
    const dani = (await agent.post('/api/clientes').send({ nombre: 'Dani', whatsapp: '11 5555-1234' }).expect(201)).body.id;
    await vender(negro, 1, 'EFECTIVO', { clienteId: carla });
    await vender(negro, 1, 'EFECTIVO', { clienteId: carla });
    await vender(blanco, 1);
    await moverVenta((await vender(blanco, 2, 'EFECTIVO', { clienteId: dani })).id, diaRelativo(-200));

    const r = (await agent.get(`/api/reportes/clientes?desde=${HOY}&hasta=${HOY}&inactivos=180`).expect(200)).body;
    expect(r.resumen).toEqual({ ventas: 3, conCliente: 2, clientesDistintos: 1, nuevos: 1 });
    expect(r.mejores).toEqual([
      { clienteId: carla, nombre: 'Carla', whatsapp: null, compras: 2, prendas: 2, importe: 30000, ticketPromedio: 15000, ultima: HOY },
    ]);
    expect(r.inactivos.dias).toBe(180);
    expect(r.inactivos.clientes).toEqual([
      expect.objectContaining({ clienteId: dani, nombre: 'Dani', compras: 1, importe: 30000, ultima: diaRelativo(-200), dias: 200 }),
    ]);
    expect(r.meses).toHaveLength(12);
    expect(r.meses.at(-1)).toEqual({ mes: MES, nuevos: 1, recurrentes: 0, sinCliente: 1 });
    await agent.get('/api/reportes/clientes?inactivos=45').expect(400);
  });
});

describe('reporte de cambios y devoluciones', () => {
  it('por motivo, producto, talle y los cambios de talle', async () => {
    await agent.post('/api/ingresos').send({ items: [{ varianteId: negroL, cantidad: 3, costoUnitario: 8000 }] }).expect(201);
    const v = (
      await agent
        .post('/api/ventas')
        .send({
          items: [
            { varianteId: negro, cantidad: 2, precioUnitario: 15000 },
            { varianteId: blanco, cantidad: 1, precioUnitario: 15000 },
          ],
          pagos: [{ medio: 'EFECTIVO', monto: 45000 }],
        })
        .expect(201)
    ).body;
    // Cambia una negra M por una negra L (le quedaba chica).
    await agent
      .post('/api/cambios')
      .send({
        ventaId: v.id,
        motivo: 'TALLE',
        devueltos: [{ ventaItemId: itemDe(v, negro), cantidad: 1 }],
        llevados: [{ varianteId: negroL, cantidad: 1, precioUnitario: 15000 }],
      })
      .expect(201);
    // Devuelve la blanca: se le reintegran 15.000.
    await agent
      .post('/api/cambios')
      .send({ ventaId: v.id, motivo: 'GUSTO', devueltos: [{ ventaItemId: itemDe(v, blanco), cantidad: 1 }], medioReintegro: 'EFECTIVO' })
      .expect(201);
    await agent.post('/api/cambios').send({ ventaId: v.id, motivo: 'INVENTADO', devueltos: [{ ventaItemId: itemDe(v, negro), cantidad: 1 }] }).expect(400);

    const r = (await agent.get('/api/reportes/cambios').expect(200)).body;
    expect(r).toMatchObject({ cambios: 1, devoluciones: 1, unidadesDevueltas: 2, devuelto: 15000, unidadesVendidas: 3, tasa: 66.67 });
    expect(r.porMotivo).toEqual(expect.arrayContaining([{ motivo: 'TALLE', cantidad: 1 }, { motivo: 'GUSTO', cantidad: 1 }]));
    expect(r.porMotivo).toHaveLength(2);
    expect(r.porProducto).toEqual([{ productoId: remera, nombre: 'Básica', tipo: 'Remera', vendidas: 3, devueltas: 2, tasa: 66.67 }]);
    expect(r.porTalle).toEqual([{ nombre: 'M', vendidas: 3, devueltas: 2, tasa: 66.67 }]);
    expect(r.cambiosDeTalle).toEqual([{ productoId: remera, producto: 'Remera Básica', de: 'M', a: 'L', veces: 1 }]);
  });
});

describe('correcciones del reporte', () => {
  it('los cambios de talle se cuentan prenda por prenda', async () => {
    await agent.post('/api/ingresos').send({ items: [{ varianteId: negroL, cantidad: 3, costoUnitario: 8000 }] }).expect(201);
    const v = await vender(negro, 2);
    // Devuelve 2 negras M y se lleva 2 negras L: son 2 cambios de M a L (no 4).
    await agent
      .post('/api/cambios')
      .send({ ventaId: v.id, motivo: 'TALLE', devueltos: [{ ventaItemId: itemDe(v, negro), cantidad: 2 }], llevados: [{ varianteId: negroL, cantidad: 2, precioUnitario: 15000 }] })
      .expect(201);
    const r = (await agent.get('/api/reportes/cambios').expect(200)).body;
    expect(r.cambiosDeTalle).toEqual([{ productoId: remera, producto: 'Remera Básica', de: 'M', a: 'L', veces: 2 }]);
  });

  it('la ganancia del vendedor descuenta el descuento del medio de pago, igual que el resumen', async () => {
    await prisma.planPago.updateMany({ where: { medio: 'EFECTIVO' }, data: { porcentaje: -10 } });
    const ana = (await agent.post('/api/vendedores').send({ nombre: 'Ana' }).expect(201)).body.id;
    // 15.000 con 10 % en efectivo = 13.500; costo 8.000.
    await agent.post('/api/ventas').send({ vendedorId: ana, items: [{ varianteId: negro, cantidad: 1, precioUnitario: 15000 }], pagos: [{ medio: 'EFECTIVO', monto: 15000 }] }).expect(201);
    const ventas = (await agent.get('/api/reportes/ventas').expect(200)).body;
    const resumen = (await agent.get('/api/reportes/resumen').expect(200)).body;
    expect(ventas.porVendedor[0].ganancia).toBe(5500);
    expect(resumen.resultado.gananciaBruta).toBe(5500);
  });
});
