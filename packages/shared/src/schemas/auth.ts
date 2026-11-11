import { z } from 'zod';

export const loginSchema = z.object({
  usuario: z.string({ error: 'Ingresá el usuario' }).trim().min(1, 'Ingresá el usuario'),
  password: z.string({ error: 'Ingresá la contraseña' }).min(1, 'Ingresá la contraseña'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const cambiarPasswordSchema = z
  .object({
    actual: z.string({ error: 'Ingresá la contraseña actual' }).min(1, 'Ingresá la contraseña actual'),
    nueva: z.string({ error: 'Ingresá la contraseña nueva' }).min(8, 'La contraseña nueva tiene que tener al menos 8 caracteres'),
    repetir: z.string({ error: 'Repetí la contraseña nueva' }),
  })
  .refine((d) => d.nueva === d.repetir, { message: 'Las contraseñas no coinciden', path: ['repetir'] });
export type CambiarPasswordInput = z.input<typeof cambiarPasswordSchema>;
