import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type TestAgent from 'supertest/lib/agent.js';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearUsuario, limpiarDb } from './helpers.js';

type Agent = TestAgent;

let agent: Agent;
let tipo: number;
let negro: number;
let blanco: number;
let s: number;
let m: number;

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
  agent = await agenteLogueado();
  tipo = (await agent.post('/api/tipos').send({ nombre: 'Remeras' }).expect(201)).body.id;
  negro = (await agent.post('/api/colores').send({ nombre: 'Negro' }).expect(201)).body.id;
  blanco = (await agent.post('/api/colores').send({ nombre: 'Blanco' }).expect(201)).body.id;
  s = (await agent.post('/api/talles').send({ nombre: 'S' }).expect(201)).body.id;
  m = (await agent.post('/api/talles').send({ nombre: 'M' }).expect(201)).body.id;
});
afterAll(() => prisma.$disconnect());

const producto = (extra: object = {}) => ({
  tipoId: tipo,
  nombre: 'Básica',
  precioCompra: '8.000',
  precioVenta: '15.000',
  ...extra,
});

describe('listas de talles, colores y tipos', () => {
  it('los talles nuevos van al final y se pueden reordenar', async () => {
    const l = (await agent.post('/api/talles').send({ nombre: 'L' }).expect(201)).body;
    expect(l.orden).toBeGreaterThan(20);

    const orden = await agent.put('/api/talles/orden').send({ ids: [l.id, m, s] }).expect(200);
    expect(orden.body.map((t: { nombre: string }) => t.nombre)).toEqual(['L', 'M', 'S']);
  });

  it('rechaza un orden que no incluye todos los talles', async () => {
    const r = await agent.put('/api/talles/orden').send({ ids: [s] });
    expect(r.status).toBe(400);
  });

  it('no permite colores repetidos y deja desactivar', async () => {
    const r = await agent.post('/api/colores').send({ nombre: 'Negro' });
    expect(r.status).toBe(409);
    await agent.put(`/api/colores/${negro}`).send({ nombre: 'Negro', activo: false }).expect(200);
    const activos = await agent.get('/api/colores?activos=1').expect(200);
    expect(activos.body.map((c: { nombre: string }) => c.nombre)).toEqual(['Blanco']);
  });
});

