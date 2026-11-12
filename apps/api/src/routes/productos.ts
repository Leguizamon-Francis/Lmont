import { Router } from 'express';
import {
  codigoInterno,
  idSchema,
  nuevasVariantesSchema,
  nuevoProductoSchema,
  productoSchema,
  type CantidadInicial,
  type ListaProductos,
  type PrecioHistorial,
} from '@lmont/shared';
import { z } from 'zod';
import { prisma } from '../db.js';
import { handler, HttpError, noEncontrado, validar } from '../http/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { moverStock } from '../catalogo/stock.js';
import { num, productoDetalle, productoResumen, selectDetalle, selectResumen } from '../catalogo/serializar.js';

export const productosRouter = Router();

type Tx = Prisma.TransactionClient;

const POR_PAGINA = 50;

const filtrosSchema = z.object({
  q: z.string().trim().max(80).optional(),
  tipoId: idSchema.optional(),
  /** "1" = solo activos, "0" = solo inactivos, vacío = todos. */
  activos: z.enum(['0', '1']).optional(),
  pagina: z.coerce.number().int().positive().default(1),
});

/** Listado con búsqueda por modelo, tipo de prenda o código de barras exacto. */
productosRouter.get(
  '/',
  handler(async (req, res) => {
    const f = validar(filtrosSchema, req.query);
    const and: Prisma.ProductoWhereInput[] = [];
    if (f.tipoId) and.push({ tipoId: f.tipoId });
    if (f.activos) and.push({ activo: f.activos === '1' });
    if (f.q) {
      const palabras = f.q.split(/\s+/);
      and.push({
        OR: [
          { variantes: { some: { codigoBarras: f.q } } },
          {
            AND: palabras.map((p) => ({
              OR: [
                { nombre: { contains: p, mode: 'insensitive' as const } },
                { tipo: { nombre: { contains: p, mode: 'insensitive' as const } } },
                { variantes: { some: { color: { nombre: { contains: p, mode: 'insensitive' as const } } } } },
              ],
            })),
          },
        ],
      });
    }
    const where: Prisma.ProductoWhereInput = { AND: and };
    const [total, productos] = await Promise.all([
      prisma.producto.count({ where }),
      prisma.producto.findMany({
        where,
        select: selectResumen,
        orderBy: [{ activo: 'desc' }, { tipo: { nombre: 'asc' } }, { nombre: 'asc' }],
        skip: (f.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
      }),
    ]);
    const body: ListaProductos = { productos: productos.map(productoResumen), total };
    res.json(body);
  }),
);

productosRouter.get(
  '/:id',
  handler(async (req, res) => {
    res.json(await buscarDetalle(prisma, validar(idSchema, req.params.id)));
  }),
);

productosRouter.get(
  '/:id/precios',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    await existeProducto(prisma, id);
    const filas = await prisma.precioHistorial.findMany({
      where: { productoId: id },
      orderBy: [{ desde: 'desc' }, { id: 'desc' }],
    });
    const body: PrecioHistorial[] = filas.map((h) => ({
      id: h.id,
      precioCompra: num(h.precioCompra),
      precioVenta: num(h.precioVenta),
      desde: h.desde.toISOString(),
    }));
    res.json(body);
  }),
);

/** Alta de producto, con su primer precio en el historial y (opcional) sus variantes. */
productosRouter.post(
  '/',
  handler(async (req, res) => {
    const { colorIds, talleIds, cantidades, ...data } = validar(nuevoProductoSchema, req.body);
    if (colorIds.length > 0 !== talleIds.length > 0) {
      const campo = colorIds.length ? 'talleIds' : 'colorIds';
      const msg = colorIds.length ? 'Elegí al menos un talle' : 'Elegí al menos un color';
      throw new HttpError(400, msg, { [campo]: msg });
    }
    const detalle = await prisma.$transaction(async (tx) => {
      await validarTipo(tx, data.tipoId);
      await validarNombreLibre(tx, data.tipoId, data.nombre);
      const p = await tx.producto.create({ data, select: { id: true } });
      await tx.precioHistorial.create({
        data: { productoId: p.id, precioCompra: data.precioCompra, precioVenta: data.precioVenta },
      });
      if (colorIds.length) await crearVariantes(tx, p.id, colorIds, talleIds, cantidades);
      return buscarDetalle(tx, p.id);
    });
    res.status(201).json(detalle);
  }),
);

/** Edición. Si cambia algún precio, se agrega una fila al historial. */
productosRouter.put(
  '/:id',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const data = validar(productoSchema, req.body);
    const detalle = await prisma.$transaction(async (tx) => {
      const actual = await tx.producto.findUnique({ where: { id } });
      if (!actual) throw noEncontrado('el producto');
      if (data.tipoId !== actual.tipoId) await validarTipo(tx, data.tipoId);
      await validarNombreLibre(tx, data.tipoId, data.nombre, id);
      await tx.producto.update({ where: { id }, data });
      if (num(actual.precioCompra) !== data.precioCompra || num(actual.precioVenta) !== data.precioVenta) {
        await tx.precioHistorial.create({
          data: { productoId: id, precioCompra: data.precioCompra, precioVenta: data.precioVenta },
        });
      }
      return buscarDetalle(tx, id);
    });
    res.json(detalle);
  }),
);

