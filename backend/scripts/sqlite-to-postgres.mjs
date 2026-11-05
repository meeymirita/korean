#!/usr/bin/env node
/**
 * Перенос базы «Хлебушка» из SQLite (прежний backend/data/app.db) в PostgreSQL.
 *
 *   node backend/scripts/sqlite-to-postgres.mjs <app.db> [--url postgresql://…] [--schema имя] [--replace] [--check-only]
 *
 * Что делает:
 *  1. Открывает app.db только на чтение (файл не меняется).
 *  2. Берёт целевую базу из --url или DATABASE_URL; схема (таблицы) должна быть уже создана миграциями Prisma
 *     (`npx prisma migrate deploy`; в Docker это делает сам контейнер backend при старте).
 *  3. Если в таблицах уже есть строки, останавливается; с --replace очищает таблицы и грузит заново.
 *  4. Копирует все таблицы одной транзакцией: либо всё, либо ничего.
 *  5. Выравнивает счётчики автонумерации (answers, coin_log, events), чтобы новые строки не столкнулись со старыми.
 *  6. Сверяет результат с источником: число строк, суммы чисел, суммы длин текста и контрольный хэш каждой таблицы.
 *     Любое расхождение даёт код выхода 1 (а при загрузке транзакция откатывается).
 *
 * С --check-only ничего не пишет, только сверяет уже загруженную базу с app.db.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url) // pg лежит в backend/node_modules (и в образе backend)

/** Таблицы в порядке загрузки и их ключ сортировки (по нему считается хэш). */
export const TABLES = [
  ['meta', 'key'], ['answers', 'id'], ['words', 'word'], ['days', 'day'], ['study_time', 'day'], ['guests', 'id'],
  ['notes', 'id'], ['images', 'id'], ['plans', 'id'], ['plan_files', 'id'], ['today_sets', 'id'], ['site_images', 'key'],
  ['sessions', 'hash'], ['coin_log', 'id'], ['nb_items', 'id'], ['events', 'id'],
]
const SERIAL = [['answers', 'id'], ['coin_log', 'id'], ['events', 'id']]
const q = name => `"${name.replace(/"/g, '""')}"`

/** Приводит значение SQLite к тому, что принимает pg: целые как строки (BIGINT без потерь), остальное как есть. */
const toPg = v => (typeof v === 'bigint' ? v.toString() : v)

/** Строка для хэша: одинаково выглядит и для SQLite, и для PostgreSQL. */
const canon = v => (v === null || v === undefined ? '\u0000null' : typeof v === 'bigint' ? v.toString() : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Number(v))) : String(v))

function fingerprint(rows, columns) {
  const hash = createHash('sha256')
  const sums = Object.fromEntries(columns.map(c => [c, { n: 0n, len: 0 }]))
  for (const row of rows) {
    for (const c of columns) {
      const v = row[c]
      if (typeof v === 'bigint') sums[c].n += v
      else if (typeof v === 'number' && Number.isInteger(v)) sums[c].n += BigInt(v)
      else if (typeof v === 'string') sums[c].len += Buffer.byteLength(v)
      hash.update(canon(v)).update('\u0001')
    }
    hash.update('\u0002')
  }
  return { rows: rows.length, hash: hash.digest('hex'), sums: Object.fromEntries(columns.map(c => [c, `${sums[c].n}/${sums[c].len}`])) }
}