describe('productos', () => {
  it('crea el producto con sus variantes y el primer precio en el historial', async () => {
    const r = await agent
      .post('/api/productos')
      .send(producto({ colorIds: [negro, blanco], talleIds: [s, m], observaciones: 'Algodón peinado' }))
      .expect(201);
    expect(r.body).toMatchObject({ nombre: 'Básica', precioCompra: 8000, precioVenta: 15000, observaciones: 'Algodón peinado' });
    expect(r.body.variantes).toHaveLength(4);
    // Ordenadas por color y talle; arrancan con stock 0 y sin código.
    expect(r.body.variantes.map((v: { color: { nombre: string }; talle: { nombre: string } }) => `${v.color.nombre} ${v.talle.nombre}`)).toEqual([
      'Blanco S',
      'Blanco M',
      'Negro S',
      'Negro M',
    ]);
    expect(r.body.variantes.every((v: { stock: number; codigoBarras: null }) => v.stock === 0 && v.codigoBarras === null)).toBe(true);

    const precios = await agent.get(`/api/productos/${r.body.id}/precios`).expect(200);
    expect(precios.body).toHaveLength(1);
    expect(precios.body[0]).toMatchObject({ precioCompra: 8000, precioVenta: 15000 });
  });

  it('carga las unidades de cada combinación al crear y registra el movimiento', async () => {
    const r = await agent
      .post('/api/productos')
      .send(
        producto({
          colorIds: [negro, blanco],
          talleIds: [s, m],
          cantidades: [
            { colorId: negro, talleId: s, cantidad: '3' },
            { colorId: negro, talleId: m, cantidad: 5 },
            { colorId: blanco, talleId: s, cantidad: 0 },
          ],
        }),
      )
      .expect(201);
    const stock = Object.fromEntries(
      r.body.variantes.map((v: { color: { nombre: string }; talle: { nombre: string }; stock: number }) => [`${v.color.nombre} ${v.talle.nombre}`, v.stock]),
    );
    expect(stock).toEqual({ 'Negro S': 3, 'Negro M': 5, 'Blanco S': 0, 'Blanco M': 0 });

    const movs = await prisma.movimientoStock.findMany({ orderBy: { cantidad: 'asc' } });
    expect(movs.map((m) => [m.tipo, m.cantidad, m.stockResultante])).toEqual([
      ['CARGA_INICIAL', 3, 3],
      ['CARGA_INICIAL', 5, 5],
    ]);
    const lista = await agent.get('/api/productos').expect(200);
    expect(lista.body.productos[0].stockTotal).toBe(8);
  });

  it('rechaza cantidades de combinaciones no elegidas o negativas, sin crear nada', async () => {
    const ajena = await agent
      .post('/api/productos')
      .send(producto({ colorIds: [negro], talleIds: [s], cantidades: [{ colorId: blanco, talleId: s, cantidad: 2 }] }));
    expect(ajena.status).toBe(400);
    const negativa = await agent
      .post('/api/productos')
      .send(producto({ colorIds: [negro], talleIds: [s], cantidades: [{ colorId: negro, talleId: s, cantidad: -2 }] }));
    expect(negativa.status).toBe(400);
    expect(await prisma.producto.count()).toBe(0);
  });

  it('valida los datos en el servidor con mensajes en español', async () => {
    const r = await agent.post('/api/productos').send({ tipoId: '', nombre: ' ', precioCompra: 'abc', precioVenta: '-1' });
    expect(r.status).toBe(400);
    expect(r.body.campos).toMatchObject({
      tipoId: 'Elegí el tipo de prenda',
      nombre: 'Completá el modelo',
      precioCompra: 'Formato de monto inválido. Ejemplos válidos: 15.000 o 15000,50',
      precioVenta: 'El monto no puede ser negativo',
    });
  });

  it('pide talles si se eligieron colores y viceversa', async () => {
    const r = await agent.post('/api/productos').send(producto({ colorIds: [negro] }));
    expect(r.status).toBe(400);
    expect(r.body.campos.talleIds).toBe('Elegí al menos un talle');
  });

  it('no acepta tipos, colores o talles inexistentes o inactivos', async () => {
    expect((await agent.post('/api/productos').send(producto({ tipoId: 999 }))).body.campos.tipoId).toBeDefined();
    await agent.put(`/api/talles/${m}`).send({ nombre: 'M', activo: false }).expect(200);
    const r = await agent.post('/api/productos').send(producto({ colorIds: [negro], talleIds: [m] }));
    expect(r.status).toBe(400);
    expect(r.body.campos.talleIds).toBe('Elegí talles de la lista');
    // Nada quedó a medio crear.
    expect(await prisma.producto.count()).toBe(0);
  });

  it('no permite dos modelos con el mismo nombre en el mismo tipo', async () => {
    await agent.post('/api/productos').send(producto()).expect(201);
    const r = await agent.post('/api/productos').send(producto({ nombre: 'básica' }));
    expect(r.status).toBe(409);
    expect(r.body.campos.nombre).toBe('Ya existe un modelo con ese nombre en este tipo de prenda');
  });

  it('guarda en el historial solo los cambios de precio', async () => {
    const { id } = (await agent.post('/api/productos').send(producto()).expect(201)).body;
    await agent.put(`/api/productos/${id}`).send(producto({ observaciones: 'Nueva temporada' })).expect(200);
    let precios = await agent.get(`/api/productos/${id}/precios`).expect(200);
    expect(precios.body).toHaveLength(1);

    await agent.put(`/api/productos/${id}`).send(producto({ precioVenta: '17.500,50' })).expect(200);
    precios = await agent.get(`/api/productos/${id}/precios`).expect(200);
    expect(precios.body).toHaveLength(2);
    expect(precios.body[0].precioVenta).toBe(17500.5);
    expect(precios.body[1].precioVenta).toBe(15000);
  });

  it('busca por modelo, tipo, color o código de barras', async () => {
    const a = (await agent.post('/api/productos').send(producto({ colorIds: [negro], talleIds: [s] })).expect(201)).body;
    await agent.post('/api/productos').send(producto({ nombre: 'Oversize', colorIds: [blanco], talleIds: [s] })).expect(201);
    await agent.put(`/api/variantes/${a.variantes[0].id}`).send({ codigoBarras: '7791234567890', stockMinimo: 0 }).expect(200);

    const nombres = async (q: string) =>
      (await agent.get('/api/productos').query({ q }).expect(200)).body.productos.map((p: { nombre: string }) => p.nombre);
    expect(await nombres('over')).toEqual(['Oversize']);
    expect(await nombres('remeras')).toEqual(['Básica', 'Oversize']);
    expect(await nombres('remeras negro')).toEqual(['Básica']);
    expect(await nombres('7791234567890')).toEqual(['Básica']);
  });
});

