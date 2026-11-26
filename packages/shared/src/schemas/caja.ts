import { z } from 'zod';
import { idSchema, montoSchema, textoObligatorio, textoOpcional } from './comunes.js';
import { fechaPasadaSchema } from './stock.js';
import { medioPagoSchema, type MedioPago } from './ventas.js';

// ---------------------------------------------------------------------------
// Conceptos (lista administrable: Alquiler, Sueldos, Retiro…)
// ---------------------------------------------------------------------------

export const TIPOS_CAJA = { INGRESO: 'Ingreso', GASTO: 'Gasto' } as const;
export type TipoCaja = keyof typeof TIPOS_CAJA;
export const tipoCajaSchema = z.enum(['INGRESO', 'GASTO'], { error: 'Elegí si es un ingreso o un gasto' });

export const conceptoCajaSchema = z.object({
  nombre: textoObligatorio('el concepto', 60),
  tipo: tipoCajaSchema,
  activo: z.boolean().default(true),
  /** Solo gastos: si resta en la ganancia de Reportes (un retiro del dueño no). */
  cuentaEnGanancia: z.boolean().default(true),
});
export type ConceptoCajaInput = z.input<typeof conceptoCajaSchema>;
export type ConceptoCaja = { id: number; nombre: string; tipo: TipoCaja; activo: boolean; cuentaEnGanancia: boolean };

// ---------------------------------------------------------------------------
// Movimientos cargados a mano
// ---------------------------------------------------------------------------

export const movimientoCajaSchema = z.object({
  tipo: tipoCajaSchema,
  conceptoId: z.coerce.number({ error: 'Elegí el concepto' }).int('Elegí el concepto').positive('Elegí el concepto'),
  monto: montoSchema.refine((n) => n > 0, 'El monto tiene que ser mayor a 0'),
  medio: medioPagoSchema.default('EFECTIVO'),
  fecha: fechaPasadaSchema,
  detalle: textoOpcional(300),
  vendedorId: idSchema.optional().nullable(),
});
export type MovimientoCajaInput = z.input<typeof movimientoCajaSchema>;

export const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido');

// ---------------------------------------------------------------------------
// Respuestas de la API
// ---------------------------------------------------------------------------

/** Renglón de la caja de un día: una venta, un cambio, una compra de mercadería pagada con la caja o algo cargado a mano. */
export type MovimientoCaja = {
  /** "m-12" cargados a mano, "i-5" ingresos de mercadería, "c-3" pagos de cambios, "v-8" ventas. */
  clave: string;
  id: number;
  /** CAMBIO: diferencia cobrada o devuelta en un cambio (id = venta). VENTA: lo cobrado en una venta (id = venta). */
  origen: 'MANUAL' | 'MERCADERIA' | 'CAMBIO' | 'VENTA';
  tipo: TipoCaja;
  fecha: string;
  concepto: string;
  conceptoId: number | null;
  monto: number;
  medio: MedioPago;
  detalle: string | null;
  vendedor: { id: number; nombre: string } | null;
  /** Cuándo se registró (ISO): ordena la lista del día y da la hora de ventas y cambios. */
  momento: string;
};

export type TotalesCaja = {
  /** Lo cobrado en ventas (sin anuladas). */
  ventas: number;
  /** Ingresos cargados a mano. */
  otrosIngresos: number;
  /** Gastos cargados a mano y compras de mercadería pagadas con la caja. */
  gastos: number;
  /** Neto de cambios y devoluciones: diferencias cobradas (+) menos plata devuelta (−). */
  cambios: number;
  /** ventas + otros ingresos + cambios − gastos. */
  saldo: number;
  /** Lo mismo pero solo lo que fue en efectivo: lo que tendría que haber en la caja. */
  efectivo: number;
};

export type CajaDia = {
  fecha: string;
  ventas: { cantidad: number; porMedio: { medio: MedioPago; total: number }[] };
  movimientos: MovimientoCaja[];
  totales: TotalesCaja;
};

export type CajaMes = {
  mes: string;
  dias: ({ fecha: string } & TotalesCaja)[];
  totales: TotalesCaja;
  ventasPorMedio: { medio: MedioPago; total: number }[];
  gastosPorConcepto: { concepto: string; total: number }[];
};

/** Nombre del concepto automático de las compras pagadas con la caja. */
export const CONCEPTO_MERCADERIA = 'Compra de mercadería';
export const CONCEPTO_CAMBIO_COBRO = 'Diferencia cobrada en un cambio';
export const CONCEPTO_CAMBIO_REINTEGRO = 'Devolución de dinero a un cliente';

/** "2026-11" -> "noviembre 2026" */
export function formatMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const nombre = new Date(Date.UTC(a!, m! - 1, 15)).toLocaleString('es-AR', { month: 'long', timeZone: 'UTC' });
  return `${nombre} ${a}`;
}
