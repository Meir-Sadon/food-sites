import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// In development the API is reached through this proxy, so the session cookie stays same-origin.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:5000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
  },
})
