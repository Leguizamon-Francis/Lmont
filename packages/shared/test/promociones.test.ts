import { describe, expect, it } from 'vitest';
import { ajustarPromos, aplicarPromos, describirPromo, promocionSchema, promosPosibles, promoVigente, type Promocion } from '../src/index.js';

const REMERA = { id: 1, nombre: 'Remera', activo: true };
const BERMUDA = { id: 2, nombre: 'Bermuda', activo: true };
const BOXER = { id: 3, nombre: 'Boxer', activo: true };
const basica = { id: 10, nombre: 'Básica', tipo: REMERA };
const rustica = { id: 20, nombre: 'Rústica', tipo: BERMUDA };

const promo = (p: Partial<Promocion> & Pick<Promocion, 'id' | 'modo' | 'componentes'>): Promocion => ({
  nombre: `Promo ${p.id}`,
  precio: null,
  pagaCantidad: null,
  desde: null,
  hasta: null,
  activo: true,
  ...p,
});

/** Remera + Bermuda a $ 30.000 */
const combo = promo({
  id: 1,
  nombre: 'Combo verano',
  modo: 'PRECIO_FIJO',
  precio: 30000,
  componentes: [
    { producto: basica, tipo: null, cantidad: 1 },
    { producto: rustica, tipo: null, cantidad: 1 },
  ],
});
/** 3 boxers (cualquiera) a $ 15.000 */
const tresBoxers = promo({ id: 2, nombre: '3 boxers', modo: 'PRECIO_FIJO', precio: 15000, componentes: [{ producto: null, tipo: BOXER, cantidad: 3 }] });
/** 2x1 en boxers */
const dosPorUno = promo({ id: 3, nombre: '2x1 boxers', modo: 'NXM', pagaCantidad: 1, componentes: [{ producto: null, tipo: BOXER, cantidad: 2 }] });

const remeraNegra = { varianteId: 100, productoId: 10, tipoId: 1, cantidad: 1, precioUnitario: 15000 };
const bermudaAzul = { varianteId: 200, productoId: 20, tipoId: 2, cantidad: 1, precioUnitario: 25000 };
const boxerLiso = (cantidad: number) => ({ varianteId: 300, productoId: 30, tipoId: 3, cantidad, precioUnitario: 6000 });
const boxerEstampado = (cantidad: number) => ({ varianteId: 301, productoId: 31, tipoId: 3, cantidad, precioUnitario: 8000 });

describe('promociones: cálculo', () => {
  it('combo de productos distintos a precio fijo, con el descuento repartido según el precio', () => {
    const r = aplicarPromos([remeraNegra, bermudaAzul], [{ promocionId: 1, veces: 1 }], [combo]);
    expect(r.ok && r.aplicaciones).toEqual([{ promocionId: 1, nombre: 'Combo verano', veces: 1, precioNormal: 40000, precio: 30000, descuento: 10000 }]);
    expect(r.ok && Object.fromEntries(r.descuentos)).toEqual({ 100: 3750, 200: 6250 });
  });

  it('varias unidades por precio fijo, mezclando modelos del mismo tipo', () => {
    const r = aplicarPromos([boxerLiso(2), boxerEstampado(1)], [{ promocionId: 2, veces: 1 }], [tresBoxers]);
    expect(r.ok && r.aplicaciones[0]).toMatchObject({ precioNormal: 20000, precio: 15000, descuento: 5000 });
    expect(r.ok && r.descuentoTotal).toBe(5000);
  });

  it('2x1: paga la más cara y la más barata sale gratis', () => {
    const r = aplicarPromos([boxerLiso(1), boxerEstampado(1)], [{ promocionId: 3, veces: 1 }], [dosPorUno]);
    expect(r.ok && r.aplicaciones[0]).toMatchObject({ precioNormal: 14000, precio: 8000, descuento: 6000 });
  });

  it('aplicada dos veces usa unidades distintas y avisa si faltan', () => {
    const ok = aplicarPromos([boxerLiso(4)], [{ promocionId: 3, veces: 2 }], [dosPorUno]);
    expect(ok.ok && ok.descuentoTotal).toBe(12000);
    const mal = aplicarPromos([boxerLiso(3)], [{ promocionId: 3, veces: 2 }], [dosPorUno]);
    expect(mal).toEqual({ ok: false, error: 'Para aplicar “2x1 boxers” 2 veces faltan prendas: 2 × cualquier Boxer' });
  });

  it('una prenda no entra en dos promos a la vez', () => {
    const r = aplicarPromos([boxerLiso(3)], [{ promocionId: 2, veces: 1 }, { promocionId: 3, veces: 1 }], [tresBoxers, dosPorUno]);
    expect(r.ok).toBe(false);
  });

  it('no deja aplicar una promo que sale más cara que sin ella', () => {
    const cara = { ...combo, precio: 50000 };
    const r = aplicarPromos([remeraNegra, bermudaAzul], [{ promocionId: 1, veces: 1 }], [cara]);
    expect(r).toEqual({ ok: false, error: '“Combo verano” no hace descuento con estas prendas (sin la promo salen $ 40.000)' });
  });

  it('el reparto del descuento cierra exacto aunque haya redondeo', () => {
    const tres = promo({ id: 9, modo: 'PRECIO_FIJO', precio: 10000, componentes: [{ producto: null, tipo: BOXER, cantidad: 3 }] });
    const r = aplicarPromos([{ ...boxerLiso(1), precioUnitario: 5000 }, { ...boxerEstampado(2), precioUnitario: 5000 }], [{ promocionId: 9, veces: 1 }], [tres]);
    expect(r.ok && [...r.descuentos.values()].reduce((s, x) => s + x, 0)).toBe(5000);
  });

  it('sugiere las promos que entran y descarta las que ya no', () => {
    const posibles = promosPosibles([boxerLiso(3)], [], [tresBoxers, dosPorUno, combo]);
    expect(posibles.map((p) => [p.promo.id, p.ahorro])).toEqual([
      [2, 3000],
      [3, 6000],
    ]);
    expect(promosPosibles([boxerLiso(3)], [{ promocionId: 3, veces: 1 }], [tresBoxers, dosPorUno])).toEqual([]);
    expect(ajustarPromos([boxerLiso(2)], [{ promocionId: 3, veces: 2 }, { promocionId: 2, veces: 1 }], [tresBoxers, dosPorUno])).toEqual([
      { promocionId: 3, veces: 1 },
    ]);
  });
});

