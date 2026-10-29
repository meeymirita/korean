// Загрузка TS-модулей проекта для тестов: Vite в режиме SSR, алиас @/ → src/, без esbuild.
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
let server

/** Заглушка localStorage: нужна модулям, которые читают его при загрузке. */
export function stubLocalStorage() {
  const m = new Map()
  globalThis.localStorage = {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: k => void m.delete(k),
    clear: () => m.clear(),
  }
  globalThis.window ??= globalThis // гостевое хранилище подменяет window.localStorage
  return m
}

export async function load(path) {
  server ??= await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias: { '@': root + 'src' } },
  })
  return server.ssrLoadModule(path)
}

export const close = () => server?.close()
