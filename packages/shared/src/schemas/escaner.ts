import { z } from 'zod';

/** Código leído con la cámara del celular para mandarlo a la pantalla abierta en la notebook. */
export const escaneoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(1, 'Escaneá un código')
    .max(40, 'El código de barras puede tener hasta 40 caracteres')
    .regex(/^[0-9A-Za-z-]+$/, 'El código de barras solo puede tener letras, números y guiones'),
});
export type EscaneoInput = z.input<typeof escaneoSchema>;

/** Respuesta al mandar un código: cuántas pantallas lo estaban esperando. */
export type EscaneoEnviado = { pantallas: number };
