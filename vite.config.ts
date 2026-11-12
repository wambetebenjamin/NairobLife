/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    host: true, // listen on 0.0.0.0 so phones on your Wi-Fi can open the dev server
    port: 5173,
    // Hosted previews proxy the dev server under their own domain. Add yours if you tunnel.
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['.e2b.app'],
  },

  worker: { format: 'es' },

  build: {
    target: 'es2022',
    // Rapier ships its WebAssembly inlined in a ~2 MB JS file. It gets its own chunk
    // below so it caches independently of game code; the warning would only be noise.
    chunkSizeWarningLimit: 2400,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /node_modules[\\/]@dimforge/, priority: 30 },
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 20 },
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
})
