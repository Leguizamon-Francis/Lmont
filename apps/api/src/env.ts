import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'Falta la variable DATABASE_URL'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET tiene que tener al menos 32 caracteres'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Configuración inválida:\n' + parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
