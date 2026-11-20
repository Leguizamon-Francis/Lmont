import { z } from 'zod';
import { idSchema, textoObligatorio, textoOpcional } from './comunes.js';
import { whatsappSchema } from './stock.js';
import type { ItemLista } from './catalogo.js';
import type { VentaResumen } from './ventas.js';

export const clienteSchema = z.object({
  nombre: textoObligatorio('el nombre', 80),
  whatsapp: whatsappSchema,
  /** Talles que usa, elegidos de la lista (puede tener uno para remeras y otro para pantalones). */
  talleIds: z
    .array(idSchema, { error: 'Elegí los talles de la lista' })
    .max(20, 'Demasiados talles')
    .default([])
    .transform((ids) => [...new Set(ids)]),
  notas: textoOpcional(500),
  activo: z.boolean().default(true),
});
export type ClienteInput = z.input<typeof clienteSchema>;

export type Cliente = {
  id: number;
  nombre: string;
  whatsapp: string | null;
  notas: string | null;
  activo: boolean;
  talles: (ItemLista & { orden: number })[];
};

export type ClienteResumen = Cliente & {
  /** Ventas no anuladas. */
  compras: number;
  /** Lo que pagó en esas ventas, más lo que pagó o se le devolvió en cambios. */
  totalComprado: number;
  ultimaCompra: string | null;
};

export type ClienteDetalle = ClienteResumen & { creadoEn: string; ventas: VentaResumen[] };

export type ListaClientes = { clientes: ClienteResumen[]; total: number };

/** Últimos dígitos del WhatsApp, para detectar el mismo número escrito con o sin 54 / 9. */
export const finWhatsapp = (digitos: string) => digitos.slice(-10);
