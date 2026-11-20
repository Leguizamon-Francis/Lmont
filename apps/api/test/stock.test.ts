import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { hoy } from '@lmont/shared';
import { prisma } from '../src/db.js';
import { moverStock } from '../src/catalogo/stock.js';
import { agenteLogueado, crearUsuario, limpiarDb } from './helpers.js';

let agent: TestAgent;
let proveedor: number;
/** Producto "Remeras Básica" (costo 8.000) con Negro S / Negro M, y "Remeras Oversize" con Negro S. */
let p1: { id: number; variantes: { id: number; talle: { nombre: string } }[] };
let p2: { id: number; variantes: { id: number }[] };
let negroS: number;
let negroM: number;
let oversizeS: number;

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
  agent = await agenteLogueado();
  const tipo = (await agent.post('/api/tipos').send({ nombre: 'Remeras' })).body.id;
  const negro = (await agent.post('/api/colores').send({ nombre: 'Negro' })).body.id;
  const s = (await agent.post('/api/talles').send({ nombre: 'S' })).body.id;
  const m = (await agent.post('/api/talles').send({ nombre: 'M' })).body.id;
  const base = { tipoId: tipo, precioCompra: '8.000', precioVenta: '15.000', colorIds: [negro] };
  p1 = (await agent.post('/api/productos').send({ ...base, nombre: 'Básica', talleIds: [s, m] }).expect(201)).body;
  p2 = (await agent.post('/api/productos').send({ ...base, nombre: 'Oversize', talleIds: [s] }).expect(201)).body;
  [negroS, negroM] = p1.variantes.map((v) => v.id) as [number, number];
  oversizeS = p2.variantes[0]!.id;
  proveedor = (await agent.post('/api/proveedores').send({ nombre: 'Textil Sur', whatsapp: '342 555-1234' }).expect(201)).body.id;
});
afterAll(() => prisma.$disconnect());

const stockDe = async (id: number) => (await prisma.variante.findUniqueOrThrow({ where: { id } })).stock;

describe('proveedores', () => {
  it('crea y edita, guardando solo los dígitos del WhatsApp', async () => {
    const lista = await agent.get('/api/proveedores').expect(200);
    expect(lista.body[0]).toMatchObject({ nombre: 'Textil Sur', whatsapp: '3425551234' });
    await agent.put(`/api/proveedores/${proveedor}`).send({ nombre: 'Textil Sur', activo: false }).expect(200);
    expect((await agent.get('/api/proveedores?activos=1')).body).toEqual([]);
  });
});

