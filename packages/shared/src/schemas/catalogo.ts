import { z } from 'zod';
import { cantidadSchema, idSchema, montoSchema, textoObligatorio, textoOpcional } from './comunes.js';

// ---------------------------------------------------------------------------
// Listas administrables: tipos de prenda, talles y colores
// ---------------------------------------------------------------------------

export const tipoPrendaSchema = z.object({
  nombre: textoObligatorio('el nombre', 60),
  activo: z.boolean().default(true),
});
export const colorSchema = tipoPrendaSchema;
export const talleSchema = z.object({
  nombre: textoObligatorio('el talle', 20),
  activo: z.boolean().default(true),
});
/** Nuevo orden de los talles: ids en el orden en que se tienen que mostrar. */
export const ordenTallesSchema = z.object({
  ids: z.array(idSchema, { error: 'Falta el orden de los talles' }).min(1, 'Falta el orden de los talles'),
});

export type ItemListaInput = z.input<typeof tipoPrendaSchema>;
export type ItemLista = { id: number; nombre: string; activo: boolean };
export type Talle = ItemLista & { orden: number };

// ---------------------------------------------------------------------------
// Códigos de barras
// ---------------------------------------------------------------------------

/** Código de barras opcional: sin espacios, letras/números/guiones. Vacío -> null. */
export const codigoBarrasSchema = z
  .string()
  .trim()
  .max(40, 'El código de barras puede tener hasta 40 caracteres')
  .regex(/^[0-9A-Za-z-]*$/, 'El código de barras solo puede tener letras, números y guiones')
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/** Dígito verificador EAN-13 para los primeros 12 dígitos. */
export function digitoVerificadorEan13(doce: string): number {
  let suma = 0;
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

/**
 * Código EAN-13 interno para una variante que no trae código del proveedor.
 * Usa el prefijo 20 (reservado para uso interno de cada comercio) + el id de la variante.
 */
export function codigoInterno(varianteId: number): string {
  const doce = '20' + String(varianteId).padStart(10, '0');
  return doce + digitoVerificadorEan13(doce);
}

// ---------------------------------------------------------------------------
// Productos y variantes
// ---------------------------------------------------------------------------

const idsSchema = (que: string) => z.array(idSchema).max(50, `Elegiste demasiados ${que}`).default([]);

/** Unidades con las que arranca una combinación color × talle nueva. */
export const cantidadInicialSchema = z.object({
  colorId: idSchema,
  talleId: idSchema,
  cantidad: cantidadSchema(0),
});
export type CantidadInicial = z.output<typeof cantidadInicialSchema>;

const cantidadesSchema = z.array(cantidadInicialSchema).max(2500, 'Demasiadas combinaciones').default([]);

/** Las cantidades tienen que ser de combinaciones elegidas y sin repetir. */
function validarCantidades(
  d: { colorIds: number[]; talleIds: number[]; cantidades: CantidadInicial[] },
  ctx: z.RefinementCtx,
) {
  const vistas = new Set<string>();
  d.cantidades.forEach((c, i) => {
    const clave = `${c.colorId}-${c.talleId}`;
    if (!d.colorIds.includes(c.colorId) || !d.talleIds.includes(c.talleId) || vistas.has(clave)) {
      ctx.addIssue({ code: 'custom', path: ['cantidades', i], message: 'Revisá las cantidades: no coinciden con los colores y talles elegidos' });
    }
    vistas.add(clave);
  });
}

/** Combinaciones color × talle a crear (las que ya existen se ignoran), con sus unidades iniciales. */
export const nuevasVariantesSchema = z
  .object({
    colorIds: idsSchema('colores').refine((a) => a.length > 0, 'Elegí al menos un color'),
    talleIds: idsSchema('talles').refine((a) => a.length > 0, 'Elegí al menos un talle'),
    cantidades: cantidadesSchema,
  })
  .superRefine(validarCantidades);
export type NuevasVariantesInput = z.input<typeof nuevasVariantesSchema>;

export const productoSchema = z.object({
  tipoId: z.coerce
    .number({ error: 'Elegí el tipo de prenda' })
    .int('Elegí el tipo de prenda')
    .positive('Elegí el tipo de prenda'),
  nombre: textoObligatorio('el modelo', 80),
  precioCompra: montoSchema,
  precioVenta: montoSchema,
  observaciones: textoOpcional(1000),
  activo: z.boolean().default(true),
});
export type ProductoInput = z.input<typeof productoSchema>;
export type ProductoData = z.output<typeof productoSchema>;

/** Alta de producto: datos + colores, talles y unidades para crear las variantes de una vez (opcional). */
export const nuevoProductoSchema = productoSchema
  .extend({
    colorIds: idsSchema('colores'),
    talleIds: idsSchema('talles'),
    cantidades: cantidadesSchema,
  })
  .superRefine(validarCantidades);
export type NuevoProductoInput = z.input<typeof nuevoProductoSchema>;

export const varianteSchema = z.object({
  codigoBarras: codigoBarrasSchema,
  stockMinimo: cantidadSchema(0),
  activo: z.boolean().default(true),
});
export type VarianteInput = z.input<typeof varianteSchema>;

// ---------------------------------------------------------------------------
// Respuestas de la API
// ---------------------------------------------------------------------------

export type Variante = {
  id: number;
  color: ItemLista;
  talle: Talle;
  codigoBarras: string | null;
  stock: number;
  stockMinimo: number;
  activo: boolean;
};

export type ProductoResumen = {
  id: number;
  nombre: string;
  tipo: ItemLista;
  precioCompra: number;
  precioVenta: number;
  activo: boolean;
  cantidadVariantes: number;
  stockTotal: number;
  /** Variantes activas con stock por debajo (o igual) del mínimo configurado. */
  variantesStockBajo: number;
};

export type ProductoDetalle = Omit<ProductoResumen, 'cantidadVariantes' | 'stockTotal' | 'variantesStockBajo'> & {
  tipoId: number;
  observaciones: string | null;
  variantes: Variante[];
};

export type PrecioHistorial = { id: number; precioCompra: number; precioVenta: number; desde: string };

/** Resultado de buscar por código de barras (lector o cámara). */
export type VarianteEncontrada = Variante & {
  producto: { id: number; nombre: string; tipo: ItemLista; precioVenta: number; activo: boolean };
};

export type ListaProductos = { productos: ProductoResumen[]; total: number };
