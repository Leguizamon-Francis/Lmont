import { z } from 'zod';
import { textoObligatorio } from './comunes.js';

export const vendedorSchema = z.object({
  nombre: textoObligatorio('el nombre', 60),
  activo: z.boolean().default(true),
});
export type VendedorInput = z.input<typeof vendedorSchema>;
export type VendedorData = z.output<typeof vendedorSchema>;

export type Vendedor = { id: number; nombre: string; activo: boolean };