describe('variantes', () => {
  async function crear() {
    return (await agent.post('/api/productos').send(producto({ colorIds: [negro], talleIds: [s, m] })).expect(201)).body;
  }

  it('agrega combinaciones nuevas sin duplicar las existentes', async () => {
    const p = await crear();
    const r = await agent.post(`/api/productos/${p.id}/variantes`).send({ colorIds: [negro, blanco], talleIds: [s, m] }).expect(201);
    expect(r.body.variantes).toHaveLength(4);
    const otra = await agent.post(`/api/productos/${p.id}/variantes`).send({ colorIds: [negro], talleIds: [s] });
    expect(otra.status).toBe(409);
  });

  it('al agregar combinaciones carga sus unidades, pero no suma a las que ya existían', async () => {
    const p = await crear(); // Negro S y M
    const r = await agent
      .post(`/api/productos/${p.id}/variantes`)
      .send({ colorIds: [negro, blanco], talleIds: [s], cantidades: [{ colorId: blanco, talleId: s, cantidad: 4 }] })
      .expect(201);
    const blancoS = r.body.variantes.find((v: { color: { nombre: string } }) => v.color.nombre === 'Blanco');
    expect(blancoS.stock).toBe(4);

    const existente = await agent
      .post(`/api/productos/${p.id}/variantes`)
      .send({ colorIds: [negro], talleIds: [s, m], cantidades: [{ colorId: negro, talleId: s, cantidad: 1 }] });
    expect(existente.status).toBe(400);
    expect(existente.body.error).toMatch(/ingreso de mercadería/);
  });

  it('el código de barras es único', async () => {
    const p = await crear();
    const [v1, v2] = p.variantes;
    await agent.put(`/api/variantes/${v1.id}`).send({ codigoBarras: 'ABC-123', stockMinimo: 2 }).expect(200);
    const r = await agent.put(`/api/variantes/${v2.id}`).send({ codigoBarras: 'ABC-123', stockMinimo: 0 });
    expect(r.status).toBe(409);
    expect(r.body.campos.codigoBarras).toBe('Ese código ya está cargado en Básica Negro talle S');
  });

  it('encuentra la variante al escanear el código', async () => {
    const p = await crear();
    await agent.put(`/api/variantes/${p.variantes[1].id}`).send({ codigoBarras: '7790000000001', stockMinimo: 0 }).expect(200);
    const r = await agent.get('/api/variantes/codigo/7790000000001').expect(200);
    expect(r.body).toMatchObject({
      talle: { nombre: 'M' },
      color: { nombre: 'Negro' },
      producto: { nombre: 'Básica', precioVenta: 15000, tipo: { nombre: 'Remeras' } },
    });
    const no = await agent.get('/api/variantes/codigo/000');
    expect(no.status).toBe(404);
    expect(no.body.error).toBe('No hay ningún producto con el código 000');
  });

  it('genera códigos internos EAN-13 para las variantes sin código', async () => {
    const p = await crear();
    await agent.put(`/api/variantes/${p.variantes[0].id}`).send({ codigoBarras: 'PROV-1', stockMinimo: 0 }).expect(200);
    const r = await agent.post(`/api/productos/${p.id}/codigos-internos`).expect(200);
    expect(r.body.variantes[0].codigoBarras).toBe('PROV-1');
    expect(r.body.variantes[1].codigoBarras).toMatch(/^20\d{11}$/);
    const otra = await agent.post(`/api/productos/${p.id}/codigos-internos`);
    expect(otra.status).toBe(409);
  });

  it('el stock no se puede editar desde la variante y nunca queda negativo', async () => {
    const p = await crear();
    const r = await agent.put(`/api/variantes/${p.variantes[0].id}`).send({ codigoBarras: null, stockMinimo: 3, stock: 50 }).expect(200);
    expect(r.body).toMatchObject({ stock: 0, stockMinimo: 3 });
    await expect(prisma.variante.update({ where: { id: p.variantes[0].id }, data: { stock: -1 } })).rejects.toThrow();
  });

  it('cuenta las variantes con stock bajo en el listado', async () => {
    const p = await crear();
    await agent.put(`/api/variantes/${p.variantes[0].id}`).send({ codigoBarras: null, stockMinimo: 2 }).expect(200);
    const r = await agent.get('/api/productos').expect(200);
    expect(r.body.productos[0]).toMatchObject({ cantidadVariantes: 2, stockTotal: 0, variantesStockBajo: 1 });
  });
});
