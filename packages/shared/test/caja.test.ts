import { describe, expect, it } from 'vitest';
import { formatMes, hoy, mesSchema, movimientoCajaSchema } from '../src/index.js';

describe('caja', () => {
  it('un gasto necesita monto y concepto; el medio por defecto es efectivo y la fecha hoy', () => {
    const g = movimientoCajaSchema.parse({ tipo: 'GASTO', conceptoId: '3', monto: '12.500,50', detalle: '' });
    expect(g).toEqual({ tipo: 'GASTO', conceptoId: 3, monto: 12500.5, medio: 'EFECTIVO', fecha: hoy(), detalle: null });
    const r = movimientoCajaSchema.safeParse({ tipo: 'GASTO', monto: '' });
    expect(r.success).toBe(false);
    const msgs = r.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Elegí el concepto');
    expect(msgs).toContain('Ingresá un monto');
    expect(movimientoCajaSchema.safeParse({ tipo: 'GASTO', conceptoId: 1, monto: '0' }).success).toBe(false);
  });

  it('valida y muestra meses', () => {
    expect(mesSchema.safeParse('2026-11').success).toBe(true);
    expect(mesSchema.safeParse('2026-13').success).toBe(false);
    expect(formatMes('2026-11')).toBe('noviembre 2026');
  });
});
