import { describe, expect, it } from 'vitest';
import {
  codigoInterno,
  digitoVerificadorEan13,
  nuevasVariantesSchema,
  nuevoProductoSchema,
  productoSchema,
  varianteSchema,
} from '../src/index.js';

describe('códigos de barras internos', () => {
  it('calcula el dígito verificador EAN-13', () => {
    expect(digitoVerificadorEan13('400638133393')).toBe(1); // 4006381333931
    expect(digitoVerificadorEan13('590123412345')).toBe(7); // 5901234123457
  });

  it('genera códigos de 13 dígitos con prefijo 20 y distintos por variante', () => {
    const a = codigoInterno(1);
    const b = codigoInterno(1234);
    expect(a).toMatch(/^20\d{11}$/);
    expect(a).toBe('2000000000015');
    expect(b).not.toBe(a);
    expect(Number(b[12])).toBe(digitoVerificadorEan13(b.slice(0, 12)));
  });
});

describe('productoSchema', () => {
  const base = { tipoId: 1, nombre: ' Chino ', precioCompra: '15.000', precioVenta: '32.500,50' };

  it('acepta montos en formato argentino y recorta textos', () => {
    const r = productoSchema.parse({ ...base, observaciones: '  ' });
    expect(r).toMatchObject({ nombre: 'Chino', precioCompra: 15000, precioVenta: 32500.5, observaciones: null, activo: true });
  });

  it('exige tipo, modelo y precios no negativos', () => {
    const r = productoSchema.safeParse({ tipoId: '', nombre: '', precioCompra: '-5', precioVenta: '' });
    expect(r.success).toBe(false);
    const msgs = Object.fromEntries(r.error!.issues.map((i) => [i.path.join('.'), i.message]));
    expect(msgs.tipoId).toBe('Elegí el tipo de prenda');
    expect(msgs.nombre).toBe('Completá el modelo');
    expect(msgs.precioCompra).toBe('El monto no puede ser negativo');
    expect(msgs.precioVenta).toBe('Ingresá un monto');
  });

  it('al crear, colores y talles son opcionales', () => {
    expect(nuevoProductoSchema.parse(base)).toMatchObject({ colorIds: [], talleIds: [] });
  });
});

describe('variantes', () => {
  it('pide al menos un color y un talle para agregar variantes', () => {
    const r = nuevasVariantesSchema.safeParse({ colorIds: [], talleIds: [] });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual(['Elegí al menos un color', 'Elegí al menos un talle']);
  });

  it('acepta cantidades iniciales solo de las combinaciones elegidas', () => {
    const ok = nuevasVariantesSchema.parse({ colorIds: [1], talleIds: [2, 3], cantidades: [{ colorId: 1, talleId: 2, cantidad: '5' }] });
    expect(ok.cantidades).toEqual([{ colorId: 1, talleId: 2, cantidad: 5 }]);

    const ajena = nuevasVariantesSchema.safeParse({ colorIds: [1], talleIds: [2], cantidades: [{ colorId: 9, talleId: 2, cantidad: 1 }] });
    expect(ajena.success).toBe(false);
    const repetida = nuevasVariantesSchema.safeParse({
      colorIds: [1],
      talleIds: [2],
      cantidades: [
        { colorId: 1, talleId: 2, cantidad: 1 },
        { colorId: 1, talleId: 2, cantidad: 2 },
      ],
    });
    expect(repetida.success).toBe(false);
    const negativa = nuevasVariantesSchema.safeParse({ colorIds: [1], talleIds: [2], cantidades: [{ colorId: 1, talleId: 2, cantidad: -1 }] });
    expect(negativa.success).toBe(false);
  });

  it('valida el código de barras y el stock mínimo', () => {
    expect(varianteSchema.parse({ codigoBarras: ' 779123 ', stockMinimo: '2' })).toEqual({
      codigoBarras: '779123',
      stockMinimo: 2,
      activo: true,
    });
    expect(varianteSchema.parse({ codigoBarras: '', stockMinimo: 0 }).codigoBarras).toBeNull();
    expect(varianteSchema.safeParse({ codigoBarras: '779 123', stockMinimo: 0 }).success).toBe(false);
    expect(varianteSchema.safeParse({ codigoBarras: null, stockMinimo: -1 }).success).toBe(false);
  });
});
