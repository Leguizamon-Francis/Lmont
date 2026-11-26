import { Router } from 'express';
import { z } from 'zod';
import {
  CONCEPTO_CAMBIO_COBRO,
  CONCEPTO_CAMBIO_REINTEGRO,
  CONCEPTO_MERCADERIA,
  conceptoCajaSchema,
  hoy,
  idSchema,
  mesSchema,
  movimientoCajaSchema,
  rangoDelDia,
  redondear,
  type CajaDia,
  type CajaMes,
  type ConceptoCaja,
  type MedioPago,
  type MovimientoCaja,
  type TotalesCaja,
} from '@lmont/shared';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';
import type { Prisma } from '../generated/prisma/client.js';

export const cajaRouter = Router();

const fechaIso = (d: Date) => d.toISOString().slice(0, 10);
/** Columna DATE: se guarda a medianoche UTC para que no cambie de día por la zona horaria. */
const aDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const ORDEN_MEDIOS: MedioPago[] = ['EFECTIVO', 'DEBITO', 'CREDITO', 'TRANSFERENCIA'];

// ---------------------------------------------------------------------------
// Lectura: junta ventas, compras de mercadería pagadas con la caja y movimientos manuales
// ---------------------------------------------------------------------------

type Pago = { fecha: string; medio: MedioPago; cobrado: number };

/** Todo lo que pasó por la caja entre dos fechas (desde inclusive, hasta exclusive). */
async function leerCaja(desde: string, hasta: string) {
  const [ventas, compras, manuales, cambios] = await Promise.all([
    prisma.venta.findMany({
      where: { anulada: false, creadoEn: { gte: rangoDelDia(desde).desde, lt: rangoDelDia(hasta).desde } },
      select: { creadoEn: true, pagos: { select: { medio: true, cobrado: true } } },
    }),
    prisma.ingreso.findMany({
      where: { pagadoConCaja: true, fecha: { gte: aDate(desde), lt: aDate(hasta) } },
      select: { id: true, fecha: true, total: true, nota: true, proveedor: { select: { nombre: true } } },
      orderBy: { id: 'asc' },
    }),
    prisma.movimientoCaja.findMany({
      where: { fecha: { gte: aDate(desde), lt: aDate(hasta) } },
      select: {
        id: true,
        fecha: true,
        tipo: true,
        monto: true,
        medio: true,
        detalle: true,
        concepto: { select: { id: true, nombre: true } },
        vendedor: { select: { id: true, nombre: true } },
      },
      orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
    }),
    // Diferencias cobradas o devueltas en cambios y devoluciones.
    prisma.cambioPago.findMany({
      where: { cambio: { creadoEn: { gte: rangoDelDia(desde).desde, lt: rangoDelDia(hasta).desde } } },
      select: {
        id: true,
        medio: true,
        cobrado: true,
        cambio: { select: { ventaId: true, creadoEn: true, vendedor: { select: { id: true, nombre: true } }, venta: { select: { cliente: { select: { nombre: true } } } } } },
      },
      orderBy: { id: 'asc' },
    }),
  ]);

  const pagos: Pago[] = ventas.flatMap((v) => v.pagos.map((p) => ({ fecha: hoy(v.creadoEn), medio: p.medio, cobrado: num(p.cobrado) })));
  const cantidadVentas = new Map<string, number>();
  for (const v of ventas) cantidadVentas.set(hoy(v.creadoEn), (cantidadVentas.get(hoy(v.creadoEn)) ?? 0) + 1);

  const movimientos: MovimientoCaja[] = [
    ...manuales.map(
      (m): MovimientoCaja => ({
        clave: `m-${m.id}`,
        id: m.id,
        origen: 'MANUAL',
        tipo: m.tipo,
        fecha: fechaIso(m.fecha),
        concepto: m.concepto.nombre,
        conceptoId: m.concepto.id,
        monto: num(m.monto),
        medio: m.medio,
        detalle: m.detalle,
        vendedor: m.vendedor,
      }),
    ),
    ...compras.map(
      (c): MovimientoCaja => ({
        clave: `i-${c.id}`,
        id: c.id,
        origen: 'MERCADERIA',
        tipo: 'GASTO',
        fecha: fechaIso(c.fecha),
        concepto: CONCEPTO_MERCADERIA,
        conceptoId: null,
        monto: num(c.total),
        medio: 'EFECTIVO',
        detalle: [c.proveedor?.nombre, c.nota].filter(Boolean).join(' · ') || null,
        vendedor: null,
      }),
    ),
    ...cambios.map((p): MovimientoCaja => {
      const cobrado = num(p.cobrado);
      return {
        clave: `c-${p.id}`,
        id: p.cambio.ventaId,
        origen: 'CAMBIO',
        tipo: cobrado > 0 ? 'INGRESO' : 'GASTO',
        fecha: hoy(p.cambio.creadoEn),
        concepto: cobrado > 0 ? CONCEPTO_CAMBIO_COBRO : CONCEPTO_CAMBIO_REINTEGRO,
        conceptoId: null,
        monto: Math.abs(cobrado),
        medio: p.medio,
        detalle: [`Venta N° ${p.cambio.ventaId}`, p.cambio.venta.cliente?.nombre].filter(Boolean).join(' · '),
        vendedor: p.cambio.vendedor,
      };
    }),
  ];
  return { pagos, cantidadVentas, movimientos };
}

