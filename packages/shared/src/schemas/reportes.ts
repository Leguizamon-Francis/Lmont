import { z } from 'zod';

/**
 * Reportes.
 *
 * Todo se cuenta por la fecha en que pasó: una venta el día que se hizo y un cambio o una
 * devolución el día que el cliente vino (aunque la venta original sea de otro mes).
 * Las ventas anuladas no cuentan.
 *
 * Ganancia = ingresos por ventas − costo de lo vendido − gastos del negocio.
 * La compra de mercadería no es un gasto acá: su costo se cuenta cuando la prenda se vende.
 * Los recargos de la tarjeta de crédito no son ganancia (es el costo de la tarjeta): no suman.
 * Los descuentos por medio de pago (efectivo, transferencia) sí restan.
 */

/** Ventanas para el reporte de productos (últimos N días). */
export const DIAS_REPORTE = [30, 60, 90, 180, 365] as const;
export const diasReporteSchema = z.coerce
  .number()
  .refine((n) => (DIAS_REPORTE as readonly number[]).includes(n), 'Período inválido')
  .default(60);

export type ResultadoPeriodo = {
  /** Ventas hechas (sin anuladas). */
  cantidadVentas: number;
  /** Prendas vendidas, menos las devueltas, más las que se llevaron en cambios. */
  unidades: number;
  /** Lo que se cobró por las prendas, con el descuento de las promociones y descontando devoluciones. */
  ventasProductos: number;
  /** Descuentos de los medios de pago (negativo o 0): sí restan. */
  descuentosMedios: number;
  /**
   * Recargos cobrados (tarjeta de crédito en cuotas). NO suman a la ganancia: son lo que cobra la tarjeta,
   * no plata del negocio. Se informan aparte.
   */
  recargos: number;
  /** ventasProductos + descuentosMedios: lo que entró por ventas, cambios y devoluciones, sin los recargos. */
  ingresos: number;
  /** Lo que costaron esas prendas (precio de compra del momento de la venta). */
  costo: number;
  /** ingresos − costo. */
  gananciaBruta: number;
  /** Gastos de caja que cuentan para la ganancia. */
  gastos: number;
  /** gananciaBruta − gastos. */
  ganancia: number;
};

export type ReporteDia = {
  fecha: string;
  cantidadVentas: number;
  unidades: number;
  ingresos: number;
  gananciaBruta: number;
};

export type PromocionVendida = {
  promocionId: number;
  nombre: string;
  /** Veces que se aplicó. */
  veces: number;
  /** Lo que se cobró por las prendas de la promo. */
  precio: number;
  /** Lo que se descontó en total. */
  descuento: number;
};

export type ReporteMes = {
  mes: string;
  resultado: ResultadoPeriodo;
  dias: ReporteDia[];
  gastosPorConcepto: { concepto: string; total: number }[];
  /** Gastos de caja que no restan en la ganancia (retiros, por ejemplo). */
  gastosNoCuentan: number;
  promociones: PromocionVendida[];
};

export type ReporteMeses = { meses: ({ mes: string } & ResultadoPeriodo)[] };

export type ProductoVendido = {
  productoId: number;
  producto: string;
  tipo: string;
  unidades: number;
  importe: number;
  ganancia: number;
  /** Stock actual (variantes activas). */
  stock: number;
  /** Las combinaciones color/talle que más salieron. */
  variantes: { color: string; talle: string; unidades: number; stock: number }[];
};

export type ProductoSinVentas = {
  productoId: number;
  producto: string;
  tipo: string;
  stock: number;
  /** Stock × precio de compra actual: la plata que está parada. */
  valorStock: number;
  /** Última vez que se vendió (cualquier fecha), o null si nunca. */
  ultimaVenta: string | null;
};

export type ReporteProductos = {
  dias: number;
  /** Primer día del período ("AAAA-MM-DD"). */
  desde: string;
  masVendidos: ProductoVendido[];
  sinVentas: ProductoSinVentas[];
};
