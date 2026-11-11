import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // Los tests comparten una base de datos de prueba: se corren en serie.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
