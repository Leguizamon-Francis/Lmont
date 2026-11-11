import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // El paquete compartido es TypeScript sin compilar: se incluye en el bundle.
  noExternal: ['@lmont/shared'],
});
