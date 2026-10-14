import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pwaSw from './tools/vite-plugin-pwa-sw'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), pwaSw()],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    }
  }
})
