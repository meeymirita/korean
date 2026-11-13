#!/usr/bin/env node
/**
 * Быстрые тесты без базы: все `tests/*.test.mjs`, которым не нужен сервер (`tests/_server.mjs`), по одному файлу за раз.
 * Полный набор (с PostgreSQL, Redis, Meilisearch) остаётся в `npm test` и идёт в CI.
 * Запуск: `npm run test:quick` (можно дописать часть имени: `npm run test:quick -- keyboard`).
 */
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = fileURLToPath(new URL('../tests/', import.meta.url))
const only = process.argv.slice(2)

/** Тесту нужна база, если он поднимает сервер или сам читает адрес базы. */
export const needsDb = (source) => /_server\.mjs|DATABASE_URL/.test(source)

export const quickTests = () => readdirSync(dir)
  .filter(f => f.endsWith('.test.mjs'))
  .filter(f => !needsDb(readFileSync(path.join(dir, f), 'utf8')))
  .sort()

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const files = quickTests().filter(f => !only.length || only.some(o => f.includes(o)))
  if (!files.length) {
    console.error('Нет подходящих тестов')
    process.exit(1)
  }
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map(f => path.join(dir, f))], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}
