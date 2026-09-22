import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * A versao do jogo vem do package.json, e de nenhum outro lugar.
 *
 * Duplicar o numero num arquivo de codigo garantiria que um dia os dois
 * discordariam, e o rodape do menu passaria a mentir. Aqui ele e injetado no
 * bundle em tempo de build.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string }

export default defineConfig({
  plugins: [react()],
  define: {
    __GAME_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    // Em dev o backend roda separado; em modo host tudo vem da mesma origem.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
