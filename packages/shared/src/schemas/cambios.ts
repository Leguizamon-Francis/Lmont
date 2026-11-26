import { z } from 'zod';
import { formatMonto, redondear } from '../money.js';
import { cantidadSchema, idSchema, textoOpcional } from './comunes.js';
import { medioPagoSchema, subtotalVenta, ventaItemSchema, ventaPagoSchema, type MedioPago, type VentaPago } from './ventas.js';
import type { VarianteEncontrada } from './catalogo.js';

/**
 * Cambio o devolución sobre una venta registrada.
 * - devueltos: ítems de esa venta que el cliente trae (vuelven al stock).
 * - llevados: prendas que se lleva a cambio (salen del stock). Vacío = devolución.
 * - Si lo que se lleva vale más, la diferencia se cobra con `pagos`.
 * - Si vale menos, se le devuelve la diferencia con `medioReintegro`.
 */
/** Por qué el cliente cambia o devuelve: alimenta el reporte de cambios. */
export const MOTIVOS_CAMBIO = {
  TALLE: 'No le quedó bien el talle',
  COLOR: 'Quería otro color',
  FALLA: 'Falla o defecto',
  GUSTO: 'No le gustó',
  REGALO: 'Era un regalo',
  OTRO: 'Otro',
} as const;
export type MotivoCambio = keyof typeof MOTIVOS_CAMBIO;
export const motivoCambioSchema = z.enum(Object.keys(MOTIVOS_CAMBIO) as [MotivoCambio, ...MotivoCambio[]], { error: 'Elegí el motivo' });

export const cambioSchema = z
  .object({
    ventaId: idSchema,
    vendedorId: idSchema.optional().nullable(),
    motivo: motivoCambioSchema.optional().nullable(),
    nota: textoOpcional(500),
    devueltos: z
      .array(z.object({ ventaItemId: idSchema, cantidad: cantidadSchema(1) }), { error: 'Elegí qué prendas trae el cliente' })
      .min(1, 'Elegí qué prendas trae el cliente')
      .max(200, 'Demasiadas prendas'),
    llevados: z.array(ventaItemSchema).max(200, 'Demasiadas prendas').default([]),
    pagos: z.array(ventaPagoSchema).max(4, 'Se pueden combinar hasta 4 medios de pago').default([]),
    medioReintegro: medioPagoSchema.optional().nullable(),
  })
  .superRefine((d, ctx) => {
    const devueltos = new Set<number>();
    d.devueltos.forEach((it, i) => {
      if (devueltos.has(it.ventaItemId)) ctx.addIssue({ code: 'custom', path: ['devueltos', i], message: 'Hay una prenda devuelta repetida' });
      devueltos.add(it.ventaItemId);
    });
    const llevados = new Set<number>();
    d.llevados.forEach((it, i) => {
      if (llevados.has(it.varianteId)) ctx.addIssue({ code: 'custom', path: ['llevados', i], message: 'Hay una prenda repetida en lo que se lleva' });
      llevados.add(it.varianteId);
    });
    if (d.pagos.some((p) => p.medio !== 'CREDITO' && p.cuotas !== 1)) {
      ctx.addIssue({ code: 'custom', path: ['pagos'], message: 'Solo el crédito se puede pagar en cuotas' });
    }
  });
export type CambioInput = z.input<typeof cambioSchema>;

/** Valor de lo que vuelve, de lo que se lleva y la diferencia (positiva = paga el cliente). */
export function calcularCambio(devueltos: { cantidad: number; precioUnitario: number }[], llevados: { cantidad: number; precioUnitario: number }[]) {
  const totalDevuelto = subtotalVenta(devueltos);
  const totalLlevado = subtotalVenta(llevados);
  return { totalDevuelto, totalLlevado, diferencia: redondear(totalLlevado - totalDevuelto) };
}

/**
 * Revisa que la plata del cambio cierre con la diferencia. Devuelve el mensaje de error o null.
 * Se usa en el formulario y en el servidor.
 */
export function errorPagosCambio(diferencia: number, pagos: { monto: number }[], medioReintegro: MedioPago | null | undefined): string | null {
  if (diferencia > 0) {
    if (!pagos.length) return `El cliente tiene que pagar la diferencia de ${formatMonto(diferencia)}: elegí el medio de pago`;
    const pagado = redondear(pagos.reduce((s, p) => s + p.monto, 0));
    if (pagado !== diferencia) return `Los pagos suman ${formatMonto(pagado)} y la diferencia es de ${formatMonto(diferencia)}: tienen que coincidir`;
    return null;
  }
  if (pagos.length) return 'No hay diferencia a cobrar: sacá los pagos';
  if (diferencia < 0 && !medioReintegro) return `Hay que devolverle ${formatMonto(-diferencia)} al cliente: elegí cómo`;
  return null;
}

export const esDevolucion = (c: { llevados: unknown[] }) => c.llevados.length === 0;

// ---------------------------------------------------------------------------
// Respuestas de la API
// ---------------------------------------------------------------------------

export type CambioDetalle = {
  id: number;
  ventaId: number;
  creadoEn: string;
  vendedor: { id: number; nombre: string } | null;
  motivo: MotivoCambio | null;
  nota: string | null;
  totalDevuelto: number;
  totalLlevado: number;
  diferencia: number;
  devueltos: { id: number; ventaItemId: number; cantidad: number; precioUnitario: number; variante: VarianteEncontrada }[];
  llevados: { id: number; cantidad: number; precioLista: number; precioUnitario: number; variante: VarianteEncontrada }[];
  /** Cobros (cobrado > 0) o reintegros (cobrado < 0). */
  pagos: VentaPago[];
};

export type CambioResumen = {
  id: number;
  ventaId: number;
  creadoEn: string;
  vendedor: { id: number; nombre: string } | null;
  cliente: { id: number; nombre: string } | null;
  devolucion: boolean;
  /** "Vuelve: Remera Básica Negro M · Se lleva: Remera Básica Negro L" */
  descripcion: string;
  diferencia: number;
  pagos: { medio: MedioPago; cobrado: number }[];
};
