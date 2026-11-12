import type { ProductoDetalle, ProductoResumen, Variante, VarianteEncontrada } from '@lmont/shared';
import type { Prisma } from '../generated/prisma/client.js';

/** Convierte un Decimal de Prisma a number (los montos tienen 2 decimales). */
export const num = (d: Prisma.Decimal) => d.toNumber();

const ITEM = { select: { id: true, nombre: true, activo: true } } as const;

export const selectVariante = {
  id: true,
  codigoBarras: true,
  stock: true,
  stockMinimo: true,
  activo: true,
  color: ITEM,
  talle: { select: { id: true, nombre: true, activo: true, orden: true } },
} satisfies Prisma.VarianteSelect;

/** Orden de variantes: por color y, dentro de cada color, por el orden de los talles. */
export const ordenVariantes = [
  { color: { nombre: 'asc' } },
  { talle: { orden: 'asc' } },
  { talle: { nombre: 'asc' } },
] satisfies Prisma.VarianteOrderByWithRelationInput[];

type VarianteDb = Prisma.VarianteGetPayload<{ select: typeof selectVariante }>;

export const variante = (v: VarianteDb): Variante => v;

/** Stock bajo: variante activa con mínimo configurado y stock en o por debajo de ese mínimo. */
export const tieneStockBajo = (v: { stock: number; stockMinimo: number; activo: boolean }) =>
  v.activo && v.stockMinimo > 0 && v.stock <= v.stockMinimo;

export const selectResumen = {
  id: true,
  nombre: true,
  precioCompra: true,
  precioVenta: true,
  activo: true,
  tipo: ITEM,
  variantes: { select: { stock: true, stockMinimo: true, activo: true } },
} satisfies Prisma.ProductoSelect;

export function productoResumen(p: Prisma.ProductoGetPayload<{ select: typeof selectResumen }>): ProductoResumen {
  const activas = p.variantes.filter((v) => v.activo);
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    precioCompra: num(p.precioCompra),
    precioVenta: num(p.precioVenta),
    activo: p.activo,
    cantidadVariantes: activas.length,
    stockTotal: activas.reduce((s, v) => s + v.stock, 0),
    variantesStockBajo: activas.filter(tieneStockBajo).length,
  };
}

export const selectDetalle = {
  id: true,
  nombre: true,
  tipoId: true,
  precioCompra: true,
  precioVenta: true,
  observaciones: true,
  activo: true,
  tipo: ITEM,
  variantes: { select: selectVariante, orderBy: ordenVariantes },
} satisfies Prisma.ProductoSelect;

export function productoDetalle(p: Prisma.ProductoGetPayload<{ select: typeof selectDetalle }>): ProductoDetalle {
  return {
    ...p,
    precioCompra: num(p.precioCompra),
    precioVenta: num(p.precioVenta),
    variantes: p.variantes.map(variante),
  };
}

export const selectEncontrada = {
  ...selectVariante,
  producto: { select: { id: true, nombre: true, precioVenta: true, activo: true, tipo: ITEM } },
} satisfies Prisma.VarianteSelect;

export function varianteEncontrada(v: Prisma.VarianteGetPayload<{ select: typeof selectEncontrada }>): VarianteEncontrada {
  return { ...v, producto: { ...v.producto, precioVenta: num(v.producto.precioVenta) } };
}
