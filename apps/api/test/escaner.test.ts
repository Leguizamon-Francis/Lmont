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
  const enviar = (body: unknown) =>
    fetch(`${base}/escaner`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  return { server, base, cookie, enviar };
}

describe('escáner desde el celular', () => {
  it('manda el código leído a la pantalla abierta', async () => {
    const { server, base, cookie, enviar } = await servidor();
    const abort = new AbortController();
    try {
      // Sin pantallas esperando, avisa que no llegó a ningún lado.
      expect(await (await enviar({ codigo: '7791234567890' })).json()).toEqual({ pantallas: 0 });

      const eventos = await fetch(`${base}/escaner/eventos`, { headers: { cookie }, signal: abort.signal });
      expect(eventos.headers.get('content-type')).toMatch(/text\/event-stream/);
      const lector = eventos.body!.getReader();
      await lector.read(); // "retry:" inicial

      expect(await (await enviar({ codigo: ' 7791234567890 ' })).json()).toEqual({ pantallas: 1 });
      let recibido = '';
      while (!recibido.includes('\n\n')) recibido += new TextDecoder().decode((await lector.read()).value);
      expect(recibido).toBe('data: {"codigo":"7791234567890"}\n\n');
    } finally {
      abort.abort();
      server.close();
    }
  });

  it('valida el código y exige sesión', async () => {
    const { server, base, enviar } = await servidor();
    try {
      const r = await enviar({ codigo: 'no vale' });
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/letras, números y guiones/);
      expect((await fetch(`${base}/escaner/eventos`)).status).toBe(401);
    } finally {
      server.close();
    }
  });
});
