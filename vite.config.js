import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { createHtmlPlugin } from 'vite-plugin-html'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  plugins: [
    tailwindcss(),
    createHtmlPlugin({
      minify: false,
      inject: {
        ejsOptions: { views: [__dirname] },
      },
    }),
    viteSingleFile(),
  ],
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
})
