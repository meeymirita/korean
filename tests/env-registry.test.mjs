// Реестр переменных окружения сервера (backend/src/env-check.ts): сверка с кодом и .env.example, проверка значений.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENV_PREFIXES, ENV_VARS, checkEnv, problemWith } from '../backend/src/env-check.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const walk = dir => readdirSync(dir).flatMap(f => {
  const p = path.join(dir, f)
  if (f === 'generated') return []
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
})
const known = name => name in ENV_VARS || Object.keys(ENV_PREFIXES).some(p => name.startsWith(p))

describe('реестр переменных окружения сервера', () => {
  test('каждая переменная, которую читает код, есть в реестре', () => {
    const used = new Set()
    for (const file of walk(path.join(root, 'backend/src'))) {
      if (file.endsWith('env-check.ts')) continue
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\b(?:process\.)?env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1])
      for (const m of text.matchAll(/\bnum\('([A-Z][A-Z0-9_]+)'/g)) used.add(m[1])
    }
    assert.ok(used.size > 40, 'сканер нашёл переменные')
    const missing = [...used].filter(n => !known(n)).sort()
    assert.deepEqual(missing, [], 'допиши в ENV_VARS (backend/src/env-check.ts)')
  })

  test('каждая серверная переменная из backend/.env.example известна реестру', () => {
    const names = [...readFileSync(path.join(root, 'backend/.env.example'), 'utf8').matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map(m => m[1])
    assert.ok(names.length > 10)
    assert.deepEqual(names.filter(n => !known(n)), [])
  })

  test('форматы значений: время, день недели, порт, адрес, флаг, число', () => {
    for (const ok of ['20:00', '7:30', '23:59']) assert.equal(problemWith('time', ok), '', ok)
    for (const bad of ['24:00', '20-00', '8', '12:5', 'вечером']) assert.notEqual(problemWith('time', bad), '', bad)
    assert.equal(problemWith('weekday', '0'), '')
    assert.notEqual(problemWith('weekday', '7'), '')
    assert.notEqual(problemWith('weekday', 'sun'), '')
    assert.equal(problemWith('port', '3001'), '')
    assert.notEqual(problemWith('port', '70000'), '')
    assert.equal(problemWith('url', 'http://localhost:7700'), '')
    assert.notEqual(problemWith('url', 'localhost 7700'), '')
    assert.equal(problemWith('flag', '1'), '')
    assert.notEqual(problemWith('flag', 'true'), '')
    assert.equal(problemWith('num', '0.5'), '')
    assert.notEqual(problemWith('num', 'много'), '')
  })

  test('checkEnv: пустое окружение чисто, ошибки и опечатки названы по имени, секрет не печатается', () => {
    assert.deepEqual(checkEnv({}), [])
    assert.deepEqual(checkEnv({ STUDY_TIME: '20:00', STUDY_WEEKDAY: '0', PORT: '3001', TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_GROUP_ID: '-100', TELEGRAM_TOPIC_STUDY: '12' }), [])
    const out = checkEnv({ STUDY_TIME: '25:00', REPORT_WEEKDAY: '9', TELEGRAM_BOT_TOKEN: 'секретное-значение', TELEGRAM_TOPIC_LOGIN: 'abc', TELEGRAM_BOT_TOKN: '1', HOME: '/x' })
    const text = out.join('\n')
    for (const name of ['STUDY_TIME', 'REPORT_WEEKDAY', 'TELEGRAM_TOPIC_LOGIN', 'TELEGRAM_BOT_TOKN', 'ни TELEGRAM_CHAT_ID']) assert.ok(text.includes(name), name)
    assert.ok(!text.includes('секретное-значение'), 'значения секретов в сообщениях не повторяются')
    assert.ok(!text.includes('HOME'), 'чужие переменные не трогаем')
  })
})