describe('promociones: definición', () => {
  it('describe cada tipo de promo', () => {
    expect(describirPromo(combo)).toBe('Remera Básica + Bermuda Rústica a $ 30.000');
    expect(describirPromo(tresBoxers)).toBe('3 × cualquier Boxer a $ 15.000');
    expect(describirPromo(dosPorUno)).toBe('2x1 en cualquier Boxer');
  });

  it('valida según el tipo', () => {
    const base = { nombre: 'Promo', componentes: [{ tipoId: 3, cantidad: 3 }] };
    expect(promocionSchema.safeParse({ ...base, modo: 'PRECIO_FIJO', precio: '15.000' }).data).toMatchObject({ precio: 15000, pagaCantidad: null });
    expect(promocionSchema.safeParse({ ...base, modo: 'PRECIO_FIJO', precio: '' }).error?.issues[0]?.message).toBe('Ingresá el precio de la promo');
    expect(promocionSchema.safeParse({ ...base, modo: 'NXM', pagaCantidad: 3 }).error?.issues[0]?.message).toBe('Tiene que pagar menos de las que lleva');
    expect(promocionSchema.safeParse({ ...base, modo: 'NXM', pagaCantidad: 2, precio: 5 }).data).toMatchObject({ precio: null, pagaCantidad: 2 });
    const uno = promocionSchema.safeParse({ nombre: 'X', modo: 'PRECIO_FIJO', precio: 1, componentes: [{ productoId: 1, cantidad: 1 }] });
    expect(uno.error?.issues[0]?.message).toBe('Una promo necesita al menos 2 prendas');
    const ambos = promocionSchema.safeParse({ nombre: 'X', modo: 'PRECIO_FIJO', precio: 1, componentes: [{ productoId: 1, tipoId: 2, cantidad: 2 }] });
    expect(ambos.error?.issues[0]?.message).toBe('Elegí un producto o un tipo de prenda');
    const fechas = promocionSchema.safeParse({ ...base, modo: 'PRECIO_FIJO', precio: 1, desde: '2026-12-10', hasta: '2026-12-01' });
    expect(fechas.error?.issues[0]?.message).toBe('La fecha de fin es anterior a la de inicio');
  });

  it('vigencia por fechas y activa', () => {
    const p = { activo: true, desde: '2026-12-01', hasta: '2026-12-31' };
    expect(promoVigente(p, '2026-11-30')).toBe(false);
    expect(promoVigente(p, '2026-12-01')).toBe(true);
    expect(promoVigente(p, '2026-12-31')).toBe(true);
    expect(promoVigente({ ...p, activo: false }, '2026-12-10')).toBe(false);
    expect(promoVigente({ activo: true, desde: null, hasta: null })).toBe(true);
  });
});
