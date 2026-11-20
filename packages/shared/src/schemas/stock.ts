import { z } from 'zod';
import { hoy } from '../fechas.js';
import { cantidadSchema, idSchema, montoSchema, textoObligatorio, textoOpcional } from './comunes.js';
import type { ItemLista, VarianteEncontrada } from './catalogo.js';

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

/** WhatsApp opcional: se guardan solo los dígitos (con código de país si lo escriben). */
export const whatsappSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    if (!/^[\d\s()+-]+$/.test(v)) {
      ctx.addIssue({ code: 'custom', message: 'El WhatsApp solo puede tener números' });
      return z.NEVER;
    }
    const digitos = v.replace(/\D/g, '');
    if (digitos.length < 8 || digitos.length > 15) {
      ctx.addIssue({ code: 'custom', message: 'Revisá el número: tiene que tener entre 8 y 15 dígitos' });
      return z.NEVER;
    }
    return digitos;
  });

export const proveedorSchema = z.object({
  nombre: textoObligatorio('el nombre', 80),
  whatsapp: whatsappSchema,
  notas: textoOpcional(500),
  activo: z.boolean().default(true),
});
export type ProveedorInput = z.input<typeof proveedorSchema>;
export type Proveedor = { id: number; nombre: string; whatsapp: string | null; notas: string | null; activo: boolean };

/** Link para abrir el chat de WhatsApp. Si el número no tiene código de país, asume Argentina (54). */
export function linkWhatsapp(digitos: string): string {
  const n = digitos.startsWith('54') ? digitos : `54${digitos.replace(/^0/, '')}`;
  return `https://wa.me/${n}`;
}

// ---------------------------------------------------------------------------
// Ingresos de mercadería
// ---------------------------------------------------------------------------

/** Fecha "AAAA-MM-DD", no futura. Vacía = hoy. */
export const fechaPasadaSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return hoy();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
      ctx.addIssue({ code: 'custom', message: 'Fecha inválida' });
      return z.NEVER;
    }
    if (v > hoy()) {
      ctx.addIssue({ code: 'custom', message: 'La fecha no puede ser posterior a hoy' });
      return z.NEVER;
    }
    if (v < '2020-01-01') {
      ctx.addIssue({ code: 'custom', message: 'Revisá la fecha' });
      return z.NEVER;
    }
    return v;
  });

export const ingresoItemSchema = z.object({
  varianteId: idSchema,
  cantidad: cantidadSchema(1),
  costoUnitario: montoSchema,
});
export type IngresoItemInput = z.input<typeof ingresoItemSchema>;

export const ingresoSchema = z
  .object({
    fecha: fechaPasadaSchema,
    proveedorId: idSchema.optional().nullable(),
    pagadoConCaja: z.boolean().default(false),
    nota: textoOpcional(500),
    items: z
      .array(ingresoItemSchema, { error: 'Agregá al menos una prenda' })
      .min(1, 'Agregá al menos una prenda')
      .max(1000, 'Demasiadas prendas en un solo ingreso'),
  })
  .superRefine((d, ctx) => {
    const vistas = new Set<number>();
    d.items.forEach((it, i) => {
      if (vistas.has(it.varianteId)) {
        ctx.addIssue({ code: 'custom', path: ['items', i], message: 'Hay una prenda repetida en el ingreso' });
      }
      vistas.add(it.varianteId);
    });
  });
export type IngresoInput = z.input<typeof ingresoSchema>;

export type IngresoResumen = {
  id: number;
  fecha: string;
  proveedor: ItemLista | null;
  total: number;
  unidades: number;
  pagadoConCaja: boolean;
};

export type IngresoDetalle = IngresoResumen & {
  nota: string | null;
  creadoEn: string;
  items: { id: number; cantidad: number; costoUnitario: number; variante: VarianteEncontrada }[];
  /** Productos a los que se les actualizó el precio de compra con este ingreso. */
  preciosActualizados?: { productoId: number; nombre: string; antes: number; ahora: number }[];
};

export type ListaIngresos = { ingresos: IngresoResumen[]; total: number };

// ---------------------------------------------------------------------------
// Ajustes y movimientos
// ---------------------------------------------------------------------------

export const MOTIVOS_AJUSTE = {
  RECUENTO: 'Recuento (conté y no coincide)',
  ROTURA: 'Rotura o falla',
  PERDIDA: 'Pérdida o robo',
  OTRO: 'Otro',
} as const;
export type MotivoAjuste = keyof typeof MOTIVOS_AJUSTE;

/** Ajuste manual: se indica cuántas hay realmente y el sistema calcula la diferencia. */
export const ajusteSchema = z
  .object({
    stockReal: cantidadSchema(0),
    motivo: z.enum(Object.keys(MOTIVOS_AJUSTE) as [MotivoAjuste, ...MotivoAjuste[]], { error: 'Elegí el motivo' }),
    nota: textoOpcional(200),
  })
  .superRefine((d, ctx) => {
    if (d.motivo === 'OTRO' && !d.nota) ctx.addIssue({ code: 'custom', path: ['nota'], message: 'Contá brevemente el motivo' });
  });
export type AjusteInput = z.input<typeof ajusteSchema>;

export type TipoMovimiento = 'CARGA_INICIAL' | 'INGRESO' | 'AJUSTE' | 'VENTA' | 'ANULACION_VENTA' | 'DEVOLUCION' | 'CAMBIO';

export const NOMBRE_MOVIMIENTO: Record<TipoMovimiento, string> = {
  CARGA_INICIAL: 'Carga inicial',
  INGRESO: 'Ingreso de mercadería',
  AJUSTE: 'Ajuste',
  VENTA: 'Venta',
  ANULACION_VENTA: 'Venta anulada',
  DEVOLUCION: 'Volvió (cambio o devolución)',
  CAMBIO: 'Se la llevó en un cambio',
};

export type Movimiento = {
  id: number;
  tipo: TipoMovimiento;
  cantidad: number;
  stockResultante: number;
  detalle: string | null;
  ingresoId: number | null;
  ventaId: number | null;
  creadoEn: string;
};
