import type { ApiError } from '@lmont/shared';

/** Error devuelto por la API, con mensaje en español y errores por campo. */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public campos?: Record<string, string>,
  ) {
    super(message);
  }
}

type Opciones = { method?: string; body?: unknown; signal?: AbortSignal };

export async function api<T = unknown>(path: string, opts: Opciones = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch {
    throw new ApiRequestError(0, 'No hay conexión con el servidor. Revisá internet y probá de nuevo.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data ?? {}) as Partial<ApiError>;
    throw new ApiRequestError(res.status, e.error ?? 'Ocurrió un error inesperado', e.campos);
  }
  return data as T;
}

export const mensajeDeError = (e: unknown) =>
  e instanceof Error ? e.message : 'Ocurrió un error inesperado';
