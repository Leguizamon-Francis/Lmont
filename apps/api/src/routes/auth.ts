import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { cambiarPasswordSchema, loginSchema } from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, validar } from '../http/errors.js';
import { requireAuth } from '../http/auth.js';

export const authRouter = Router();

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({ error: 'Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.' });
  },
});

const usuarioPublico = (u: { id: number; usuario: string; nombre: string; rol: string }) => ({
  id: u.id,
  usuario: u.usuario,
  nombre: u.nombre,
  rol: u.rol,
});

authRouter.post(
  '/login',
  limiteLogin,
  handler(async (req, res) => {
    const { usuario, password } = validar(loginSchema, req.body);
    const u = await prisma.usuario.findUnique({ where: { usuario } });
    const ok = u && u.activo && (await bcrypt.compare(password, u.passwordHash));
    if (!ok) throw new HttpError(401, 'Usuario o contraseña incorrectos');

    await new Promise<void>((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    req.session.usuarioId = u.id;
    res.json(usuarioPublico(u));
  }),
);

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('lmont.sid');
    res.status(204).end();
  });
});

authRouter.get(
  '/me',
  requireAuth,
  handler(async (req, res) => {
    const u = await prisma.usuario.findUnique({ where: { id: req.session.usuarioId! } });
    if (!u || !u.activo) throw new HttpError(401, 'Tu sesión terminó. Volvé a ingresar.');
    res.json(usuarioPublico(u));
  }),
);

authRouter.post(
  '/password',
  requireAuth,
  handler(async (req, res) => {
    const { actual, nueva } = validar(cambiarPasswordSchema, req.body);
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: req.session.usuarioId! } });
    if (!(await bcrypt.compare(actual, u.passwordHash))) {
      throw new HttpError(400, 'La contraseña actual no es correcta', { actual: 'La contraseña actual no es correcta' });
    }
    await prisma.usuario.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(nueva, 12) } });
    res.status(204).end();
  }),
);