/** Agrega combinaciones color × talle (con sus unidades iniciales). Las que ya existen no se duplican. */
productosRouter.post(
  '/:id/variantes',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const { colorIds, talleIds, cantidades } = validar(nuevasVariantesSchema, req.body);
    const detalle = await prisma.$transaction(async (tx) => {
      await existeProducto(tx, id);
      const creadas = await crearVariantes(tx, id, colorIds, talleIds, cantidades);
      if (creadas === 0) throw new HttpError(409, 'Esas combinaciones de color y talle ya estaban cargadas');
      return buscarDetalle(tx, id);
    });
    res.status(201).json(detalle);
  }),
);

/** Asigna un código interno a todas las variantes del producto que no tienen código. */
productosRouter.post(
  '/:id/codigos-internos',
  handler(async (req, res) => {
    const id = validar(idSchema, req.params.id);
    const detalle = await prisma.$transaction(async (tx) => {
      await existeProducto(tx, id);
      const sinCodigo = await tx.variante.findMany({ where: { productoId: id, codigoBarras: null }, select: { id: true } });
      if (sinCodigo.length === 0) throw new HttpError(409, 'Todas las variantes ya tienen código de barras');
      for (const v of sinCodigo) {
        await asignarCodigoInterno(tx, v.id);
      }
      return buscarDetalle(tx, id);
    });
    res.json(detalle);
  }),
);

// ---------------------------------------------------------------------------

async function buscarDetalle(db: Tx, id: number) {
  const p = await db.producto.findUnique({ where: { id }, select: selectDetalle });
  if (!p) throw noEncontrado('el producto');
  return productoDetalle(p);
}

async function existeProducto(db: Tx, id: number) {
  if (!(await db.producto.findUnique({ where: { id }, select: { id: true } }))) throw noEncontrado('el producto');
}

async function validarTipo(db: Tx, tipoId: number) {
  const tipo = await db.tipoPrenda.findUnique({ where: { id: tipoId } });
  if (!tipo || !tipo.activo) {
    throw new HttpError(400, 'Elegí un tipo de prenda de la lista', { tipoId: 'Elegí un tipo de prenda de la lista' });
  }
}

async function validarNombreLibre(db: Tx, tipoId: number, nombre: string, exceptoId?: number) {
  const otro = await db.producto.findFirst({
    where: { tipoId, nombre: { equals: nombre, mode: 'insensitive' }, NOT: exceptoId ? { id: exceptoId } : undefined },
    select: { id: true },
  });
  if (otro) {
    const msg = 'Ya existe un modelo con ese nombre en este tipo de prenda';
    throw new HttpError(409, msg, { nombre: msg });
  }
}

/**
 * Crea las combinaciones que falten y les carga las unidades iniciales (con su movimiento de stock).
 * Valida que los colores y talles existan y estén activos.
 */
async function crearVariantes(
  db: Tx,
  productoId: number,
  colorIds: number[],
  talleIds: number[],
  cantidades: CantidadInicial[] = [],
) {
  const colores = [...new Set(colorIds)];
  const talles = [...new Set(talleIds)];
  const [okColores, okTalles] = await Promise.all([
    db.color.count({ where: { id: { in: colores }, activo: true } }),
    db.talle.count({ where: { id: { in: talles }, activo: true } }),
  ]);
  if (okColores !== colores.length) {
    throw new HttpError(400, 'Elegí colores de la lista', { colorIds: 'Elegí colores de la lista' });
  }
  if (okTalles !== talles.length) {
    throw new HttpError(400, 'Elegí talles de la lista', { talleIds: 'Elegí talles de la lista' });
  }
  const clave = (v: { colorId: number; talleId: number }) => `${v.colorId}-${v.talleId}`;
  const existentes = new Set(
    (await db.variante.findMany({ where: { productoId }, select: { colorId: true, talleId: true } })).map(clave),
  );
  const { count } = await db.variante.createMany({
    data: colores.flatMap((colorId) => talles.map((talleId) => ({ productoId, colorId, talleId }))),
    skipDuplicates: true,
  });

  const conUnidades = cantidades.filter((c) => c.cantidad > 0);
  if (conUnidades.some((c) => existentes.has(clave(c)))) {
    throw new HttpError(
      400,
      'Algunas combinaciones ya existían: para sumarles unidades usá el ingreso de mercadería',
    );
  }
  if (conUnidades.length) {
    const nuevas = await db.variante.findMany({
      where: { productoId, OR: conUnidades.map(({ colorId, talleId }) => ({ colorId, talleId })) },
      select: { id: true, colorId: true, talleId: true },
    });
    const idPorClave = new Map(nuevas.map((v) => [clave(v), v.id]));
    for (const c of conUnidades) {
      await moverStock(db, idPorClave.get(clave(c))!, c.cantidad, 'CARGA_INICIAL');
    }
  }
  return count;
}

export async function asignarCodigoInterno(db: Tx, varianteId: number) {
  const codigo = codigoInterno(varianteId);
  const ocupado = await db.variante.findUnique({ where: { codigoBarras: codigo }, select: { id: true } });
  if (ocupado && ocupado.id !== varianteId) {
    throw new HttpError(409, `El código ${codigo} ya está cargado en otra variante. Cargá el código a mano.`);
  }
  await db.variante.update({ where: { id: varianteId }, data: { codigoBarras: codigo } });
  return codigo;
}
