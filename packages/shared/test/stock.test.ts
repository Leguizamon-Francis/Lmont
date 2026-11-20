import { describe, expect, it } from 'vitest';
import { ajusteSchema, formatFecha, hoy, ingresoSchema, linkWhatsapp, proveedorSchema } from '../src/index.js';

describe('fechas', () => {
  it('calcula hoy en hora argentina', () => {
    // 02:00 UTC del 13/11 todavía es 12/11 en Argentina (UTC-3).
    expect(hoy(new Date('2026-11-13T02:00:00Z'))).toBe('2026-11-12');
    expect(hoy(new Date('2026-11-13T03:00:00Z'))).toBe('2026-11-13');
  });
  it('muestra la fecha como DD/MM/AAAA', () => {
    expect(formatFecha('2026-03-05')).toBe('05/03/2026');
  });
});

describe('proveedores', () => {
  it('guarda solo los dígitos del WhatsApp', () => {
    expect(proveedorSchema.parse({ nombre: 'Textil Sur', whatsapp: '+54 9 342 555-1234' }).whatsapp).toBe('5493425551234');
    expect(proveedorSchema.parse({ nombre: 'X', whatsapp: '' }).whatsapp).toBeNull();
    expect(proveedorSchema.safeParse({ nombre: 'X', whatsapp: '342-abc' }).success).toBe(false);
    expect(proveedorSchema.safeParse({ nombre: 'X', whatsapp: '123' }).success).toBe(false);
  });
  it('arma el link de WhatsApp agregando el 54 si falta', () => {
    expect(linkWhatsapp('5493425551234')).toBe('https://wa.me/5493425551234');
    expect(linkWhatsapp('03425551234')).toBe('https://wa.me/543425551234');
  });
});

describe('ingresoSchema', () => {
  const item = { varianteId: 1, cantidad: '3', costoUnitario: '8.500' };

  it('usa hoy si no hay fecha y convierte cantidades y costos', () => {
    const r = ingresoSchema.parse({ items: [item] });
    expect(r.fecha).toBe(hoy());
    expect(r.items[0]).toEqual({ varianteId: 1, cantidad: 3, costoUnitario: 8500 });
    expect(r.pagadoConCaja).toBe(false);
  });

  it('exige al menos una prenda, sin repetir, con cantidad mayor a 0', () => {
    expect(ingresoSchema.safeParse({ items: [] }).error?.issues[0]?.message).toBe('Agregá al menos una prenda');
    expect(ingresoSchema.safeParse({ items: [item, item] }).success).toBe(false);
    expect(ingresoSchema.safeParse({ items: [{ ...item, cantidad: 0 }] }).success).toBe(false);
    expect(ingresoSchema.safeParse({ items: [{ ...item, costoUnitario: '-1' }] }).success).toBe(false);
  });

  it('no acepta fechas futuras', () => {
    const r = ingresoSchema.safeParse({ fecha: '2999-01-01', items: [item] });
    expect(r.error?.issues[0]?.message).toBe('La fecha no puede ser posterior a hoy');
  });
});

describe('ajusteSchema', () => {
  it('pide nota cuando el motivo es Otro', () => {
    expect(ajusteSchema.safeParse({ stockReal: '2', motivo: 'ROTURA' }).success).toBe(true);
    const r = ajusteSchema.safeParse({ stockReal: '2', motivo: 'OTRO', nota: ' ' });
    expect(r.error?.issues[0]).toMatchObject({ path: ['nota'], message: 'Contá brevemente el motivo' });
  });
  it('no acepta stock negativo ni motivos inventados', () => {
    expect(ajusteSchema.safeParse({ stockReal: '-1', motivo: 'RECUENTO' }).success).toBe(false);
    expect(ajusteSchema.safeParse({ stockReal: '1', motivo: 'REGALO' }).success).toBe(false);
  });
});
