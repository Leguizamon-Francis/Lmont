import { describe, expect, it } from 'vitest';
import { calcularCambio, cambioSchema, errorPagosCambio } from '../src/index.js';

describe('cambios', () => {
  it('calcula lo que vuelve, lo que se lleva y la diferencia', () => {
    expect(calcularCambio([{ cantidad: 2, precioUnitario: 15000 }], [{ cantidad: 1, precioUnitario: 40000 }])).toEqual({
      totalDevuelto: 30000,
      totalLlevado: 40000,
      diferencia: 10000,
    });
    expect(calcularCambio([{ cantidad: 1, precioUnitario: 15000.5 }], []).diferencia).toBe(-15000.5);
  });

  it('exige que la plata cierre con la diferencia', () => {
    expect(errorPagosCambio(0, [], null)).toBeNull();
    expect(errorPagosCambio(10000, [{ monto: 10000 }], null)).toBeNull();
    expect(errorPagosCambio(10000, [], null)).toBe('El cliente tiene que pagar la diferencia de $ 10.000: elegí el medio de pago');
    expect(errorPagosCambio(10000, [{ monto: 6000 }, { monto: 3000 }], null)).toContain('tienen que coincidir');
    expect(errorPagosCambio(-5000, [], null)).toBe('Hay que devolverle $ 5.000 al cliente: elegí cómo');
    expect(errorPagosCambio(-5000, [], 'EFECTIVO')).toBeNull();
    expect(errorPagosCambio(0, [{ monto: 100 }], null)).toBe('No hay diferencia a cobrar: sacá los pagos');
  });

  it('valida el formulario: algo tiene que volver y sin repetidos', () => {
    expect(cambioSchema.safeParse({ ventaId: 1, devueltos: [] }).error?.issues[0]?.message).toBe('Elegí qué prendas trae el cliente');
    const rep = cambioSchema.safeParse({
      ventaId: 1,
      devueltos: [
        { ventaItemId: 1, cantidad: 1 },
        { ventaItemId: 1, cantidad: 1 },
      ],
    });
    expect(rep.error?.issues[0]?.message).toBe('Hay una prenda devuelta repetida');
    expect(cambioSchema.safeParse({ ventaId: 1, devueltos: [{ ventaItemId: 1, cantidad: 0 }] }).error?.issues[0]?.message).toBe('La cantidad mínima es 1');
  });
});
