import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

// Usa siempre la base de prueba, nunca la de desarrollo.
config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)), override: true });
