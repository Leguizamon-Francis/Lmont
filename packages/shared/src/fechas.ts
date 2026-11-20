/** Zona horaria del local: todas las fechas "del día" se calculan con esta. */
export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

const fmtIso = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fecha de hoy en Argentina, como "AAAA-MM-DD". */
export const hoy = (ahora = new Date()) => fmtIso.format(ahora);

/** "2026-11-12" -> "12/11/2026" */
export function formatFecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
