import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  server: {
    // в разработке запросы к /api идут на локальный сервер прогресса (npm run server)
    // другой порт можно задать переменной API_PORT (например, для демо-сервера со скриншотами)
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT || 3001}` },
  },
  build: {
    rolldownOptions: {
      output: {
        // библиотеки меняются редко: в отдельных файлах браузер не перекачивает их после каждой выкладки сайта
        advancedChunks: {
          groups: [
            { name: 'vendor', test: /node_modules[\\/](vue|@vue|pinia|vue-router)[\\/]/ },
            { name: 'gsap', test: /node_modules[\\/]gsap[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
