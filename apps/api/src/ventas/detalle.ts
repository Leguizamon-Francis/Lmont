import type { CambioDetalle, CambioResumen, VentaDetalle, VentaPago, VentaResumen } from '@lmont/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { num, selectEncontrada, varianteEncontrada } from '../catalogo/serializar.js';
import { noEncontrado } from '../http/errors.js';

type Db = Prisma.TransactionClient;

const PERSONA = { select: { id: true, nombre: true } } as const;
const NOMBRE_PRODUCTO = { select: { producto: { select: { nombre: true, tipo: { select: { nombre: true } } } } } } as const;

/** "Remera Básica, Pantalón Chino y 2 más" */
function describir(nombres: string[], max = 3) {
  const unicos = [...new Set(nombres)];
  return unicos.length > max ? `${unicos.slice(0, max).join(', ')} y ${unicos.length - max} más` : unicos.join(', ');
}
const nombreProducto = (v: { producto: { nombre: string; tipo: { nombre: string } } }) => `${v.producto.tipo.nombre} ${v.producto.nombre}`;

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export const selectResumenVenta = {
  id: true,
  creadoEn: true,
  subtotal: true,
  total: true,
  anulada: true,
  vendedor: PERSONA,
  cliente: PERSONA,
  pagos: { select: { medio: true, cuotas: true, cobrado: true }, orderBy: { id: 'asc' } },
  items: { select: { cantidad: true, variante: NOMBRE_PRODUCTO }, orderBy: { id: 'asc' } },
  _count: { select: { cambios: true } },
} satisfies Prisma.VentaSelect;

export function resumenVenta(v: Prisma.VentaGetPayload<{ select: typeof selectResumenVenta }>): VentaResumen {
  return {
    id: v.id,
    creadoEn: v.creadoEn.toISOString(),
    vendedor: v.vendedor,
    cliente: v.cliente,
    unidades: v.items.reduce((s, it) => s + it.cantidad, 0),
    descripcion: describir(v.items.map((it) => nombreProducto(it.variante))),
    subtotal: num(v.subtotal),
    total: num(v.total),
    pagos: v.pagos.map((p) => ({ medio: p.medio, cuotas: p.cuotas, cobrado: num(p.cobrado) })),
    anulada: v.anulada,
    conCambios: v._count.cambios > 0,
  };
}

const pago = (p: { id: number; medio: VentaPago['medio']; cuotas: number; monto: Prisma.Decimal; porcentaje: Prisma.Decimal; ajuste: Prisma.Decimal; cobrado: Prisma.Decimal }): VentaPago => ({
  id: p.id,
  medio: p.medio,
  cuotas: p.cuotas,
  monto: num(p.monto),
  porcentaje: num(p.porcentaje),
  ajuste: num(p.ajuste),
  cobrado: num(p.cobrado),
});

export async function buscarVenta(db: Db, id: number): Promise<VentaDetalle> {
  const v = await db.venta.findUnique({
    where: { id },
    select: {
      ...selectResumenVenta,
      nota: true,
      anuladaEn: true,
      motivoAnulacion: true,
      pagos: { orderBy: { id: 'asc' } },
      items: {
        select: {
          id: true,
          cantidad: true,
          precioLista: true,
          precioUnitario: true,
          variante: { select: selectEncontrada },
          devoluciones: { select: { cantidad: true } },
        },
        orderBy: { id: 'asc' },
      },
      cambios: { select: selectCambio, orderBy: { id: 'asc' } },
    },
  });
  if (!v) throw noEncontrado('la venta');
  const base = resumenVenta({
    ...v,
    items: v.items.map((it) => ({ cantidad: it.cantidad, variante: { producto: it.variante.producto } })),
  });
  return {
    ...base,
    nota: v.nota,
    anuladaEn: v.anuladaEn?.toISOString() ?? null,
    motivoAnulacion: v.motivoAnulacion,
    items: v.items.map((it) => ({
      id: it.id,
      cantidad: it.cantidad,
      precioLista: num(it.precioLista),
      precioUnitario: num(it.precioUnitario),
      variante: varianteEncontrada(it.variante),
      devueltas: it.devoluciones.reduce((s, d) => s + d.cantidad, 0),
    })),
    pagos: v.pagos.map(pago),
    cambios: v.cambios.map(cambioDetalle),
  };
}