function totales(pagos: Pago[], movimientos: MovimientoCaja[]): TotalesCaja {
  const suma = (xs: number[]) => redondear(xs.reduce((s, x) => s + x, 0));
  const ventas = suma(pagos.map((p) => p.cobrado));
  const otrosIngresos = suma(movimientos.filter((m) => m.tipo === 'INGRESO').map((m) => m.monto));
  const gastos = suma(movimientos.filter((m) => m.tipo === 'GASTO').map((m) => m.monto));
  const efectivo = suma([
    ...pagos.filter((p) => p.medio === 'EFECTIVO').map((p) => p.cobrado),
    ...movimientos.filter((m) => m.medio === 'EFECTIVO').map((m) => (m.tipo === 'INGRESO' ? m.monto : -m.monto)),
  ]);
  return { ventas, otrosIngresos, gastos, saldo: redondear(ventas + otrosIngresos - gastos), efectivo };
}

function porMedio(pagos: Pago[]) {
  const m = new Map<MedioPago, number>();
  for (const p of pagos) m.set(p.medio, redondear((m.get(p.medio) ?? 0) + p.cobrado));
  return ORDEN_MEDIOS.filter((x) => m.has(x)).map((medio) => ({ medio, total: m.get(medio)! }));
}

function siguienteDia(iso: string) {
  const d = aDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return fechaIso(d);
}

const fechaSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional()
    .transform((v) => v ?? hoy()),
});

/** Caja de un día: ventas por medio de pago, ingresos y gastos, y totales. */
cajaRouter.get(
  '/dia',
  handler(async (req, res) => {
    const { fecha } = validar(fechaSchema, req.query);
    const { pagos, cantidadVentas, movimientos } = await leerCaja(fecha, siguienteDia(fecha));
    const body: CajaDia = {
      fecha,
      ventas: { cantidad: cantidadVentas.get(fecha) ?? 0, porMedio: porMedio(pagos) },
      movimientos,
      totales: totales(pagos, movimientos),
    };
    res.json(body);
  }),
);

/** Caja de un mes: totales de cada día, del mes, gastos por concepto y ventas por medio. */
cajaRouter.get(
  '/mes',
  handler(async (req, res) => {
    const { mes } = validar(z.object({ mes: mesSchema.optional().transform((v) => v ?? hoy().slice(0, 7)) }), req.query);
    const [a, m] = mes.split('-').map(Number) as [number, number];
    const desde = `${mes}-01`;
    const hasta = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
    const { pagos, movimientos } = await leerCaja(desde, hasta);

    const dias: CajaMes['dias'] = [];
    for (let f = desde; f < hasta && f <= hoy(); f = siguienteDia(f)) {
      const t = totales(
        pagos.filter((p) => p.fecha === f),
        movimientos.filter((x) => x.fecha === f),
      );
      if (t.ventas || t.otrosIngresos || t.gastos) dias.push({ fecha: f, ...t });
    }

    const gastos = new Map<string, number>();
    for (const x of movimientos) if (x.tipo === 'GASTO') gastos.set(x.concepto, redondear((gastos.get(x.concepto) ?? 0) + x.monto));

    const body: CajaMes = {
      mes,
      dias,
      totales: totales(pagos, movimientos),
      ventasPorMedio: porMedio(pagos),
      gastosPorConcepto: [...gastos].map(([concepto, total]) => ({ concepto, total })).sort((x, y) => y.total - x.total),
    };
    res.json(body);
  }),
);

