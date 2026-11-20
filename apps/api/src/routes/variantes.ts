import { Router } from 'express';
import { ajusteSchema, codigoBarrasSchema, idSchema, MOTIVOS_AJUSTE, varianteSchema, type Movimiento } from '@lmont/shared';
import { bloquearVariante, moverStock } from '../catalogo/stock.js';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import { selectEncontrada, selectVariante, variante, varianteEncontrada } from '../catalogo/serializar.js';
import { asignarCodigoInterno } from './productos.js';

export const variantesRouter = Router();

/** Busca una variante por código de barras exacto (lector USB o cámara del celular). */
variantesRouter.get(
  '/codigo/:codigo',
  handler(async (req, res) => {
    const codigo = validar(codigoBarrasSchema, req.params.codigo);
    if (!codigo) throw new HttpError(400, 'Escaneá o escribí un código de barras');
    const v = await prisma.variante.findUnique({ where: { codigoBarras: codigo }, select: selectEncontrada });
    if (!v) throw new HttpError(404, `No hay ningún producto con el código ${codigo}`);
    res.json(varianteEncontrada(v));
  }),
);

/** Edita código de barras, stock mínimo y si está activa. El stock no se toca acá. */
variantesRouter.put(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const data = validar(varianteSchema, req.body);
    if (!(await prisma.variante.findUnique({ where: { id }, select: { id: true } }))) throw noEncontrado('la variante');
    if (data.codigoBarras) {
      const otra = await prisma.variante.findUnique({
        where: { codigoBarras: data.codigoBarras },
        select: { id: true, producto: { select: { nombre: true } }, color: { select: { nombre: true } }, talle: { select: { nombre: true } } },
      });
      if (otra && otra.id !== id) {
        const msg = `Ese código ya está cargado en ${otra.producto.nombre} ${otra.color.nombre} talle ${otra.talle.nombre}`;
        throw new HttpError(409, msg, { codigoBarras: msg });
      }
    }
    res.json(variante(await prisma.variante.update({ where: { id }, data, select: selectVariante })));
  }),
);

/** Historial de movimientos de stock de una variante (los más recientes primero). */
variantesRouter.get(
  '/:id/movimientos',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    if (!(await prisma.variante.findUnique({ where: { id }, select: { id: true } }))) throw noEncontrado('la variante');
    const filas = await prisma.movimientoStock.findMany({
      where: { varianteId: id },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    const body: Movimiento[] = filas.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      cantidad: m.cantidad,
      stockResultante: m.stockResultante,
      detalle: m.detalle,
      ingresoId: m.ingresoId,
      creadoEn: m.creadoEn.toISOString(),
    }));
    res.json(body);
  }),
);

/**
 * Ajuste manual: se informa cuántas unidades hay realmente y se registra la diferencia
 * como movimiento, con el motivo.
 */
variantesRouter.post(
  '/:id/ajuste',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const { stockReal, motivo, nota } = validar(ajusteSchema, req.body);
    const v = await prisma.$transaction(async (tx) => {
      const actual = await bloquearVariante(tx, id);
      if (actual === null) throw noEncontrado('la variante');
      if (actual === stockReal) {
        throw new HttpError(400, `El stock ya es ${stockReal}: no hay nada que ajustar`, { stockReal: `El stock ya es ${stockReal}` });
      }
      const detalle = MOTIVOS_AJUSTE[motivo].replace(/ \(.*\)$/, '') + (nota ? `: ${nota}` : '');
      await moverStock(tx, id, stockReal - actual, 'AJUSTE', { detalle });
      return tx.variante.findUniqueOrThrow({ where: { id }, select: selectVariante });
    });
    res.json(variante(v));
  }),
);

/** Genera un código interno para una variante sin código (para imprimir etiquetas propias). */
variantesRouter.post(
  '/:id/codigo-interno',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const v = await prisma.$transaction(async (tx) => {
      const actual = await tx.variante.findUnique({ where: { id }, select: { codigoBarras: true } });
      if (!actual) throw noEncontrado('la variante');
      if (actual.codigoBarras) throw new HttpError(409, 'Esta variante ya tiene código de barras');
      await asignarCodigoInterno(tx, id);
      return tx.variante.findUniqueOrThrow({ where: { id }, select: selectVariante });
    });
    res.json(variante(v));
  }),
);
