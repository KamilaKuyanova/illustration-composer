import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // относительные пути: сайт работает из любой папки (GitHub Pages и т.п.)
})
