import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

declare module 'express-session' {
  interface SessionData {
    usuarioId?: number;
  }
}

/** Exige sesión iniciada. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.usuarioId) return next(new HttpError(401, 'Tu sesión terminó. Volvé a ingresar.'));
  next();
};
