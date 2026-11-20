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
});
export type ConceptoCajaInput = z.input<typeof conceptoCajaSchema>;
export type ConceptoCaja = { id: number; nombre: string; tipo: TipoCaja; activo: boolean };

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

/** Renglón de la caja de un día: cargado a mano o automático (compra de mercadería pagada con la caja). */
export type MovimientoCaja = {
  /** "m-12" para los cargados a mano, "i-5" para ingresos de mercadería. */
  clave: string;
  id: number;
  origen: 'MANUAL' | 'MERCADERIA';
  tipo: TipoCaja;
  fecha: string;
  concepto: string;
  conceptoId: number | null;
  monto: number;
  medio: MedioPago;
  detalle: string | null;
  vendedor: { id: number; nombre: string } | null;
};

export type TotalesCaja = {
  /** Lo cobrado en ventas (sin anuladas). */
  ventas: number;
  /** Ingresos cargados a mano. */
  otrosIngresos: number;
  gastos: number;
  /** ventas + otros ingresos − gastos. */
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

/** "2026-11" -> "noviembre 2026" */
export function formatMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const nombre = new Date(Date.UTC(a!, m! - 1, 15)).toLocaleString('es-AR', { month: 'long', timeZone: 'UTC' });
  return `${nombre} ${a}`;
}
