import { z } from 'zod';
import { esFechaValida, hoy } from '../fechas.js';
import { formatMonto, redondear } from '../money.js';
import { cantidadSchema, idSchema, montoSchema, textoObligatorio } from './comunes.js';
import type { ItemLista } from './catalogo.js';

// ---------------------------------------------------------------------------
// Definición
// ---------------------------------------------------------------------------

export const MODOS_PROMOCION = {
  PRECIO_FIJO: 'Precio fijo',
  NXM: 'Lleva N, paga M',
} as const;
export type ModoPromocion = keyof typeof MODOS_PROMOCION;

/** Vacío ("" o null) se toma como "no cargado". */
const vacioANull = (v: unknown) => (v === '' || v === undefined ? null : v);

const fechaOpcional = z.preprocess(
  vacioANull,
  z
    .string()
    .refine(esFechaValida, 'Fecha inválida')
    .nullable(),
);

export const componenteSchema = z.object({
  productoId: z.preprocess(vacioANull, idSchema.nullable()),
  tipoId: z.preprocess(vacioANull, idSchema.nullable()),
  cantidad: cantidadSchema(1),
});

export const promocionSchema = z
  .object({
    nombre: textoObligatorio('el nombre', 80),
    modo: z.enum(['PRECIO_FIJO', 'NXM'], { error: 'Elegí el tipo de promoción' }),
    componentes: z
      .array(componenteSchema, { error: 'Elegí qué prendas entran en la promo' })
      .min(1, 'Elegí qué prendas entran en la promo')
      .max(10, 'Hasta 10 productos por promo'),
    precio: z.preprocess(vacioANull, montoSchema.nullable()),
    pagaCantidad: z.preprocess(vacioANull, cantidadSchema(1).nullable()),
    desde: fechaOpcional,
    hasta: fechaOpcional,
    activo: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    const claves = new Set<string>();
    d.componentes.forEach((c, i) => {
      if (!c.productoId === !c.tipoId) {
        ctx.addIssue({ code: 'custom', path: ['componentes', i], message: 'Elegí un producto o un tipo de prenda' });
        return;
      }
      const clave = c.productoId ? `p${c.productoId}` : `t${c.tipoId}`;
      if (claves.has(clave)) ctx.addIssue({ code: 'custom', path: ['componentes', i], message: 'Está repetido: sumá la cantidad en la misma fila' });
      claves.add(clave);
    });
    const unidades = d.componentes.reduce((s, c) => s + c.cantidad, 0);
    if (d.modo === 'PRECIO_FIJO') {
      if (d.precio === null) ctx.addIssue({ code: 'custom', path: ['precio'], message: 'Ingresá el precio de la promo' });
      else if (d.precio <= 0) ctx.addIssue({ code: 'custom', path: ['precio'], message: 'El precio tiene que ser mayor a 0' });
      if (unidades < 2) ctx.addIssue({ code: 'custom', path: ['componentes'], message: 'Una promo necesita al menos 2 prendas' });
    } else {
      const c = d.componentes[0]!;
      if (d.componentes.length > 1) ctx.addIssue({ code: 'custom', path: ['componentes'], message: 'En “lleva N, paga M” elegí un solo producto o tipo de prenda' });
      else if (c.cantidad < 2) ctx.addIssue({ code: 'custom', path: ['componentes', 0, 'cantidad'], message: 'Tiene que llevar al menos 2' });
      if (d.pagaCantidad === null) ctx.addIssue({ code: 'custom', path: ['pagaCantidad'], message: 'Ingresá cuántas paga' });
      else if (d.pagaCantidad >= c.cantidad) ctx.addIssue({ code: 'custom', path: ['pagaCantidad'], message: 'Tiene que pagar menos de las que lleva' });
    }
    if (d.desde && d.hasta && d.hasta < d.desde) ctx.addIssue({ code: 'custom', path: ['hasta'], message: 'La fecha de fin es anterior a la de inicio' });
  })
  // Lo que no corresponde al modo se descarta.
  .transform((d) => (d.modo === 'PRECIO_FIJO' ? { ...d, pagaCantidad: null } : { ...d, precio: null }));
