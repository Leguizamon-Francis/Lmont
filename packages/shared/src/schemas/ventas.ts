import { z } from 'zod';
import { redondear } from '../money.js';
import { cantidadSchema, idSchema, montoSchema, textoObligatorio, textoOpcional } from './comunes.js';
import type { VarianteEncontrada } from './catalogo.js';
import type { CambioDetalle } from './cambios.js';

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

/** Nuevo plan de cuotas con tarjeta de crédito (los demás medios tienen un único plan). */
export const nuevoPlanCuotasSchema = planPagoSchema.extend({ cuotas: cuotasSchema });

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

/** Cuotas que se pueden elegir al cobrar con tarjeta de crédito. */
export const CUOTAS_CREDITO = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24] as const;

export const ventaPagoSchema = z
  .object({
    medio: medioPagoSchema,
    cuotas: cuotasSchema.default(1),
    /** Parte del total de la venta que se paga con este medio, antes de recargos o descuentos. */
    monto: montoSchema.refine((n) => n > 0, 'El monto del pago tiene que ser mayor a 0'),
    /**
     * Recargo de la tarjeta de crédito en %, que pone el vendedor en cada venta.
     * Si no viene, se usa el % configurado para ese plan (o 0). Los demás medios usan siempre lo configurado.
     */
    porcentaje: porcentajeSchema.optional(),
  })
  .superRefine((p, ctx) => {
    if (p.porcentaje === undefined) return;
    if (p.medio !== 'CREDITO') ctx.addIssue({ code: 'custom', path: ['porcentaje'], message: 'Solo el pago con crédito lleva recargo' });
    else if (p.porcentaje < 0) ctx.addIssue({ code: 'custom', path: ['porcentaje'], message: 'El recargo no puede ser negativo' });
  });

/** Total de los productos de una venta (cantidad × precio cobrado). */
export const subtotalVenta = (items: { cantidad: number; precioUnitario: number }[]) =>
  redondear(items.reduce((s, it) => s + it.cantidad * it.precioUnitario, 0));

export const ventaSchema = z
  .object({
    vendedorId: idSchema.optional().nullable(),
    clienteId: idSchema.optional().nullable(),
    nota: textoOpcional(500),
    items: z
      .array(ventaItemSchema, { error: 'Agregá al menos un producto' })
      .min(1, 'Agregá al menos un producto')
      .max(200, 'Demasiados productos en una sola venta'),
    pagos: z
      .array(ventaPagoSchema, { error: 'Elegí el medio de pago' })
      .min(1, 'Elegí el medio de pago')
      .max(4, 'Se pueden combinar hasta 4 medios de pago'),
    /** Promociones aplicadas (el servidor vuelve a calcular el descuento). */
    promos: z
      .array(z.object({ promocionId: idSchema, veces: cantidadSchema(1) }))
      .max(20, 'Demasiadas promociones en una sola venta')
      .default([]),
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
    const promos = new Set<number>();
    d.promos.forEach((p, i) => {
      if (promos.has(p.promocionId)) ctx.addIssue({ code: 'custom', path: ['promos', i], message: 'Hay una promoción repetida' });
      promos.add(p.promocionId);
    });
    // Con promos, el total depende del descuento: lo revisa el servidor.
    if (d.promos.length) return;
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
  cliente: { id: number; nombre: string } | null;
  unidades: number;
  /** Primeros productos, para mostrar en la lista ("Camisa Oxford, Remera Básica…"). */
  descripcion: string;
  /** Productos menos el descuento de las promociones. */
  subtotal: number;
  total: number;
  pagos: Pick<VentaPago, 'medio' | 'cuotas' | 'cobrado'>[];
  anulada: boolean;
  /** Tiene cambios o devoluciones registrados. */
  conCambios: boolean;
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
    /** Descuento de promociones que le tocó a este ítem (total). */
    descuentoPromo: number;
    /** Lo que se pagó por unidad, con la promo y el descuento del medio de pago. */
    precioEfectivo: number;
    /** Lo que se pagó por el ítem completo (de acá sale el reintegro si lo devuelve). */
    pagado: number;
    variante: VarianteEncontrada;
    /** Unidades que el cliente ya devolvió (en cambios o devoluciones). */
    devueltas: number;
  }[];
  pagos: VentaPago[];
  cambios: CambioDetalle[];
  descuentoPromos: number;
  promociones: { id: number; promocionId: number; nombre: string; veces: number; precioNormal: number; precio: number; descuento: number }[];
};

export type TotalesVentas = {
  ventas: number;
  unidades: number;
  total: number;
  porMedio: { medio: MedioPago; total: number }[];
};

export type ListaVentas = { fecha: string; ventas: VentaResumen[]; totales: TotalesVentas };

type ItemCobrado = { cantidad: number; precioUnitario: number; descuentoPromo: number };

/**
 * Qué parte de lo vendido se cobró después de los descuentos por medio de pago (efectivo, transferencia).
 * 1 = sin descuento. Los recargos de la tarjeta no cuentan: no se reintegran.
 */
export function factorDescuentoMedios(items: ItemCobrado[], pagos: { ajuste: number }[]) {
  const subtotal = items.reduce((s, it) => s + it.cantidad * it.precioUnitario - it.descuentoPromo, 0);
  const descuento = pagos.reduce((s, p) => s + Math.min(0, p.ajuste), 0);
  return subtotal > 0 ? (subtotal + descuento) / subtotal : 1;
}

/** Lo que el cliente pagó por un ítem: con la promo y con el descuento del medio de pago. */
export const pagadoItem = (it: ItemCobrado, factor = 1) => redondear((it.cantidad * it.precioUnitario - it.descuentoPromo) * factor);

/** Lo que pagó por unidad (para mostrar). */
export const precioEfectivo = (it: ItemCobrado, factor = 1) => redondear(pagadoItem(it, factor) / it.cantidad);

/**
 * Plata a devolver por `vuelven` unidades de un ítem del que ya volvieron `yaDevueltas`.
 * Reparte lo pagado de forma que, sumando todas las devoluciones, nunca se devuelva más de lo cobrado
 * (con 3 a $ 666,67 se devuelven $ 2.000, no $ 2.000,01).
 */
export function reintegroItem(pagado: number, cantidad: number, yaDevueltas: number, vuelven: number) {
  const hasta = (k: number) => redondear((pagado * k) / cantidad);
  return redondear(hasta(yaDevueltas + vuelven) - hasta(yaDevueltas));
}
