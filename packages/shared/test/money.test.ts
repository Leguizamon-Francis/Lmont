import { describe, expect, it } from 'vitest';
import { formatMonto, parseMonto, montoSchema, cantidadSchema } from '../src/index.js';

describe('parseMonto', () => {
  it.each([
    ['15000', 15000],
    ['15.000', 15000],
    ['15000,50', 15000.5],
    ['15.000,50', 15000.5],
    ['1.234.567,8', 1234567.8],
    ['$ 15.000', 15000],
    ['  2500 ', 2500],
    ['0', 0],
    [15000.5, 15000.5],
  ])('acepta %s', (entrada, esperado) => {
    expect(parseMonto(entrada)).toEqual({ ok: true, value: esperado });
  });

  it.each(['', 'abc', '15.5', '15,000.50', '1.23.456', '15000,505', '15,', '1,2,3'])('rechaza "%s"', (entrada) => {
    expect(parseMonto(entrada).ok).toBe(false);
  });

  it('rechaza negativos con mensaje claro', () => {
    expect(parseMonto('-100')).toEqual({ ok: false, error: 'El monto no puede ser negativo' });
    expect(parseMonto(-5)).toEqual({ ok: false, error: 'El monto no puede ser negativo' });
  });
});

describe('formatMonto', () => {
  it('formatea en pesos argentinos', () => {
    expect(formatMonto(15000)).toBe('$ 15.000');
    expect(formatMonto(15000.5)).toBe('$ 15.000,50');
    expect(formatMonto(0)).toBe('$ 0');
    expect(formatMonto(-200)).toBe('-$ 200');
    expect(formatMonto(1234567)).toBe('$ 1.234.567');
  });
});

describe('esquemas', () => {
  it('montoSchema transforma y valida', () => {
    expect(montoSchema.parse('15.000,50')).toBe(15000.5);
    const r = montoSchema.safeParse('-1');
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('El monto no puede ser negativo');
  });

  it('cantidadSchema exige enteros no negativos', () => {
    expect(cantidadSchema().parse('3')).toBe(3);
    expect(cantidadSchema(0).parse(0)).toBe(0);
    expect(cantidadSchema().safeParse('1,5').success).toBe(false);
    expect(cantidadSchema().safeParse('0').success).toBe(false);
    expect(cantidadSchema().safeParse('-2').error?.issues[0]?.message).toBe('La cantidad no puede ser negativa');
  });
});
