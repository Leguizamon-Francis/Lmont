import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';
import type { ApiError } from '@lmont/shared';
import { Prisma } from '../generated/prisma/client.js';

/** Error de negocio con mensaje para mostrar al usuario. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public campos?: Record<string, string>,
  ) {
    super(message);
  }
}

export const noEncontrado = (que: string) => new HttpError(404, `No se encontró ${que}`);

/** Valida con un esquema Zod compartido; si falla, responde 400 con errores por campo. */
export function validar<S extends ZodType>(schema: S, data: unknown): import('zod').output<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw zodAHttp(r.error);
}

function zodAHttp(err: ZodError): HttpError {
  const campos: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    campos[key] ??= issue.message;
  }
  const primero = err.issues[0]?.message ?? 'Datos inválidos';
  return new HttpError(400, err.issues.length === 1 ? primero : 'Revisá los datos marcados', campos);
}

/** Envuelve handlers async para que los errores lleguen al manejador central. */
export const handler =
  (fn: (...args: Parameters<RequestHandler>) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

const CAMPOS_UNICOS: Record<string, string> = {
  nombre: 'Ya existe un registro con ese nombre',
  usuario: 'Ese nombre de usuario ya está en uso',
  codigo_barras: 'Ese código de barras ya está cargado en otro producto',
  codigoBarras: 'Ese código de barras ya está cargado en otro producto',
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let e: HttpError;
  if (err instanceof HttpError) e = err;
  else if (err instanceof ZodError) e = zodAHttp(err);
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = JSON.stringify(err.meta ?? {});
    const campo = Object.keys(CAMPOS_UNICOS).find((c) => target.includes(c));
    e = new HttpError(409, campo ? CAMPOS_UNICOS[campo]! : 'Ya existe un registro con esos datos');
  } else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    e = new HttpError(404, 'No se encontró el registro');
  } else if (err?.type === 'entity.parse.failed') {
    e = new HttpError(400, 'Los datos enviados no tienen un formato válido');
  } else {
    console.error(err);
    e = new HttpError(500, 'Ocurrió un error inesperado. Probá de nuevo y, si sigue pasando, avisá.');
  }
  const body: ApiError = { error: e.message, ...(e.campos ? { campos: e.campos } : {}) };
  res.status(e.status).json(body);
};
