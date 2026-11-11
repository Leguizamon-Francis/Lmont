import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { agenteLogueado, crearUsuario, limpiarDb, PASSWORD, USUARIO } from './helpers.js';

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
});
afterAll(() => prisma.$disconnect());

describe('login', () => {
  it('rechaza credenciales incorrectas con mensaje en español', async () => {
    const res = await request(createApp()).post('/api/auth/login').send({ usuario: USUARIO, password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Usuario o contraseña incorrectos');
  });

  it('valida campos vacíos en el servidor', async () => {
    const res = await request(createApp()).post('/api/auth/login').send({ usuario: '', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.campos).toEqual({ usuario: 'Ingresá el usuario', password: 'Ingresá la contraseña' });
  });

  it('inicia sesión, consulta /me y cierra sesión', async () => {
    const agent = await agenteLogueado();
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.usuario).toBe(USUARIO);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('protege la API sin sesión', async () => {
    const res = await request(createApp()).get('/api/vendedores');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/sesión/);
  });

  it('cambia la contraseña verificando la actual', async () => {
    const agent = await agenteLogueado();
    const mal = await agent.post('/api/auth/password').send({ actual: 'otra', nueva: 'nueva-clave-1', repetir: 'nueva-clave-1' });
    expect(mal.status).toBe(400);
    expect(mal.body.campos.actual).toBe('La contraseña actual no es correcta');

    await agent.post('/api/auth/password').send({ actual: PASSWORD, nueva: 'nueva-clave-1', repetir: 'nueva-clave-1' }).expect(204);
    await request(createApp()).post('/api/auth/login').send({ usuario: USUARIO, password: 'nueva-clave-1' }).expect(200);
  });
});
