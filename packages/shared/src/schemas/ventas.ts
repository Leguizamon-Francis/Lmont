import { z } from 'zod';
import { redondear } from '../money.js';
import { cantidadSchema, idSchema, montoSchema, textoObligatorio, textoOpcional } from './comunes.js';
import type { VarianteEncontrada } from './catalogo.js';

// ---------------------------------------------------------------------------
// Medios de pago y planes (recargo por cuotas / descuento por medio de pago)
// ---------------------------------------------------------------------------

export const MEDIOS_PAGO = {
  EFECTIVO: 'Efectivo',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  TRANSFERENCIA: 'Transferencia',
} as const;
export type MedioPago = keyof typeof MEDIOS_PAGO;
const MEDIOS = Object.keys(MEDIOS_PAGO) as [MedioPago, ...MedioPago[]];
export const medioPagoSchema = z.enum(MEDIOS, { error: 'Elegí el medio de pago' });

/**
 * Porcentaje que se aplica sobre lo que se paga con ese medio:
 * positivo = recargo (crédito en cuotas), negativo = descuento (efectivo, transferencia).
 * Acepta "10", "-10", "12,5".
 */
export const porcentajeSchema = z.union([z.string(), z.number()], { error: 'Ingresá el porcentaje' }).transform((v, ctx) => {
  const s = typeof v === 'number' ? String(v) : v.trim().replace('%', '').replace(',', '.');
  if (s === '') return 0;
  const n = Number(s);
  if (!/^-?\d+(\.\d{1,2})?$/.test(s) || !Number.isFinite(n)) {
    ctx.addIssue({ code: 'custom', message: 'Ingresá un porcentaje, por ejemplo 10 o 12,5' });
    return z.NEVER;
  }
  if (n <= -100 || n > 300) {
    ctx.addIssue({ code: 'custom', message: 'El porcentaje tiene que estar entre -99 y 300' });
    return z.NEVER;
  }
  return n;
});

export const cuotasSchema = z.coerce
  .number({ error: 'Elegí la cantidad de cuotas' })
  .int('Elegí la cantidad de cuotas')
  .min(1, 'Mínimo 1 cuota')
  .max(36, 'Máximo 36 cuotas');

/** Editar un plan existente. */
export const planPagoSchema = z.object({
  porcentaje: porcentajeSchema,
  activo: z.boolean().default(true),
});
export type PlanPagoInput = z.input<typeof planPagoSchema>;

/** Nuevo plan de cuotas con tarjeta de crédito (los demás medios tienen un único plan). */
export const nuevoPlanCuotasSchema = planPagoSchema.extend({ cuotas: cuotasSchema });
export type NuevoPlanCuotasInput = z.input<typeof nuevoPlanCuotasSchema>;

export type PlanPago = { id: number; medio: MedioPago; cuotas: number; porcentaje: number; activo: boolean };

/** Recargo (o descuento, si es negativo) sobre un monto, y lo que se termina cobrando. */
export function aplicarPorcentaje(monto: number, porcentaje: number) {
  const ajuste = redondear((monto * porcentaje) / 100);
  return { ajuste, cobrado: redondear(monto + ajuste) };
}

/** "Crédito 3 cuotas", "Efectivo"… */
export function nombrePlan(p: { medio: MedioPago; cuotas: number }) {
  if (p.medio !== 'CREDITO') return MEDIOS_PAGO[p.medio];
  return `${MEDIOS_PAGO.CREDITO} ${p.cuotas} ${p.cuotas === 1 ? 'cuota' : 'cuotas'}`;
}