// ---------------------------------------------------------------------------
// Cambios
// ---------------------------------------------------------------------------

export const selectCambio = {
  id: true,
  ventaId: true,
  creadoEn: true,
  nota: true,
  totalDevuelto: true,
  totalLlevado: true,
  diferencia: true,
  vendedor: PERSONA,
  devueltos: {
    select: { id: true, ventaItemId: true, cantidad: true, precioUnitario: true, ventaItem: { select: { variante: { select: selectEncontrada } } } },
    orderBy: { id: 'asc' },
  },
  llevados: {
    select: { id: true, cantidad: true, precioLista: true, precioUnitario: true, variante: { select: selectEncontrada } },
    orderBy: { id: 'asc' },
  },
  pagos: { orderBy: { id: 'asc' } },
} satisfies Prisma.CambioSelect;

export function cambioDetalle(c: Prisma.CambioGetPayload<{ select: typeof selectCambio }>): CambioDetalle {
  return {
    id: c.id,
    ventaId: c.ventaId,
    creadoEn: c.creadoEn.toISOString(),
    vendedor: c.vendedor,
    nota: c.nota,
    totalDevuelto: num(c.totalDevuelto),
    totalLlevado: num(c.totalLlevado),
    diferencia: num(c.diferencia),
    devueltos: c.devueltos.map((d) => ({
      id: d.id,
      ventaItemId: d.ventaItemId,
      cantidad: d.cantidad,
      precioUnitario: num(d.precioUnitario),
      variante: varianteEncontrada(d.ventaItem.variante),
    })),
    llevados: c.llevados.map((l) => ({
      id: l.id,
      cantidad: l.cantidad,
      precioLista: num(l.precioLista),
      precioUnitario: num(l.precioUnitario),
      variante: varianteEncontrada(l.variante),
    })),
    pagos: c.pagos.map(pago),
  };
}

const VARIANTE_CORTA = { select: { color: { select: { nombre: true } }, talle: { select: { nombre: true } }, ...NOMBRE_PRODUCTO.select } } as const;

export const selectResumenCambio = {
  id: true,
  ventaId: true,
  creadoEn: true,
  diferencia: true,
  vendedor: PERSONA,
  venta: { select: { cliente: PERSONA } },
  devueltos: { select: { cantidad: true, ventaItem: { select: { variante: VARIANTE_CORTA } } }, orderBy: { id: 'asc' } },
  llevados: { select: { cantidad: true, variante: VARIANTE_CORTA }, orderBy: { id: 'asc' } },
  pagos: { select: { medio: true, cobrado: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.CambioSelect;

export function resumenCambio(c: Prisma.CambioGetPayload<{ select: typeof selectResumenCambio }>): CambioResumen {
  type V = Prisma.VarianteGetPayload<typeof VARIANTE_CORTA>;
  const prenda = (v: V, cantidad: number) => `${cantidad > 1 ? `${cantidad} × ` : ''}${nombreProducto(v)} ${v.color.nombre} ${v.talle.nombre}`;
  const vuelve = describir(c.devueltos.map((d) => prenda(d.ventaItem.variante, d.cantidad)), 2);
  const lleva = describir(c.llevados.map((l) => prenda(l.variante, l.cantidad)), 2);
  return {
    id: c.id,
    ventaId: c.ventaId,
    creadoEn: c.creadoEn.toISOString(),
    vendedor: c.vendedor,
    cliente: c.venta.cliente,
    devolucion: c.llevados.length === 0,
    descripcion: lleva ? `Vuelve: ${vuelve} · Se lleva: ${lleva}` : `Vuelve: ${vuelve}`,
    diferencia: num(c.diferencia),
    pagos: c.pagos.map((p) => ({ medio: p.medio, cobrado: num(p.cobrado) })),
  };
}
