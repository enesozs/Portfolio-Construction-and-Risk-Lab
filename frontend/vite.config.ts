import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // FastAPI runs on :8030 during development; the browser only talks to Vite.
    port: 5183,
    proxy: { '/api': 'http://127.0.0.1:8030' },
  },
})