export type PromocionInput = z.input<typeof promocionSchema>;

export type ComponentePromo = {
  producto: { id: number; nombre: string; tipo: ItemLista } | null;
  tipo: ItemLista | null;
  cantidad: number;
};

export type Promocion = {
  id: number;
  nombre: string;
  modo: ModoPromocion;
  precio: number | null;
  pagaCantidad: number | null;
  desde: string | null;
  hasta: string | null;
  activo: boolean;
  componentes: ComponentePromo[];
  /** Veces que se vendió (sin ventas anuladas). Solo en el listado de administración. */
  vendidas?: number;
};

/** Activa y dentro de las fechas. */
export const promoVigente = (p: Pick<Promocion, 'activo' | 'desde' | 'hasta'>, fecha = hoy()) =>
  p.activo && (!p.desde || p.desde <= fecha) && (!p.hasta || p.hasta >= fecha);

const nombreComponente = (c: ComponentePromo) =>
  c.producto ? `${c.producto.tipo.nombre} ${c.producto.nombre}` : `cualquier ${c.tipo!.nombre}`;

/** "Remera Básica + Bermuda Rústica a $ 30.000", "3 × Boxer Liso a $ 15.000", "2x1 en cualquier Boxer". */
export function describirPromo(p: Pick<Promocion, 'modo' | 'precio' | 'pagaCantidad' | 'componentes'>) {
  const partes = p.componentes.map((c) => `${c.cantidad > 1 ? `${c.cantidad} × ` : ''}${nombreComponente(c)}`).join(' + ');
  if (p.modo === 'NXM') return `${p.componentes[0]?.cantidad}x${p.pagaCantidad} en ${p.componentes[0] ? nombreComponente(p.componentes[0]) : ''}`;
  return `${partes} a ${formatMonto(p.precio ?? 0)}`;
}

// ---------------------------------------------------------------------------
// Aplicación en una venta
// ---------------------------------------------------------------------------

/** Prenda de la venta, con lo necesario para saber qué promos le corresponden. */
export type ItemParaPromo = { varianteId: number; productoId: number; tipoId: number; cantidad: number; precioUnitario: number };
export type PromoAplicada = { promocionId: number; veces: number };

export type AplicacionPromo = { promocionId: number; nombre: string; veces: number; precioNormal: number; precio: number; descuento: number };
export type ResultadoPromos =
  | { ok: true; aplicaciones: AplicacionPromo[]; descuentoTotal: number; /** varianteId -> descuento total del ítem */ descuentos: Map<number, number> }
  | { ok: false; error: string };

const coincide = (c: ComponentePromo, it: ItemParaPromo) => (c.producto ? c.producto.id === it.productoId : c.tipo!.id === it.tipoId);

/**
 * Asigna las prendas de la venta a las promos elegidas y calcula el descuento.
 * - Cada unidad entra en una sola promo.
 * - Primero se llenan los componentes de un producto puntual y después los de "cualquier X".
 * - Se usan primero las prendas más caras (lo que más le conviene al cliente).
 * - En "lleva N, paga M" se pagan las M más caras.
 * - El descuento se reparte entre las unidades en proporción a su precio (sirve para devoluciones).
 */