export async function migrate({ sqlitePath, url, schema, replace = false, checkOnly = false, log = console.log }) {
  if (!existsSync(sqlitePath)) throw new Error(`Нет файла ${sqlitePath}`)
  const { Client } = require('pg')
  const lite = new DatabaseSync(sqlitePath, { readOnly: true, readBigInts: true })
  const integrity = lite.prepare('PRAGMA integrity_check').get()
  if (Object.values(integrity)[0] !== 'ok') throw new Error('SQLite: integrity_check не прошёл, перенос остановлен')

  const connection = new URL(url)
  const clientSchema = schema || connection.searchParams.get('schema') || undefined
  connection.searchParams.delete('schema')
  // BIGINT приходит из pg строкой: читаем как BigInt, как и из SQLite
  const types = { getTypeParser: (oid, fmt) => (oid === 20 ? BigInt : require('pg').types.getTypeParser(oid, fmt)) }
  const pg = new Client({ connectionString: connection.toString(), types })
  await pg.connect()
  const report = []
  try {
    if (clientSchema) await pg.query(`SET search_path TO ${q(clientSchema)}`)
    const have = new Set((await pg.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()`)).rows.map(r => r.table_name))
    for (const [t] of TABLES) if (!have.has(t)) throw new Error(`В PostgreSQL нет таблицы ${t}: сначала примени миграции (npx prisma migrate deploy)`)

    const liteTables = new Set(lite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all().map(r => r.name))
    const unknown = [...liteTables].filter(t => !TABLES.some(([n]) => n === t) && t !== 'sqlite_sequence')
    if (unknown.length) log(`⚠ в SQLite есть таблицы, которых нет в PostgreSQL, они НЕ переносятся: ${unknown.join(', ')}`)

    const plan = []
    for (const [table, order] of TABLES) {
      if (!liteTables.has(table)) { log(`· ${table}: в SQLite нет таблицы, пропускаю`); continue }
      const liteCols = lite.prepare(`PRAGMA table_info(${q(table)})`).all().map(c => c.name)
      const pgCols = (await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [table])).rows.map(r => r.column_name)
      const cols = liteCols.filter(c => pgCols.includes(c))
      const lost = liteCols.filter(c => !pgCols.includes(c))
      if (lost.length) throw new Error(`${table}: колонки ${lost.join(', ')} есть в SQLite, но нет в PostgreSQL, данные потерялись бы`)
      plan.push({ table, order, cols })
    }

    if (!checkOnly) {
      await pg.query('BEGIN')
      try {
        const filled = []
        for (const { table } of plan) if (Number((await pg.query(`SELECT count(*) FROM ${q(table)}`)).rows[0].count) > 0) filled.push(table)
        if (filled.length && !replace) throw new Error(`В PostgreSQL уже есть данные (${filled.join(', ')}). Чтобы заменить их, добавь --replace`)
        if (filled.length) await pg.query(`TRUNCATE ${plan.map(p => q(p.table)).join(', ')} RESTART IDENTITY`)
        for (const { table, order, cols } of plan) {
          const rows = lite.prepare(`SELECT ${cols.map(q).join(', ')} FROM ${q(table)} ORDER BY ${q(order)}`).all()
          const sql = `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`
          for (const row of rows) await pg.query(sql, cols.map(c => toPg(row[c])))
          log(`✔ ${table}: ${rows.length}`)
        }
        for (const [table, col] of SERIAL) {
          await pg.query(`SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${q(col)}) FROM ${q(table)}), 0) + 1, false)`, [table, col])
        }
        report.push(...(await verify(lite, pg, plan)))
        if (report.some(r => !r.ok)) throw new Error('Сверка выявила расхождения, транзакция откатывается:\n' + report.filter(r => !r.ok).map(r => r.text).join('\n'))
        await pg.query('COMMIT')
      } catch (e) {
        await pg.query('ROLLBACK').catch(() => {})
        throw e
      }
    } else {
      report.push(...(await verify(lite, pg, plan)))
    }
    for (const r of report) log(r.text)
    return { ok: report.every(r => r.ok), report }
  } finally {
    await pg.end()
    lite.close()
  }
}

async function verify(lite, pg, plan) {
  const out = []
  for (const { table, order, cols } of plan) {
    const select = `SELECT ${cols.map(q).join(', ')} FROM ${q(table)} ORDER BY ${q(order)}`
    const a = fingerprint(lite.prepare(select).all(), cols)
    const rows = (await pg.query({ text: select, rowMode: 'array' })).rows.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])))
    const b = fingerprint(rows, cols)
    const same = a.rows === b.rows && a.hash === b.hash && JSON.stringify(a.sums) === JSON.stringify(b.sums)
    out.push({ table, ok: same, text: `${same ? '✔' : '✖'} сверка ${table}: строк ${a.rows}/${b.rows}${same ? '' : `, хэш ${a.hash.slice(0, 8)}/${b.hash.slice(0, 8)}, суммы ${JSON.stringify(a.sums)} / ${JSON.stringify(b.sums)}`}` })
  }
  return out
}

const main = async () => {
  const args = process.argv.slice(2)
  const flag = n => args.includes(n)
  const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const sqlitePath = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--url' && args[i - 1] !== '--schema')
  const url = val('--url') || process.env.DATABASE_URL
  if (!sqlitePath || !url) {
    console.error('Использование: node backend/scripts/sqlite-to-postgres.mjs <app.db> [--url postgresql://…] [--schema имя] [--replace] [--check-only]')
    process.exit(2)
  }
  try {
    const { ok } = await migrate({ sqlitePath, url, schema: val('--schema'), replace: flag('--replace'), checkOnly: flag('--check-only') })
    console.log(ok ? '\nГотово: данные перенесены и сверены.' : '\nЕсть расхождения.')
    process.exit(ok ? 0 : 1)
  } catch (e) {
    console.error('Ошибка: ' + e.message)
    process.exit(1)
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
