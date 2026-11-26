import { describe, expect, it } from 'vitest';
import { aplicarPromos, esFechaValida, factorDescuentoMedios, pagadoItem, reintegroItem, type Promocion } from '../src/index.js';

describe('reintegro de una devolución', () => {
  it('es lo que pagó: con la promo y con el descuento del medio de pago, sin los recargos', () => {
    const items = [{ cantidad: 1, precioUnitario: 10000, descuentoPromo: 0 }];
    // Efectivo con 10 % de descuento.
    const conDescuento = factorDescuentoMedios(items, [{ ajuste: -1000 }]);
    expect(pagadoItem(items[0]!, conDescuento)).toBe(9000);
    // El recargo de la tarjeta no se devuelve.
    expect(pagadoItem(items[0]!, factorDescuentoMedios(items, [{ ajuste: 1500 }]))).toBe(10000);
  });

  it('devolviendo de a una o todas juntas, nunca suma más de lo cobrado', () => {
    // 3x2: 3 unidades a $ 1.000 con $ 1.000 de descuento → pagó $ 2.000.
    const pagado = pagadoItem({ cantidad: 3, precioUnitario: 1000, descuentoPromo: 1000 });
    expect(reintegroItem(pagado, 3, 0, 3)).toBe(2000);
    const deAUna = [reintegroItem(pagado, 3, 0, 1), reintegroItem(pagado, 3, 1, 1), reintegroItem(pagado, 3, 2, 1)];
    expect(deAUna.reduce((s, x) => s + x, 0)).toBe(2000);
  });
});

describe('fechas', () => {
  it('rechaza fechas que no existen', () => {
    expect(esFechaValida('2026-11-26')).toBe(true);
    expect(esFechaValida('2028-02-29')).toBe(true);
    for (const f of ['2026-13-01', '2026-02-31', '2026-02-29', '26/11/2026', 'ayer', '']) expect(esFechaValida(f)).toBe(false);
  });
});

describe('reparto del descuento de una promo', () => {
  it('los centavos van a la unidad más cara: ninguna queda con más descuento que su precio', () => {
    const tipo = { id: 1, nombre: 'Medias', activo: true };
    const promo: Promocion = {
      id: 1,
      nombre: '4 medias',
      modo: 'PRECIO_FIJO',
      precio: 2,
      pagaCantidad: null,
      desde: null,
      hasta: null,
      activo: true,
      componentes: [{ producto: null, tipo, cantidad: 4 }],
    };
    const items = [1, 1, 1, 0].map((precio, i) => ({ varianteId: i + 1, productoId: i + 1, tipoId: 1, cantidad: 1, precioUnitario: precio }));
    const r = aplicarPromos(items, [{ promocionId: 1, veces: 1 }], [promo]);
    if (!r.ok) throw new Error(r.error);
    for (const it of items) expect(r.descuentos.get(it.varianteId) ?? 0).toBeLessThanOrEqual(it.precioUnitario);
    expect([...r.descuentos.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
  });
});