/** "10% de descuento", "15% de recargo" o null si no tiene. */
export function textoPorcentaje(porcentaje: number) {
  if (!porcentaje) return null;
  const n = Math.abs(porcentaje).toLocaleString('es-AR');
  return porcentaje < 0 ? `${n}% de descuento` : `${n}% de recargo`;
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export const ventaItemSchema = z.object({
  varianteId: idSchema,
  cantidad: cantidadSchema(1),
  /** Precio por unidad que se cobra (normalmente el precio de venta del producto). */
  precioUnitario: montoSchema,
});
export type VentaItemInput = z.input<typeof ventaItemSchema>;

export const ventaPagoSchema = z.object({
  medio: medioPagoSchema,
  cuotas: cuotasSchema.default(1),
  /** Parte del total de la venta que se paga con este medio, antes de recargos o descuentos. */
  monto: montoSchema.refine((n) => n > 0, 'El monto del pago tiene que ser mayor a 0'),
});
export type VentaPagoInput = z.input<typeof ventaPagoSchema>;

/** Total de los productos de una venta (cantidad × precio cobrado). */
export const subtotalVenta = (items: { cantidad: number; precioUnitario: number }[]) =>
  redondear(items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0));

export const ventaSchema = z
  .object({
    vendedorId: idSchema.optional().nullable(),
    nota: textoOpcional(500),
    items: z
      .array(ventaItemSchema, { error: 'Agregá al menos un producto' })
      .min(1, 'Agregá al menos un producto')
      .max(200, 'Demasiados productos en una sola venta'),
    pagos: z
      .array(ventaPagoSchema, { error: 'Elegí el medio de pago' })
      .min(1, 'Elegí el medio de pago')
      .max(4, 'Se pueden combinar hasta 4 medios de pago'),
  })
  .superRefine((d, ctx) => {
    const vistas = new Set<number>();
    d.items.forEach((it, i) => {
      if (vistas.has(it.varianteId)) ctx.addIssue({ code: 'custom', path: ['items', i], message: 'Hay un producto repetido en la venta' });
      vistas.add(it.varianteId);
    });
    if (d.pagos.some((p) => p.medio !== 'CREDITO' && p.cuotas !== 1)) {
      ctx.addIssue({ code: 'custom', path: ['pagos'], message: 'Solo el crédito se puede pagar en cuotas' });
    }
    const subtotal = subtotalVenta(d.items);
    const pagado = redondear(d.pagos.reduce((s, p) => s + p.monto, 0));
    if (pagado !== subtotal) {
      const f = (n: number) => '$ ' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
      ctx.addIssue({
        code: 'custom',
        path: ['pagos'],
        message: `Los pagos suman ${f(pagado)} y la venta es de ${f(subtotal)}: tienen que coincidir`,
      });
    }
  });
export type VentaInput = z.input<typeof ventaSchema>;

export const anularVentaSchema = z.object({ motivo: textoObligatorio('el motivo', 200) });
export type AnularVentaInput = z.input<typeof anularVentaSchema>;

// ---------------------------------------------------------------------------
// Respuestas de la API
// ---------------------------------------------------------------------------

export type VentaPago = {
  id: number;
  medio: MedioPago;
  cuotas: number;
  monto: number;
  porcentaje: number;
  ajuste: number;
  /** Lo que efectivamente se cobró con este medio (monto + ajuste). */
  cobrado: number;
};

export type VentaResumen = {
  id: number;
  creadoEn: string;
  vendedor: { id: number; nombre: string } | null;
  unidades: number;
  /** Primeros productos, para mostrar en la lista ("Camisa Oxford, Remera Básica…"). */
  descripcion: string;
  subtotal: number;
  total: number;
  pagos: Pick<VentaPago, 'medio' | 'cuotas' | 'cobrado'>[];
  anulada: boolean;
};

export type VentaDetalle = Omit<VentaResumen, 'pagos'> & {
  nota: string | null;
  anuladaEn: string | null;
  motivoAnulacion: string | null;
  items: {
    id: number;
    cantidad: number;
    precioLista: number;
    precioUnitario: number;
    variante: VarianteEncontrada;
  }[];
  pagos: VentaPago[];
};

export type TotalesVentas = {
  ventas: number;
  unidades: number;
  total: number;
  porMedio: { medio: MedioPago; total: number }[];
};

export type ListaVentas = { fecha: string; ventas: VentaResumen[]; totales: TotalesVentas };
