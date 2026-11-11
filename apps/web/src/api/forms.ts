import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError } from './client';

/**
 * Pasa los errores por campo que devolvió el servidor al formulario.
 * Devuelve el mensaje general para mostrar arriba del formulario.
 */
export function aplicarErroresServidor<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): string {
  if (err instanceof ApiRequestError && err.campos) {
    for (const [campo, mensaje] of Object.entries(err.campos)) {
      setError(campo as Path<T>, { type: 'server', message: mensaje });
    }
  }
  return err instanceof Error ? err.message : 'Ocurrió un error inesperado';
}
