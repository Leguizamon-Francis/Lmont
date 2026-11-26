import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { escaneoRecibidoSchema, escaneoSchema, type EscaneoEnviado, type EscaneoRecibido } from '@lmont/shared';
import { handler, validar } from '../http/errors.js';

/**
 * El celular como lector de códigos de la notebook.
 * Las pantallas que esperan códigos (vender, ingreso, cambios…) se conectan a /eventos. El celular
 * manda cada código a POST /; se avisa a las pantallas de la misma cuenta y la primera que lo
 * toma (la que está a la vista) lo confirma en POST /recibido: así una sola lo usa y el celular
 * sabe si llegó. Vive en memoria: Render corre una sola instancia.
 */
export const escanerRouter = Router();

/** Cuánto espera el celular a que alguna pantalla confirme. */
const ESPERA_MS = 3000;

const pantallas = new Map<number, Set<Response>>();
const esperando = new Map<string, (entregado: boolean) => void>();

escanerRouter.get('/eventos', (req, res) => {
  const usuarioId = req.session.usuarioId!;
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  let set = pantallas.get(usuarioId);
  if (!set) pantallas.set(usuarioId, (set = new Set()));
  set.add(res);

  // Mantiene viva la conexión a través del proxy de Render.
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    set.delete(res);
    if (set.size === 0) pantallas.delete(usuarioId);
  });
});

escanerRouter.post(
  '/',
  handler(async (req, res) => {
    const { codigo } = validar(escaneoSchema, req.body);
    const destino = pantallas.get(req.session.usuarioId!);
    let entregado = false;
    if (destino?.size) {
      const id = randomUUID();
      entregado = await new Promise<boolean>((resolver) => {
        const timer = setTimeout(() => resolver(false), ESPERA_MS);
        esperando.set(id, (ok) => {
          clearTimeout(timer);
          resolver(ok);
        });
        const evento = `data: ${JSON.stringify({ codigo, id })}\n\n`;
        for (const r of destino) r.write(evento);
      });
      esperando.delete(id);
    }
    res.json({ entregado } satisfies EscaneoEnviado);
  }),
);

/** Una pantalla avisa que tomó el código. Solo la primera lo usa. */
escanerRouter.post('/recibido', (req, res) => {
  const { id } = validar(escaneoRecibidoSchema, req.body);
  const avisar = esperando.get(id);
  esperando.delete(id);
  avisar?.(true);
  res.json({ usar: !!avisar } satisfies EscaneoRecibido);
});
