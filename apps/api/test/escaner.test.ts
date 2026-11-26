import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { crearUsuario, limpiarDb, PASSWORD, USUARIO } from './helpers.js';

beforeEach(async () => {
  await limpiarDb();
  await crearUsuario();
});
afterAll(() => prisma.$disconnect());

/** Levanta la app en un puerto libre (hace falta un servidor real para el stream de eventos). */
async function servidor() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: USUARIO, password: PASSWORD }),
  });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  const post = (ruta: string, body: unknown) =>
    fetch(`${base}/escaner${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  /** Una pantalla escuchando: devuelve una función que espera el próximo aviso. */
  const pantalla = async (signal: AbortSignal) => {
    const eventos = await fetch(`${base}/escaner/eventos`, { headers: { cookie }, signal });
    expect(eventos.headers.get('content-type')).toMatch(/text\/event-stream/);
    const lector = eventos.body!.getReader();
    await lector.read(); // "retry:" inicial
    return async () => {
      let texto = '';
      while (!texto.includes('\n\n')) texto += new TextDecoder().decode((await lector.read()).value);
      return JSON.parse(texto.replace(/^data: /, '')) as { codigo: string; id: string };
    };
  };
  return { server, base, post, pantalla };
}

describe('escáner desde el celular', () => {
  it('sin pantallas abiertas avisa que no llegó', async () => {
    const { server, post } = await servidor();
    try {
      expect(await (await post('', { codigo: '7791234567890' })).json()).toEqual({ entregado: false });
    } finally {
      server.close();
    }
  });

  it('el código llega a las pantallas y solo la primera que lo confirma lo usa', async () => {
    const { server, post, pantalla } = await servidor();
    const abort = new AbortController();
    try {
      const [aviso1, aviso2] = [await pantalla(abort.signal), await pantalla(abort.signal)];
      const envio = post('', { codigo: ' 7791234567890 ' });
      const [e1, e2] = await Promise.all([aviso1(), aviso2()]);
      expect(e1).toEqual({ codigo: '7791234567890', id: expect.any(String) });
      expect(e2.id).toBe(e1.id);

      expect(await (await post('/recibido', { id: e1.id })).json()).toEqual({ usar: true });
      expect(await (await post('/recibido', { id: e2.id })).json()).toEqual({ usar: false });
      expect(await (await envio).json()).toEqual({ entregado: true });
    } finally {
      abort.abort();
      server.close();
    }
  });

  it('valida el código y exige sesión', async () => {
    const { server, base, post } = await servidor();
    try {
      const r = await post('', { codigo: 'no vale' });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/letras, números y guiones/);
      expect((await post('/recibido', { id: 'x' })).status).toBe(400);
      expect((await fetch(`${base}/escaner/eventos`)).status).toBe(401);
    } finally {
      server.close();
    }
  });
});
