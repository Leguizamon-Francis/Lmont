/**
 * Montos en pesos argentinos.
 *
 * Formatos aceptados al cargar:
 *   "15000"  "15.000"  "15000,50"  "15.000,50"  "$ 15.000"  y números (15000.5)
 * El punto solo se acepta como separador de miles (grupos de 3 dígitos);
 * la coma es el separador decimal (hasta 2 decimales).
 */

export type ParseMontoResult = { ok: true; value: number } | { ok: false; error: string };

const FORMATO_INVALIDO = 'Formato de monto inválido. Ejemplos válidos: 15.000 o 15000,50';

const ENTERO_SIN_MILES = /^\d+$/;
const ENTERO_CON_MILES = /^\d{1,3}(\.\d{3})+$/;

export function parseMonto(input: string | number | null | undefined): ParseMontoResult {
  if (input === null || input === undefined) return { ok: false, error: 'Ingresá un monto' };

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return { ok: false, error: FORMATO_INVALIDO };
    if (input < 0) return { ok: false, error: 'El monto no puede ser negativo' };
    return { ok: true, value: redondear(input) };
  }

  let s = input.trim().replace(/^\$/, '').replace(/\s+/g, '');
  if (s === '') return { ok: false, error: 'Ingresá un monto' };
  if (s.startsWith('-')) return { ok: false, error: 'El monto no puede ser negativo' };

  const partes = s.split(',');
  if (partes.length > 2) return { ok: false, error: FORMATO_INVALIDO };
  const [entero = '', decimales] = partes;

  if (!ENTERO_SIN_MILES.test(entero) && !ENTERO_CON_MILES.test(entero)) {
    return { ok: false, error: FORMATO_INVALIDO };
  }
  if (decimales !== undefined && !/^\d{1,2}$/.test(decimales)) {
    return { ok: false, error: 'El monto admite hasta 2 decimales (por ejemplo 15000,50)' };
  }

  s = entero.replace(/\./g, '') + (decimales !== undefined ? '.' + decimales : '');
  return { ok: true, value: redondear(Number(s)) };
}

/** Redondea a centavos evitando errores de coma flotante. */
export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const fmtEntero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtDecimal = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 15000 -> "$ 15.000" ; 15000.5 -> "$ 15.000,50" ; -200 -> "-$ 200" */
export function formatMonto(n: number): string {
  const v = redondear(n);
  const abs = Math.abs(v);
  const cuerpo = Number.isInteger(abs) ? fmtEntero.format(abs) : fmtDecimal.format(abs);
  return `${v < 0 ? '-' : ''}$ ${cuerpo}`;
}

/** Muestra un monto para editar en un campo de texto: 15000.5 -> "15.000,50" */
export function montoParaInput(n: number): string {
  return formatMonto(n).replace(/^-?\$ /, '');
}
