import { z } from 'zod';
import { parseMonto } from '../money.js';

/** Monto obligatorio, no negativo, en formato argentino o numérico. */
export const montoSchema = z.union([z.string(), z.number()], { error: 'Ingresá un monto' }).transform((v, ctx) => {
  const r = parseMonto(v);
  if (!r.ok) {
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  }
  return r.value;
});

/** Cantidad entera mayor o igual a `min` (por defecto 1). Acepta "3" o 3. */
export const cantidadSchema = (min = 1) =>
  z.union([z.string(), z.number()], { error: 'Ingresá una cantidad' }).transform((v, ctx) => {
    const s = typeof v === 'number' ? String(v) : v.trim();
    if (s === '') {
      ctx.addIssue({ code: 'custom', message: 'Ingresá una cantidad' });
      return z.NEVER;
    }
    if (!/^-?\d+$/.test(s)) {
      ctx.addIssue({ code: 'custom', message: 'La cantidad tiene que ser un número entero' });
      return z.NEVER;
    }
    const n = Number(s);
    if (n < 0) {
      ctx.addIssue({ code: 'custom', message: 'La cantidad no puede ser negativa' });
      return z.NEVER;
    }
    if (n < min) {
      ctx.addIssue({ code: 'custom', message: `La cantidad mínima es ${min}` });
      return z.NEVER;
    }
    return n;
  });

/** Texto obligatorio, recortado. */
export const textoObligatorio = (campo: string, max = 120) =>
  z
    .string({ error: `Completá ${campo}` })
    .trim()
    .min(1, `Completá ${campo}`)
    .max(max, `${capitalizar(campo)} puede tener hasta ${max} caracteres`);

/** Texto opcional: string vacío se convierte en null. */
export const textoOpcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Puede tener hasta ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const idSchema = z.coerce.number({ error: 'Identificador inválido' }).int().positive('Identificador inválido');

function capitalizar(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