// ---------------------------------------------------------------------------
// Movimientos manuales
// ---------------------------------------------------------------------------

async function validarRelaciones(d: { tipo: 'INGRESO' | 'GASTO'; conceptoId: number; vendedorId?: number | null }, conceptoActual?: number) {
  const concepto = await prisma.conceptoCaja.findUnique({ where: { id: d.conceptoId } });
  // Un concepto desactivado se puede mantener en un movimiento que ya lo tenía, pero no elegirlo de nuevo.
  if (!concepto || (!concepto.activo && concepto.id !== conceptoActual)) {
    throw new HttpError(400, 'Elegí un concepto de la lista', { conceptoId: 'Elegí un concepto de la lista' });
  }
  if (concepto.tipo !== d.tipo) {
    const msg = d.tipo === 'GASTO' ? 'Ese concepto es de ingresos: elegí un concepto de gastos' : 'Ese concepto es de gastos: elegí un concepto de ingresos';
    throw new HttpError(400, msg, { conceptoId: msg });
  }
  if (d.vendedorId) {
    const v = await prisma.vendedor.findUnique({ where: { id: d.vendedorId } });
    if (!v || !v.activo) throw new HttpError(400, 'Elegí un vendedor de la lista', { vendedorId: 'Elegí un vendedor de la lista' });
  }
}

const datosMovimiento = (d: z.output<typeof movimientoCajaSchema>): Prisma.MovimientoCajaUncheckedCreateInput => ({
  tipo: d.tipo,
  conceptoId: d.conceptoId,
  monto: d.monto,
  medio: d.medio,
  fecha: aDate(d.fecha),
  detalle: d.detalle,
  vendedorId: d.vendedorId ?? null,
});

cajaRouter.post(
  '/movimientos',
  handler(async (req, res) => {
    const d = validar(movimientoCajaSchema, req.body);
    await validarRelaciones(d);
    const m = await prisma.movimientoCaja.create({ data: datosMovimiento(d), select: { id: true } });
    res.status(201).json(m);
  }),
);

cajaRouter.put(
  '/movimientos/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const d = validar(movimientoCajaSchema, req.body);
    const actual = await prisma.movimientoCaja.findUnique({ where: { id } });
    if (!actual) throw noEncontrado('el movimiento');
    await validarRelaciones(d, actual.conceptoId);
    res.json(await prisma.movimientoCaja.update({ where: { id }, data: datosMovimiento(d), select: { id: true } }));
  }),
);

cajaRouter.delete(
  '/movimientos/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const r = await prisma.movimientoCaja.deleteMany({ where: { id } });
    if (!r.count) throw noEncontrado('el movimiento');
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Conceptos
// ---------------------------------------------------------------------------

const selectConcepto = { id: true, nombre: true, tipo: true, activo: true, cuentaEnGanancia: true } as const;

cajaRouter.get(
  '/conceptos',
  handler(async (req, res) => {
    const soloActivos = req.query.activos === '1';
    const filas: ConceptoCaja[] = await prisma.conceptoCaja.findMany({
      where: soloActivos ? { activo: true } : undefined,
      orderBy: [{ tipo: 'desc' }, { activo: 'desc' }, { nombre: 'asc' }],
      select: selectConcepto,
    });
    res.json(filas);
  }),
);

cajaRouter.post(
  '/conceptos',
  handler(async (req, res) => {
    const d = validar(conceptoCajaSchema, req.body);
    res.status(201).json(await prisma.conceptoCaja.create({ data: d, select: selectConcepto }));
  }),
);

cajaRouter.put(
  '/conceptos/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const d = validar(conceptoCajaSchema, req.body);
    const actual = await prisma.conceptoCaja.findUnique({ where: { id }, select: { tipo: true, _count: { select: { movimientos: true } } } });
    if (!actual) throw noEncontrado('el concepto');
    if (actual.tipo !== d.tipo && actual._count.movimientos > 0) {
      throw new HttpError(400, 'Este concepto ya se usó: no se puede pasar de ingreso a gasto (o al revés). Creá uno nuevo.', {
        tipo: 'Ya se usó en movimientos',
      });
    }
    res.json(await prisma.conceptoCaja.update({ where: { id }, data: d, select: selectConcepto }));
  }),
);
