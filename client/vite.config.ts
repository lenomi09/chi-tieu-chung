import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Tailwind chạy qua PostCSS thường (postcss.config.js) — dùng Tailwind v3 để
// tương thích được với Safari/iOS cũ (v4 yêu cầu Safari 16.4+).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3456',
      '/calc.js': 'http://localhost:3456',
    },
  },
  // Ha thap muc tieu build de an toan tren Safari cu (vd iOS 15) — tranh
  // esbuild sinh ra cu phap JS qua moi ma engine cu khong parse duoc.
  build: {
    target: ['es2020', 'safari14'],
  },
})
