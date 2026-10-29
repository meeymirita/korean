/**
 * База данных: один файл SQLite (DATA_DIR/app.db), встроенный в Node модуль node:sqlite, обычный SQL без ORM.
 * Все таблицы описаны ниже в SCHEMA: открой этот файл, чтобы понять, что где лежит.
 */
import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { DATA_DIR, DB_FILE } from '../config'

const SCHEMA = `
-- настройки и мелкие значения: xp, профиль, цель дня, служебные метки
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- каждый ответ в играх, тренажёрах, «Сегодня» и повторении отдельной строкой
CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,          -- когда (мс)
  word TEXT,                   -- слово (может быть пусто)
  ok INTEGER NOT NULL,         -- 1 верно, 0 неверно
  source TEXT NOT NULL,        -- game / trainer / today / review
  mode TEXT NOT NULL DEFAULT '', -- режим игры, например build
  xp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS answers_t ON answers (t);

-- статистика по каждому слову
CREATE TABLE IF NOT EXISTS words (
  word TEXT PRIMARY KEY,
  ok INTEGER NOT NULL DEFAULT 0,
  bad INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,  -- верных ответов подряд
  last INTEGER NOT NULL DEFAULT 0,    -- последний ответ (мс)
  kd INTEGER                          -- когда слово впервые стало выученным
);

-- по дням: сколько всего ответов и сколько верных
CREATE TABLE IF NOT EXISTS days (
  day TEXT PRIMARY KEY,        -- ГГГГ-ММ-ДД
  ok INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0
);

-- гостевые токены: сам токен не хранится, только хэш
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);

-- сами файлы лежат в DATA_DIR/uploads, здесь описание
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,          -- исходное имя файла
  caption TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

-- журнал событий: входы, создание и отзыв гостевых токенов, неверные токены
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,
  type TEXT NOT NULL,
  info TEXT NOT NULL DEFAULT ''
);
`

type Param = string | number | bigint | null

@Injectable()
export class Db implements OnModuleDestroy {
  readonly sql: DatabaseSync

  constructor() {
    mkdirSync(DATA_DIR, { recursive: true })
    this.sql = new DatabaseSync(DB_FILE)
    this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;')
    this.sql.exec(SCHEMA)
  }

  all<T = Record<string, unknown>>(query: string, ...params: Param[]): T[] {
    return this.sql.prepare(query).all(...params) as T[]
  }

  get<T = Record<string, unknown>>(query: string, ...params: Param[]): T | undefined {
    return this.sql.prepare(query).get(...params) as T | undefined
  }

  run(query: string, ...params: Param[]) {
    return this.sql.prepare(query).run(...params)
  }

  /** Всё или ничего: если внутри ошибка, изменения откатываются. */
  tx<T>(fn: () => T): T {
    this.sql.exec('BEGIN')
    try {
      const out = fn()
      this.sql.exec('COMMIT')
      return out
    } catch (e) {
      this.sql.exec('ROLLBACK')
      throw e
    }
  }

  getMeta(key: string): string | undefined {
    return this.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value
  }

  setMeta(key: string, value: string) {
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  onModuleDestroy() {
    this.sql.close()
  }
}
