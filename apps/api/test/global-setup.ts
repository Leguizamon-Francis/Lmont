import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from 'dotenv';

/** Aplica las migraciones a la base de prueba antes de correr los tests. */
export default function setup() {
  const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const vars = config({ path: path.join(apiDir, '.env.test'), processEnv: {} }).parsed ?? {};
  if (!vars.DATABASE_URL?.includes('test')) {
    throw new Error('.env.test tiene que apuntar a una base de prueba (el nombre debe contener "test").');
  }
  execSync('npx prisma migrate deploy', { cwd: apiDir, stdio: 'inherit', env: { ...process.env, ...vars } });
}
