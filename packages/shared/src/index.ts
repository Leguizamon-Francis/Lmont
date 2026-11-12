import { z } from 'zod';

// Mensajes de validación por defecto en español (cliente y servidor).
z.config(z.locales.es());

export * from './money.js';
export * from './schemas/comunes.js';
export * from './schemas/auth.js';
export * from './schemas/vendedor.js';
export * from './schemas/catalogo.js';

/** Forma estándar de los errores que devuelve la API. */
export type ApiError = {
  error: string;
  /** Errores por campo: { "precioVenta": "El monto no puede ser negativo" } */
  campos?: Record<string, string>;
};
