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

/** Respuesta al celular: si alguna pantalla tomó el código. */
export type EscaneoEnviado = { entregado: boolean };

/** La pantalla que recibió el código lo confirma con el id del aviso. */
export const escaneoRecibidoSchema = z.object({ id: z.string().uuid('Aviso inválido') });
/** `usar`: si esta pantalla fue la primera en tomarlo (las demás lo ignoran). */
export type EscaneoRecibido = { usar: boolean };
