import { Router, type Response } from 'express';
import { escaneoSchema, type EscaneoEnviado } from '@lmont/shared';
import { handler, validar } from '../http/errors.js';

/**
 * El celular como lector de códigos de la notebook.
 * Las pantallas que esperan códigos (vender, ingreso, cambios…) se conectan a /eventos y el
 * celular manda cada código leído con la cámara a POST /. Se reparte a las pantallas de la
 * misma cuenta. Vive en memoria: Render corre una sola instancia.
 */
export const escanerRouter = Router();

const pantallas = new Map<number, Set<Response>>();

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
    const destino = pantallas.get(req.session.usuarioId!) ?? new Set();
    const evento = `data: ${JSON.stringify({ codigo })}\n\n`;
    for (const r of destino) r.write(evento);
    res.json({ pantallas: destino.size } satisfies EscaneoEnviado);
  }),
);
