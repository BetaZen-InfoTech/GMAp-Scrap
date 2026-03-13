/// <reference types="node" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { fileURLToPath, URL } from 'url'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
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
