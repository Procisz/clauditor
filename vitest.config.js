import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

process.env.TZ = 'Europe/Budapest';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  resolve: {
    alias: {
      apexcharts: here('./test/mocks/apexcharts.js'),
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost:5173/',
        pretendToBeVisual: true,
      },
    },
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    exclude: ['node_modules/**'],
    restoreMocks: true,
    unstubGlobals: true,
    testTimeout: 20000,
  },
});
