import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    css: true,
    setupFiles: ['./src/vitest.setup.ts'],
    server: {
      deps: {
        inline: [/@csstools\/css-calc/, /@asamuzakjp\/css-color/, /lucide-react/],
      },
    },
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/lib/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
