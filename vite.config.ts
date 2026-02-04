import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Proxy para evitar CORS no dev:
 * - Front chama /v1/... (mesma origin do Vite)
 * - Vite encaminha para o backend (default: http://localhost:8000)
 */
// 0.0.0.0 é endereço de bind; para o proxy, use um host "real" (localhost/127.0.0.1/IP)
const backendTarget = 'http://localhost:8008'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

