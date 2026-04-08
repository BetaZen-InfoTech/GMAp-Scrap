/// <reference types="node" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { fileURLToPath, URL } from 'url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const pkg = require('./package.json')

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist-electron/main',
            target: 'node18',
            rollupOptions: {
              external: [
                'electron',
                'playwright',
                'exceljs',
                'electron-store',
                'axios',
                'dotenv',
                'form-data',
                'uuid',
                'path',
                'fs',
                'url',
                'os',
                'crypto',
                'stream',
                'events',
                'buffer',
                'util',
                'http',
                'https',
                'net',
                'tls',
                'child_process',
                'zlib',
              ],
              output: {
                format: 'cjs',
                entryFileNames: '[name].js',
              },
            },
          },
        },
      },
      preload: {
        input: 'src/main/preload.ts',
        vite: {
          build: {
            sourcemap: true,
            outDir: 'dist-electron/preload',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': r('./src/shared'),
      '@renderer': r('./src/renderer'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
