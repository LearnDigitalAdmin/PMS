import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pwaSw from './tools/vite-plugin-pwa-sw'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react(), pwaSw()],
  build: {
    minify: 'terser',
    sourcemap: false,
    cssCodeSplit: true,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 3,                 // extra optimization passes
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        unsafe_math: true,
      },
      mangle: {
        toplevel: true,            // mangle top-level names
        properties: false,         // leave false: mangling properties breaks React/libs
      },
      format: {
        comments: false,           // strip all comments/license banners
      },
    },
    rollupOptions: {
      output: {
        // Hashed, non-descriptive chunk names (no "AdminPanel-abc.js" hints)
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash][extname]',
      },
    },
  }
})
