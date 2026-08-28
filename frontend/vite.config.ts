import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    // The UI reads scenarios.json, synthetic-data/ and outputs/ from the repo
    // root, one level up. Vite needs explicit permission to serve those.
    fs: { allow: [new URL('..', import.meta.url).pathname] },

  },
})
