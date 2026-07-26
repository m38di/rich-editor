import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' → relative asset paths in the production build, so the app
// works on ANY static host — including GitHub Pages project sites served
// from https://<user>.github.io/<repo>/ (a sub-path, not the domain root).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
})
