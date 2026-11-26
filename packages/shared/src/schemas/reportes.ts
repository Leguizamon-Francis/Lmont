import { z } from 'zod';
import { esFechaValida, hoy } from '../fechas.js';
import type { MedioPago } from './ventas.js';
import type { MotivoCambio } from './cambios.js';

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

// ---------------------------------------------------------------------------
// Período (desde / hasta, inclusive)
// ---------------------------------------------------------------------------

const fechaSchema = z
  .string()
  .refine(esFechaValida, 'Fecha inválida');

/** Máximo de días de un período (unos 3 años). */
export const MAX_DIAS_PERIODO = 1100;

/** `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`. Sin fechas: desde el 1 del mes hasta hoy. */
export const periodoSchema = z
  .object({
    desde: fechaSchema.optional(),
    hasta: fechaSchema.optional(),
  })
  .transform((p) => ({ desde: p.desde ?? `${hoy().slice(0, 7)}-01`, hasta: p.hasta ?? hoy() }))
  .refine((p) => p.desde <= p.hasta, 'La fecha "desde" tiene que ser anterior a "hasta"')
  .refine(
    (p) => (Date.parse(p.hasta) - Date.parse(p.desde)) / 86_400_000 < MAX_DIAS_PERIODO,
    'El período puede ser de hasta 3 años',
  );
export type Periodo = { desde: string; hasta: string };

/** Clientes que no compran hace al menos N días. */
export const DIAS_INACTIVO = [60, 90, 180, 365] as const;
export const diasInactivoSchema = z.coerce
  .number()
  .refine((n) => (DIAS_INACTIVO as readonly number[]).includes(n), 'Período inválido')
  .default(90);

// ---------------------------------------------------------------------------
// Resumen: ganancia del período comparada
// ---------------------------------------------------------------------------

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
  /** Promedio de lo que se cobró por venta (prendas, sin recargos), solo ventas: sin cambios. */
  ticketPromedio: number;
  /** Prendas promedio por venta. */
  prendasPorVenta: number;
};

