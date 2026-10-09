import { defineConfig, loadEnv } from 'vite'
import { publicSupabaseConfig } from './src/lib/config.js'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  publicSupabaseConfig({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env })
  return {
  plugins: [
    vue(),
    tailwindcss(), // Tailwind CSS v4 Vite eklentisi
  ],
  resolve: {
    // '@' kısayolu → src/ klasörünü işaret eder
    // Böylece import { x } from '@/lib/supabaseClient' gibi yazılabilir
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  }
})