export function aplicarPromos(items: ItemParaPromo[], aplicadas: PromoAplicada[], promos: Promocion[]): ResultadoPromos {
  const quedan = new Map(items.map((it) => [it.varianteId, it.cantidad]));
  const porPrecio = [...items].sort((a, b) => b.precioUnitario - a.precioUnitario || a.varianteId - b.varianteId);
  const descuentos = new Map<number, number>();
  const aplicaciones: AplicacionPromo[] = [];

  for (const a of aplicadas) {
    const promo = promos.find((p) => p.id === a.promocionId);
    if (!promo) return { ok: false, error: 'Alguna promoción ya no está disponible. Sacala y volvé a aplicarla.' };
    const componentes = [...promo.componentes].sort((x, y) => Number(!x.producto) - Number(!y.producto));
    let precioNormal = 0;
    let precio = 0;
    for (let vez = 0; vez < a.veces; vez++) {
      const unidades: { varianteId: number; precio: number }[] = [];
      for (const c of componentes) {
        let faltan = c.cantidad;
        for (const it of porPrecio) {
          if (!faltan) break;
          if (!coincide(c, it)) continue;
          const toma = Math.min(faltan, quedan.get(it.varianteId) ?? 0);
          for (let i = 0; i < toma; i++) unidades.push({ varianteId: it.varianteId, precio: it.precioUnitario });
          quedan.set(it.varianteId, (quedan.get(it.varianteId) ?? 0) - toma);
          faltan -= toma;
        }
        if (faltan) {
          const veces = a.veces > 1 ? ` ${a.veces} veces` : '';
          return { ok: false, error: `Para aplicar “${promo.nombre}”${veces} faltan prendas: ${c.cantidad > 1 ? `${c.cantidad} × ` : ''}${nombreComponente(c)}` };
        }
      }
      const normal = redondear(unidades.reduce((s, u) => s + u.precio, 0));
      const conPromo =
        promo.modo === 'PRECIO_FIJO'
          ? promo.precio!
          : redondear(
              unidades
                .map((u) => u.precio)
                .sort((x, y) => y - x)
                .slice(0, promo.pagaCantidad!)
                .reduce((s, x) => s + x, 0),
            );
      const descuento = redondear(normal - conPromo);
      if (descuento <= 0) return { ok: false, error: `“${promo.nombre}” no hace descuento con estas prendas (sin la promo salen ${formatMonto(normal)})` };
      // Reparto del descuento: proporcional al precio. Los centavos del redondeo van a la unidad más
      // cara, así ninguna queda con más descuento que su precio.
      const partes = unidades.map((u) => redondear((descuento * u.precio) / normal));
      const masCara = unidades.reduce((m, u, i) => (u.precio > unidades[m]!.precio ? i : m), 0);
      partes[masCara] = redondear(partes[masCara]! + descuento - partes.reduce((s, x) => s + x, 0));
      unidades.forEach((u, i) => descuentos.set(u.varianteId, redondear((descuentos.get(u.varianteId) ?? 0) + partes[i]!)));
      precioNormal += normal;
      precio += conPromo;
    }
    precioNormal = redondear(precioNormal);
    precio = redondear(precio);
    aplicaciones.push({ promocionId: promo.id, nombre: promo.nombre, veces: a.veces, precioNormal, precio, descuento: redondear(precioNormal - precio) });
  }
  return { ok: true, aplicaciones, descuentos, descuentoTotal: redondear(aplicaciones.reduce((s, x) => s + x.descuento, 0)) };
}

/**
 * Promos que se pueden aplicar (una vez más) con lo que queda libre en la venta,
 * con cuánto ahorraría cada una. Para sugerirlas al vendedor.
 */
export function promosPosibles(items: ItemParaPromo[], aplicadas: PromoAplicada[], promos: Promocion[]) {
  const base = aplicarPromos(items, aplicadas, promos);
  if (!base.ok) return [];
  return promos.flatMap((p) => {
    const ya = aplicadas.find((a) => a.promocionId === p.id);
    const prueba = ya ? aplicadas.map((a) => (a === ya ? { ...a, veces: a.veces + 1 } : a)) : [...aplicadas, { promocionId: p.id, veces: 1 }];
    const r = aplicarPromos(items, prueba, promos);
    return r.ok ? [{ promo: p, ahorro: redondear(r.descuentoTotal - base.descuentoTotal) }] : [];
  });
}

/**
 * Deja solo las promos que todavía entran (por ejemplo, si se sacó una prenda de la venta),
 * bajando las veces de cada una hasta que entre.
 */
export function ajustarPromos(items: ItemParaPromo[], aplicadas: PromoAplicada[], promos: Promocion[]): PromoAplicada[] {
  const ok: PromoAplicada[] = [];
  for (const a of aplicadas) {
    for (let veces = a.veces; veces > 0; veces--) {
      if (aplicarPromos(items, [...ok, { ...a, veces }], promos).ok) {
        ok.push({ ...a, veces });
        break;
      }
    }
  }
  return ok;
}
