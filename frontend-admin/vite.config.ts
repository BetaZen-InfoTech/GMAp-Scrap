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
                'electron-store',
                'axios',
                'dotenv',
                'ssh2',
                'path',
                'fs',
                'url',
                'os',
                'crypto',
                'http',
                'https',
                'net',
                'tls',
                'zlib',
                'stream',
                'events',
                'buffer',
                'util',
                'assert',
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
