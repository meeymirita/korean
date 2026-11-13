import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = p => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8')

test('страница обслуживания есть и самодостаточна', () => {
  assert.ok(existsSync(fileURLToPath(new URL('../docker/caddy/maintenance.html', import.meta.url))))
  const html = read('docker/caddy/maintenance.html')
  assert.doesNotMatch(html, /https?:\/\//i, 'внешних ссылок быть не должно')
  assert.doesNotMatch(html, /<(script|link|img)\b[^>]*\b(src|href)=/i)
  assert.match(html, /우리말/)
  assert.match(html, /&#xFE0E;|︎/, 'у ✳ нужен селектор U+FE0E')
  assert.match(html, /http-equiv="refresh"/)
  assert.match(html, /prefers-color-scheme:\s*dark/)
  assert.doesNotMatch(html, /[぀-ヿ一-鿿]/, 'японских и китайских знаков нет')
})

test('Caddyfile профиля edge отдаёт страницу при 502/503/504 без кэша', () => {
  const cf = read('docker/caddy/Caddyfile')
  assert.match(cf, /handle_errors/)
  assert.match(cf, /502, 503, 504/)
  assert.match(cf, /Cache-Control "no-store"/)
  assert.match(cf, /Retry-After "15"/)
  assert.match(cf, /status 503/)
  assert.match(cf, /maintenance\.html/)
  assert.doesNotMatch(cf, /immutable"\s*\n\s*handle_errors/)
  assert.match(read('docker-compose.yml'), /docker\/caddy\/maintenance\.html:\/srv\/maintenance\/maintenance\.html:ro/)
})
