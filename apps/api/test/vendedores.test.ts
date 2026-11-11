import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearUsuario, limpiarDb } from './helpers.js';

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
});
afterAll(() => prisma.$disconnect());

describe('vendedores', () => {
  it('crea, lista y edita', async () => {
    const agent = await agenteLogueado();
    const creado = await agent.post('/api/vendedores').send({ nombre: '  Juan  ' }).expect(201);
    expect(creado.body).toMatchObject({ nombre: 'Juan', activo: true });

    await agent.put(`/api/vendedores/${creado.body.id}`).send({ nombre: 'Juan', activo: false }).expect(200);
    const activos = await agent.get('/api/vendedores?activos=1').expect(200);
    expect(activos.body).toEqual([]);
  });

  it('no permite nombres vacíos ni repetidos', async () => {
    const agent = await agenteLogueado();
    const vacio = await agent.post('/api/vendedores').send({ nombre: '   ' });
    expect(vacio.status).toBe(400);
    expect(vacio.body.campos.nombre).toBe('Completá el nombre');

    await agent.post('/api/vendedores').send({ nombre: 'Ana' }).expect(201);
    const repetido = await agent.post('/api/vendedores').send({ nombre: 'Ana' });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error).toBe('Ya existe un registro con ese nombre');
  });

  it('responde 404 si el vendedor no existe', async () => {
    const agent = await agenteLogueado();
    const res = await agent.put('/api/vendedores/999').send({ nombre: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No se encontró el vendedor');
  });
});