/** Un punto de la serie: un día ("AAAA-MM-DD") o un mes ("AAAA-MM") si el período es largo. */
export type PuntoSerie = {
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

export type PeriodoComparado = Periodo & { resultado: ResultadoPeriodo };

export type ReporteResumen = Periodo & {
  resultado: ResultadoPeriodo;
  /** El mismo largo de días, justo antes. */
  anterior: PeriodoComparado;
  /** Las mismas fechas, un año antes. */
  anioAnterior: PeriodoComparado;
  agrupacion: 'dia' | 'mes';
  serie: PuntoSerie[];
  gastosPorConcepto: { concepto: string; total: number }[];
  /** Gastos de caja que no restan en la ganancia (retiros, por ejemplo). */
  gastosNoCuentan: number;
  promociones: PromocionVendida[];
};

export type ReporteMeses = { meses: ({ mes: string } & ResultadoPeriodo)[] };

// ---------------------------------------------------------------------------
// Ventas: vendedores, medios de pago, días y horarios, ticket
// ---------------------------------------------------------------------------

export type VentasVendedor = {
  vendedorId: number | null;
  nombre: string;
  ventas: number;
  unidades: number;
  /** Lo cobrado por las prendas (con promos, sin recargos). */
  importe: number;
  ticketPromedio: number;
  /** importe − costo − lo devuelto de sus ventas (con su costo). */
  ganancia: number;
  /** Prendas de sus ventas que se devolvieron o cambiaron en el período. */
  devueltas: number;
  /** Lo mismo del período anterior, para comparar. */
  importeAnterior: number;
};

export type VentasMedio = {
  medio: MedioPago;
  cuotas: number;
  /** Cantidad de pagos con ese medio y cuotas. */
  pagos: number;
  /** Lo cobrado (con recargos o descuentos). */
  cobrado: number;
  /** Recargo (+) o descuento (−) del medio. */
  ajuste: number;
};

/** Una celda del mapa de calor: día de la semana (0 = lunes) y hora del local. */
export type CeldaCalor = { dia: number; hora: number; ventas: number; importe: number };

export type ReporteVentas = Periodo & {
  porVendedor: VentasVendedor[];
  porMedio: VentasMedio[];
  calor: CeldaCalor[];
  ticket: {
    ventas: number;
    promedio: number;
    prendasPorVenta: number;
    anterior: { ventas: number; promedio: number; prendasPorVenta: number };
    /** Cuántas ventas llevaron 1, 2, 3 o 4 o más prendas. */
    distribucion: { prendas: string; ventas: number }[];
  };
};

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const;

// ---------------------------------------------------------------------------
// Mercadería: qué se vende, qué reponer, proveedores, stock y pérdidas
// ---------------------------------------------------------------------------

export type MercaderiaTipo = {
  tipo: string;
  unidades: number;
  importe: number;
  costo: number;
  ganancia: number;
  /** ganancia / importe × 100. */
  margen: number;
  stock: number;
};

/** Unidades vendidas y stock por talle (o color) de un tipo de prenda. */
export type DistribucionTipo = {
  tipo: string;
  unidades: number;
  filas: { nombre: string; unidades: number; stock: number }[];
};

export type ProductoVendido = {
  productoId: number;
  producto: string;
  tipo: string;
  unidades: number;
  importe: number;
  ganancia: number;
  margen: number;
  /** Stock actual (variantes activas). */
  stock: number;
  /** Prendas por día en el período. */
  porDia: number;
  /** Días que dura el stock a este ritmo (null si no se vendió). */
  cobertura: number | null;
  /** Las combinaciones color/talle que más salieron. */
  variantes: { color: string; talle: string; unidades: number; stock: number }[];
};

export type Reponer = {
  varianteId: number;
  productoId: number;
  producto: string;
  tipo: string;
  color: string;
  talle: string;
  vendidas: number;
  stock: number;
  cobertura: number;
  /** Cuántas pedir para cubrir los próximos DIAS_REPOSICION días. */
  sugerido: number;
};
export const DIAS_REPOSICION = 30;

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

export type MercaderiaProveedor = {
  proveedorId: number | null;
  proveedor: string;
  /** Lo que se le compró en el período. */
  comprado: number;
  unidadesCompradas: number;
  /** Ventas del período de productos que se le compraron (por el último proveedor de cada producto). */
  vendidas: number;
  importe: number;
  ganancia: number;
  margen: number;
};

export type Perdida = {
  fecha: string;
  productoId: number;
  producto: string;
  color: string;
  talle: string;
  /** Negativo = faltan prendas; positivo = aparecieron. */
  cantidad: number;
  motivo: string;
  /** cantidad × precio de compra actual (negativo = plata perdida). */
  valor: number;
};

export type ReporteMercaderia = Periodo & {
  dias: number;
  porTipo: MercaderiaTipo[];
  talles: DistribucionTipo[];
  colores: DistribucionTipo[];
  productos: ProductoVendido[];
  reponer: Reponer[];
  sinVentas: ProductoSinVentas[];
  porProveedor: MercaderiaProveedor[];
  /** Stock de hoy (no depende del período). */
  stock: { unidades: number; costo: number; venta: number; porTipo: { tipo: string; unidades: number; costo: number; venta: number }[] };
  perdidas: { unidades: number; valor: number; porMotivo: { motivo: string; unidades: number; valor: number }[]; detalle: Perdida[] };
};

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export type ClienteReporte = {
  clienteId: number;
  nombre: string;
  whatsapp: string | null;
  compras: number;
  prendas: number;
  importe: number;
  ticketPromedio: number;
  /** Fecha de la última compra. */
  ultima: string;
};

export type ClienteInactivo = {
  clienteId: number;
  nombre: string;
  whatsapp: string | null;
  /** Compras de toda la historia. */
  compras: number;
  importe: number;
  ultima: string;
  /** Días desde la última compra. */
  dias: number;
};

export type ReporteClientes = Periodo & {
  resumen: { ventas: number; conCliente: number; clientesDistintos: number; nuevos: number };
  mejores: ClienteReporte[];
  inactivos: { dias: number; clientes: ClienteInactivo[] };
  /** 12 meses que terminan en el mes de "hasta". */
  meses: { mes: string; nuevos: number; recurrentes: number; sinCliente: number }[];
};

// ---------------------------------------------------------------------------
// Cambios y devoluciones
// ---------------------------------------------------------------------------

export type CambiosTasa = { nombre: string; vendidas: number; devueltas: number; /** devueltas / vendidas × 100 */ tasa: number };

export type ReporteCambios = Periodo & {
  cambios: number;
  devoluciones: number;
  unidadesDevueltas: number;
  /** Plata devuelta a clientes. */
  devuelto: number;
  unidadesVendidas: number;
  tasa: number;
  porMotivo: { motivo: MotivoCambio | null; cantidad: number }[];
  porProducto: (CambiosTasa & { productoId: number; tipo: string })[];
  porTalle: CambiosTasa[];
  /** Cambios del mismo producto a otro talle: "de M a L". */
  cambiosDeTalle: { productoId: number; producto: string; de: string; a: string; veces: number }[];
};
