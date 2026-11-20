import type { Prisma, TipoMovimiento } from '../generated/prisma/client.js';
import { HttpError } from '../http/errors.js';

type Tx = Prisma.TransactionClient;

/**
 * Suma o descuenta stock de una variante y deja registrado el movimiento.
 * Tiene que correr dentro de una transacción. El stock nunca queda negativo:
 * el UPDATE solo se aplica si alcanza (y la base tiene además un CHECK).
 */
export async function moverStock(
  tx: Tx,
  varianteId: number,
  cantidad: number,
  tipo: TipoMovimiento,
  extra: { detalle?: string | null; ingresoId?: number; ventaId?: number } = {},
) {
  if (!Number.isInteger(cantidad) || cantidad === 0) throw new Error(`Cantidad de movimiento inválida: ${cantidad}`);
  const filas = await tx.$queryRaw<{ stock: number }[]>`
    UPDATE variantes SET stock = stock + ${cantidad}
    WHERE id = ${varianteId} AND stock + ${cantidad} >= 0
    RETURNING stock`;
  const fila = filas[0];
  if (!fila) throw new HttpError(409, 'No hay stock suficiente');
  await tx.movimientoStock.create({
    data: { varianteId, cantidad, tipo, stockResultante: fila.stock, detalle: extra.detalle ?? null, ingresoId: extra.ingresoId, ventaId: extra.ventaId },
  });
  return fila.stock;
}

/** Bloquea la fila de la variante hasta el fin de la transacción y devuelve su stock actual. */
export async function bloquearVariante(tx: Tx, varianteId: number) {
  const filas = await tx.$queryRaw<{ stock: number }[]>`SELECT stock FROM variantes WHERE id = ${varianteId} FOR UPDATE`;
  return filas[0]?.stock ?? null;
}
