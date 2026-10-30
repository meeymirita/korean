import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const file = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

describe('приложение (PWA)', () => {
  const sw = file('public/sw.js')

  test('сервис-воркер не трогает /api и не-GET запросы', () => {
    assert.ok(sw.includes("startsWith('/api/')"))
    assert.ok(sw.includes("req.method !== 'GET'"))
  })

  test('у кэша есть версия, старые кэши удаляются', () => {
    assert.match(sw, /const VERSION = 'v\d+'/)
    assert.ok(sw.includes('caches.delete'))
  })

  test('сайт регистрирует воркер и манифест подходит для установки', () => {
    assert.ok(file('src/lib/pwa.ts').includes("register('/sw.js')"))
    assert.ok(file('src/main.ts').includes('initPwa()'))
    const m = JSON.parse(file('public/manifest.webmanifest'))
    assert.equal(m.display, 'standalone')
    assert.ok(m.icons.some(i => i.sizes === '512x512') && m.icons.some(i => i.sizes === '192x192'))
  })
})

describe('видео-демонстрация на главной', () => {
  test('кнопка и окно есть, файл лежит в public', async () => {
    const { existsSync } = await import('node:fs')
    const home = file('src/views/HomeView.vue')
    assert.ok(home.includes('посмотреть видео-демонстрацию') && home.includes("DEMO_SRC = '/demo.webm'") && home.includes('<Teleport to="body">'))
    assert.ok(existsSync(new URL('../public/demo.webm', import.meta.url)))
  })
})
