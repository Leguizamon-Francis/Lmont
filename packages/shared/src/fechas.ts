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

/**
 * Instantes (UTC) en que empieza y termina un día del local, para filtrar por fecha.
 * Argentina usa UTC-3 todo el año (sin horario de verano desde 2009).
 */
export function rangoDelDia(iso: string): { desde: Date; hasta: Date } {
  const desde = new Date(`${iso}T00:00:00-03:00`);
  return { desde, hasta: new Date(desde.getTime() + 24 * 60 * 60 * 1000) };
}

const fmtHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false });

/** Hora del local para un instante ISO: "14:35". */
export const formatHora = (iso: string) => fmtHora.format(new Date(iso));

/** "AAAA-MM-DD" de una fecha que existe (rechaza 2026-13-01 o 2026-02-31, que Date acepta corriéndolas de día). */
export function esFechaValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
