import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env, isProd } from './env.js';
import { errorHandler, HttpError } from './http/errors.js';
import { requireAuth } from './http/auth.js';
import { authRouter } from './routes/auth.js';
import { vendedoresRouter } from './routes/vendedores.js';
import { coloresRouter, tallesRouter, tiposRouter } from './routes/listas.js';
import { productosRouter } from './routes/productos.js';
import { variantesRouter } from './routes/variantes.js';

type Opciones = {
  /** Directorio con el build de React para servirlo (producción). */
  webDist?: string;
  /** Guardar sesiones en Postgres (true en dev/prod; en tests se usan en memoria). */
  sesionesEnDb?: boolean;
};

export function createApp(opts: Opciones = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (isProd) app.set('trust proxy', 1); // Render está detrás de un proxy HTTPS

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // La cámara se usa para escanear códigos desde el celular.
          'img-src': ["'self'", 'data:', 'blob:'],
          'media-src': ["'self'", 'blob:'],
        },
      },
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      name: 'lmont.sid',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: opts.sesionesEnDb
        ? new PgStore({ conString: env.DATABASE_URL, tableName: 'session', createTableIfMissing: false })
        : undefined,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días; se renueva con el uso
      },
    }),
  );

  // --- API ---
  const api = express.Router();
  api.get('/salud', (_req, res) => {
    res.json({ ok: true });
  });
  api.use('/auth', authRouter);
  api.use(requireAuth);
  api.use('/vendedores', vendedoresRouter);
  api.use('/tipos', tiposRouter);
  api.use('/talles', tallesRouter);
  api.use('/colores', coloresRouter);
  api.use('/productos', productosRouter);
  api.use('/variantes', variantesRouter);
  api.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));
  app.use('/api', api);

  // --- Frontend (build de React) ---
  if (opts.webDist && fs.existsSync(opts.webDist)) {
    app.use(express.static(opts.webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(opts.webDist!, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}

export const defaultWebDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
