import { aplicarPorcentaje, MEDIOS_PAGO, nombrePlan, type MedioPago } from '@lmont/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';
import { num } from '../catalogo/serializar.js';
import { bloquearVariante } from '../catalogo/stock.js';

type Tx = Prisma.TransactionClient;

const selectVendible = {
  id: true,
  activo: true,
  color: { select: { nombre: true } },
  talle: { select: { nombre: true } },
  producto: { select: { id: true, tipoId: true, nombre: true, activo: true, precioCompra: true, precioVenta: true, tipo: { select: { nombre: true } } } },
} satisfies Prisma.VarianteSelect;
export type Vendible = Prisma.VarianteGetPayload<{ select: typeof selectVendible }>;

export const nombreVariante = (v: Pick<Vendible, 'color' | 'talle'> & { producto: { nombre: string; tipo: { nombre: string } } }) =>
  `${v.producto.tipo.nombre} ${v.producto.nombre} ${v.color.nombre} ${v.talle.nombre}`;

/** Trae las prendas que van a salir del local y revisa que existan y estén activas. */
export async function prendasVendibles(tx: Tx, ids: number[]) {
  const variantes = await tx.variante.findMany({ where: { id: { in: ids } }, select: selectVendible });
  if (variantes.length !== new Set(ids).size) {
    throw new HttpError(400, 'Alguna de las prendas ya no existe. Recargá la página y probá de nuevo.');
  }
  const inactivas = variantes.filter((v) => !v.activo || !v.producto.activo);
  if (inactivas.length) {
    throw new HttpError(400, `${inactivas.map(nombreVariante).join(', ')} está desactivado y no se puede vender`);
  }
  return new Map(variantes.map((v) => [v.id, v]));
}

/**
 * Bloquea las filas en orden de id (evita bloqueos cruzados entre dos operaciones a la vez)
 * y revisa todo el stock antes de tocar nada, para avisar de todas las faltas juntas.
 */
export async function verificarStock(tx: Tx, items: { varianteId: number; cantidad: number }[], porId: Map<number, Vendible>) {
  const faltantes: string[] = [];
  for (const it of [...items].sort((a, b) => a.varianteId - b.varianteId)) {
    const stock = (await bloquearVariante(tx, it.varianteId))!;
    if (it.cantidad > stock) faltantes.push(`${nombreVariante(porId.get(it.varianteId)!)} (${stock === 0 ? 'no queda ninguna' : `quedan ${stock}`})`);
  }
  if (faltantes.length) throw new HttpError(409, `No hay stock suficiente de ${faltantes.join(', ')}`);
}

/**
 * Aplica a cada pago su recargo o descuento.
 * Crédito: el recargo lo pone el vendedor (si no lo manda, va el % del plan de esas cuotas, o 0) y se puede
 * elegir cualquier cantidad de cuotas, siempre que el crédito esté habilitado. Los demás medios: el % configurado.
 */
export async function calcularPagos(tx: Tx, pagos: { medio: MedioPago; cuotas: number; monto: number; porcentaje?: number }[]) {
  if (!pagos.length) return [];
  const planes = await tx.planPago.findMany({ where: { activo: true } });
  return pagos.map(({ medio, cuotas, monto, porcentaje: elegido }) => {
    const plan = planes.find((x) => x.medio === medio && x.cuotas === cuotas);
    const habilitado = medio === 'CREDITO' ? planes.some((x) => x.medio === 'CREDITO') : !!plan;
    if (!habilitado) {
      const nombre = medio === 'CREDITO' ? MEDIOS_PAGO.CREDITO : nombrePlan({ medio, cuotas });
      throw new HttpError(400, `El pago con ${nombre} no está habilitado. Revisá los medios de pago en Configuración.`);
    }
    const porcentaje = medio === 'CREDITO' && elegido !== undefined ? elegido : plan ? num(plan.porcentaje) : 0;
    return { medio, cuotas, monto, porcentaje, ...aplicarPorcentaje(monto, porcentaje) };
  });
}
