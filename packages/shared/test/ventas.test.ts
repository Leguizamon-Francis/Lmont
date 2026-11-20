import { describe, expect, it } from 'vitest';
import {
  aplicarPorcentaje,
  formatHora,
  nombrePlan,
  porcentajeSchema,
  rangoDelDia,
  textoPorcentaje,
  ventaSchema,
} from '../src/index.js';

const item = { varianteId: 1, cantidad: 2, precioUnitario: '15.000' };

describe('recargos y descuentos', () => {
  it('aplica recargo y descuento redondeando a centavos', () => {
    expect(aplicarPorcentaje(30000, 15)).toEqual({ ajuste: 4500, cobrado: 34500 });
    expect(aplicarPorcentaje(30000, -10)).toEqual({ ajuste: -3000, cobrado: 27000 });
    expect(aplicarPorcentaje(14999, 0)).toEqual({ ajuste: 0, cobrado: 14999 });
    expect(aplicarPorcentaje(10000, 12.5)).toEqual({ ajuste: 1250, cobrado: 11250 });
    expect(aplicarPorcentaje(333.33, 10)).toEqual({ ajuste: 33.33, cobrado: 366.66 });
  });

  it('acepta porcentajes en formato argentino', () => {
    expect(porcentajeSchema.parse('10')).toBe(10);
    expect(porcentajeSchema.parse('-10')).toBe(-10);
    expect(porcentajeSchema.parse('12,5')).toBe(12.5);
    expect(porcentajeSchema.parse('15%')).toBe(15);
    expect(porcentajeSchema.parse('')).toBe(0);
    expect(porcentajeSchema.safeParse('diez').success).toBe(false);
    expect(porcentajeSchema.safeParse('-100').success).toBe(false);
  });

  it('describe los planes', () => {
    expect(nombrePlan({ medio: 'CREDITO', cuotas: 3 })).toBe('Crédito 3 cuotas');
    expect(nombrePlan({ medio: 'CREDITO', cuotas: 1 })).toBe('Crédito 1 cuota');
    expect(nombrePlan({ medio: 'EFECTIVO', cuotas: 1 })).toBe('Efectivo');
    expect(textoPorcentaje(-10)).toBe('10% de descuento');
    expect(textoPorcentaje(12.5)).toBe('12,5% de recargo');
    expect(textoPorcentaje(0)).toBeNull();
  });
});

describe('validación de ventas', () => {
  it('acepta una venta con varios medios de pago que suman el total', () => {
    const v = ventaSchema.parse({
      items: [item],
      pagos: [
        { medio: 'EFECTIVO', monto: '10.000' },
        { medio: 'CREDITO', cuotas: '3', monto: '20.000' },
      ],
    });
    expect(v.items[0]).toEqual({ varianteId: 1, cantidad: 2, precioUnitario: 15000 });
    expect(v.pagos[1]).toEqual({ medio: 'CREDITO', cuotas: 3, monto: 20000 });
    expect(v.pagos[0]!.cuotas).toBe(1);
  });

  it('necesita al menos un producto y un medio de pago', () => {
    const r = ventaSchema.safeParse({ items: [], pagos: [] });
    expect(r.success).toBe(false);
    const msgs = r.error!.issues.map((i) => i.message);
    expect(msgs).toContain('Agregá al menos un producto');
    expect(msgs).toContain('Elegí el medio de pago');
  });

  it('los pagos tienen que sumar lo mismo que la venta', () => {
    const r = ventaSchema.safeParse({ items: [item], pagos: [{ medio: 'EFECTIVO', monto: '25.000' }] });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toBe('Los pagos suman $ 25.000 y la venta es de $ 30.000: tienen que coincidir');
  });

  it('rechaza cuotas fuera del crédito, productos repetidos y montos inválidos', () => {
    expect(ventaSchema.safeParse({ items: [item], pagos: [{ medio: 'DEBITO', cuotas: 3, monto: 30000 }] }).success).toBe(false);
    expect(ventaSchema.safeParse({ items: [item, item], pagos: [{ medio: 'EFECTIVO', monto: 60000 }] }).success).toBe(false);
    expect(ventaSchema.safeParse({ items: [{ ...item, cantidad: 0 }], pagos: [{ medio: 'EFECTIVO', monto: 0 }] }).success).toBe(false);
    expect(ventaSchema.safeParse({ items: [{ ...item, precioUnitario: '-5' }], pagos: [{ medio: 'EFECTIVO', monto: 1 }] }).success).toBe(false);
    expect(ventaSchema.safeParse({ items: [item], pagos: [{ medio: 'CHEQUE', monto: 30000 }] }).success).toBe(false);
  });
});

describe('fechas de las ventas', () => {
  it('el día del local va de 00:00 a 24:00 hora argentina', () => {
    const { desde, hasta } = rangoDelDia('2026-11-20');
    expect(desde.toISOString()).toBe('2026-11-20T03:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-11-21T03:00:00.000Z');
  });
  it('muestra la hora del local', () => {
    expect(formatHora('2026-11-20T17:05:00Z')).toBe('14:05');
  });
});