describe('ingresos de mercadería', () => {
  it('suma stock, registra los movimientos y calcula el total', async () => {
    const r = await agent
      .post('/api/ingresos')
      .send({
        proveedorId: proveedor,
        pagadoConCaja: true,
        nota: 'Pedido de noviembre',
        items: [
          { varianteId: negroS, cantidad: 3, costoUnitario: '8.000' },
          { varianteId: negroM, cantidad: '2', costoUnitario: '8.000' },
          { varianteId: oversizeS, cantidad: 1, costoUnitario: '9.500,50' },
        ],
      })
      .expect(201);
    expect(r.body).toMatchObject({ fecha: hoy(), total: 49500.5, unidades: 6, pagadoConCaja: true, proveedor: { nombre: 'Textil Sur' } });
    expect(r.body.items[0].variante).toMatchObject({ talle: { nombre: 'S' }, producto: { nombre: 'Básica' } });

    expect(await stockDe(negroS)).toBe(3);
    expect(await stockDe(negroM)).toBe(2);
    const movs = await prisma.movimientoStock.findMany({ where: { tipo: 'INGRESO' } });
    expect(movs).toHaveLength(3);
    expect(movs.every((m) => m.ingresoId === r.body.id)).toBe(true);

    // Un segundo ingreso suma sobre lo que había.
    await agent.post('/api/ingresos').send({ items: [{ varianteId: negroS, cantidad: 4, costoUnitario: 8000 }] }).expect(201);
    expect(await stockDe(negroS)).toBe(7);
    const lista = await agent.get('/api/ingresos').expect(200);
    expect(lista.body.total).toBe(2);
    expect(lista.body.ingresos[0]).toMatchObject({ unidades: 4, proveedor: null });
  });

  it('si cambió el costo, actualiza el precio de compra y lo guarda en el historial', async () => {
    const r = await agent
      .post('/api/ingresos')
      .send({
        items: [
          { varianteId: negroS, cantidad: 1, costoUnitario: '9.000' },
          { varianteId: oversizeS, cantidad: 1, costoUnitario: '8.000' },
        ],
      })
      .expect(201);
    expect(r.body.preciosActualizados).toEqual([{ productoId: p1.id, nombre: 'Remeras Básica', antes: 8000, ahora: 9000 }]);
    const prod = await agent.get(`/api/productos/${p1.id}`).expect(200);
    expect(prod.body).toMatchObject({ precioCompra: 9000, precioVenta: 15000 });
    const precios = await agent.get(`/api/productos/${p1.id}/precios`).expect(200);
    expect(precios.body.map((h: { precioCompra: number }) => h.precioCompra)).toEqual([9000, 8000]);
    // El otro producto no cambió.
    expect((await agent.get(`/api/productos/${p2.id}/precios`)).body).toHaveLength(1);
  });

  it('no permite dos costos distintos para el mismo modelo', async () => {
    const r = await agent.post('/api/ingresos').send({
      items: [
        { varianteId: negroS, cantidad: 1, costoUnitario: 8000 },
        { varianteId: negroM, cantidad: 1, costoUnitario: 8500 },
      ],
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Remeras Básica tiene costos distintos: usá un solo costo por modelo');
  });

  it('si algo falla no guarda nada (transacción)', async () => {
    const r = await agent.post('/api/ingresos').send({
      items: [
        { varianteId: negroS, cantidad: 5, costoUnitario: 8000 },
        { varianteId: 99999, cantidad: 1, costoUnitario: 8000 },
      ],
    });
    expect(r.status).toBe(400);
    expect(await stockDe(negroS)).toBe(0);
    expect(await prisma.ingreso.count()).toBe(0);
    expect(await prisma.movimientoStock.count()).toBe(0);
  });

  it('valida proveedor, cantidades, fecha y prendas repetidas', async () => {
    await agent.put(`/api/proveedores/${proveedor}`).send({ nombre: 'Textil Sur', activo: false }).expect(200);
    const item = { varianteId: negroS, cantidad: 1, costoUnitario: 8000 };
    expect((await agent.post('/api/ingresos').send({ proveedorId: proveedor, items: [item] })).body.campos.proveedorId).toBe(
      'Elegí un proveedor de la lista',
    );
    expect((await agent.post('/api/ingresos').send({ items: [] })).body.error).toBe('Agregá al menos una prenda');
    expect((await agent.post('/api/ingresos').send({ items: [{ ...item, cantidad: 0 }] })).status).toBe(400);
    expect((await agent.post('/api/ingresos').send({ fecha: '2999-01-01', items: [item] })).body.campos.fecha).toBe(
      'La fecha no puede ser posterior a hoy',
    );
    expect((await agent.post('/api/ingresos').send({ items: [item, item] })).status).toBe(400);
  });

  it('guarda la fecha indicada sin correrla de día', async () => {
    const r = await agent.post('/api/ingresos').send({ fecha: '2026-01-31', items: [{ varianteId: negroS, cantidad: 1, costoUnitario: 8000 }] });
    expect(r.body.fecha).toBe('2026-01-31');
  });
});

describe('ajustes de stock', () => {
  beforeEach(async () => {
    await agent.post('/api/ingresos').send({ items: [{ varianteId: negroS, cantidad: 5, costoUnitario: 8000 }] }).expect(201);
  });

  it('registra la diferencia con el motivo', async () => {
    const r = await agent.post(`/api/variantes/${negroS}/ajuste`).send({ stockReal: '3', motivo: 'ROTURA', nota: 'Manchadas' }).expect(200);
    expect(r.body.stock).toBe(3);
    const movs = await agent.get(`/api/variantes/${negroS}/movimientos`).expect(200);
    expect(movs.body[0]).toMatchObject({ tipo: 'AJUSTE', cantidad: -2, stockResultante: 3, detalle: 'Rotura o falla: Manchadas' });
    expect(movs.body[1]).toMatchObject({ tipo: 'INGRESO', cantidad: 5, stockResultante: 5 });

    await agent.post(`/api/variantes/${negroS}/ajuste`).send({ stockReal: 4, motivo: 'RECUENTO' }).expect(200);
    expect(await stockDe(negroS)).toBe(4);
  });

  it('rechaza ajustes sin cambio, negativos o sin explicación', async () => {
    expect((await agent.post(`/api/variantes/${negroS}/ajuste`).send({ stockReal: 5, motivo: 'RECUENTO' })).body.error).toBe(
      'El stock ya es 5: no hay nada que ajustar',
    );
    expect((await agent.post(`/api/variantes/${negroS}/ajuste`).send({ stockReal: -1, motivo: 'RECUENTO' })).status).toBe(400);
    expect((await agent.post(`/api/variantes/${negroS}/ajuste`).send({ stockReal: 1, motivo: 'OTRO' })).body.campos.nota).toBe(
      'Contá brevemente el motivo',
    );
    expect(await stockDe(negroS)).toBe(5);
  });
});

describe('stock nunca negativo', () => {
  it('dos descuentos simultáneos no pueden dejar el stock por debajo de 0', async () => {
    await agent.post('/api/ingresos').send({ items: [{ varianteId: negroS, cantidad: 5, costoUnitario: 8000 }] }).expect(201);
    const descontar = () => prisma.$transaction((tx) => moverStock(tx, negroS, -3, 'AJUSTE'));
    const resultados = await Promise.allSettled([descontar(), descontar()]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const fallo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(fallo.reason.message).toBe('No hay stock suficiente');
    expect(await stockDe(negroS)).toBe(2);
  });
});

describe('stock bajo', () => {
  it('lista las variantes en o por debajo del mínimo, y opcionalmente las que están en 0', async () => {
    await agent.post('/api/ingresos').send({ items: [{ varianteId: negroS, cantidad: 2, costoUnitario: 8000 }, { varianteId: negroM, cantidad: 9, costoUnitario: 8000 }] });
    await agent.put(`/api/variantes/${negroS}`).send({ codigoBarras: null, stockMinimo: 2 }).expect(200);
    await agent.put(`/api/variantes/${negroM}`).send({ codigoBarras: null, stockMinimo: 2 }).expect(200);

    const bajo = await agent.get('/api/stock/bajo').expect(200);
    expect(bajo.body.map((v: { id: number }) => v.id)).toEqual([negroS]);
    const conCero = await agent.get('/api/stock/bajo?sinStock=1').expect(200);
    expect(conCero.body.map((v: { id: number }) => v.id)).toEqual([negroS, oversizeS]);

    const resumen = await agent.get('/api/stock/resumen').expect(200);
    expect(resumen.body).toEqual({ stockBajo: 1, sinStock: 1, unidades: 11 });
  });
});
