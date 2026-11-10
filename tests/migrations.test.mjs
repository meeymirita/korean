import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Откат деплоя возвращает прежний код, но не схему базы (scripts/deploy.sh). Поэтому миграция обязана быть совместима с прежним кодом:
// только добавлять таблицы, столбцы и индексы. Всё, что стирает или переименовывает, прежний код ломает, а данные теряет.
const DIR = new URL('../backend/prisma/migrations/', import.meta.url).pathname
const FORBIDDEN = [
  [/\bDROP\s+(TABLE|COLUMN|INDEX|TYPE|SCHEMA|CONSTRAINT|DEFAULT|NOT\s+NULL)\b/i, 'DROP'],
  [/\bALTER\s+TABLE\b[^;]*\bDROP\b/i, 'ALTER TABLE … DROP'],
  [/\bRENAME\s+(TO|COLUMN|CONSTRAINT)\b/i, 'RENAME'],
  [/\bTRUNCATE\b/i, 'TRUNCATE'],
  [/\bDELETE\s+FROM\b/i, 'DELETE FROM'],
  [/\bALTER\s+COLUMN\b[^;]*\b(SET\s+DATA\s+)?TYPE\b/i, 'смена типа столбца'],
  [/\bALTER\s+COLUMN\b[^;]*\bSET\s+NOT\s+NULL\b/i, 'SET NOT NULL у существующего столбца'],
]
const sqlOf = text => text.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('миграции базы только добавляют: без DROP, RENAME, TRUNCATE, DELETE и смены типов', () => {
  const dirs = readdirSync(DIR).filter(d => statSync(join(DIR, d)).isDirectory())
  assert.ok(dirs.length >= 3)
  for (const d of dirs) {
    const sql = sqlOf(readFileSync(join(DIR, d, 'migration.sql'), 'utf8'))
    for (const [re, name] of FORBIDDEN) assert.ok(!re.test(sql), `${d}: ${name}. Прежний код после отката с такой базой не заработает; добавляй новое, старое не трогай`)
  }
})

test('новый обязательный столбец в существующей таблице получает значение по умолчанию', () => {
  for (const d of readdirSync(DIR).filter(x => statSync(join(DIR, x)).isDirectory())) {
    const sql = sqlOf(readFileSync(join(DIR, d, 'migration.sql'), 'utf8'))
    for (const m of sql.matchAll(/\bADD\s+COLUMN\b([^,;]*)/gi)) {
      if (/\bNOT\s+NULL\b/i.test(m[1])) assert.match(m[1], /\bDEFAULT\b/i, `${d}: ADD COLUMN … NOT NULL без DEFAULT: прежний код не сможет вставлять строки`)
    }
  }
})

test('проверка сама ловит опасные команды', () => {
  const bad = ['DROP TABLE "notes";', 'ALTER TABLE "notes" DROP COLUMN "text";', 'ALTER TABLE "a" RENAME TO "b";', 'TRUNCATE "events";', 'DELETE FROM "events";', 'ALTER TABLE "a" ALTER COLUMN "x" TYPE TEXT;']
  for (const sql of bad) assert.ok(FORBIDDEN.some(([re]) => re.test(sql)), sql)
  const good = ['CREATE TABLE "x" ("id" SERIAL NOT NULL);', 'ALTER TABLE "x" ADD COLUMN "y" TEXT;', 'CREATE INDEX "i" ON "x"("y");', '-- DROP TABLE в комментарии']
  for (const sql of good) assert.ok(!FORBIDDEN.some(([re]) => re.test(sqlOf(sql))), sql)
})
