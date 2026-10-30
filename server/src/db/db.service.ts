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

-- время занятий по дням (секунды): его считает таймер на сайте
CREATE TABLE IF NOT EXISTS study_time (
  day TEXT PRIMARY KEY,        -- ГГГГ-ММ-ДД
  seconds INTEGER NOT NULL DEFAULT 0
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
  images TEXT NOT NULL DEFAULT '[]',   -- id картинок заметки (JSON-список)
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);

-- сами файлы лежат в DATA_DIR/uploads, здесь описание
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,          -- исходное имя файла
  caption TEXT NOT NULL DEFAULT '',     -- название
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'gallery', -- gallery / note / cover
  mime TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

-- записи календаря: занятие, созвон, домашка; к записи прикрепляются файлы
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,           -- ГГГГ-ММ-ДД
  time TEXT NOT NULL DEFAULT '',  -- ЧЧ:ММ или пусто
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_day ON plans (day);

-- файлы записей лежат в DATA_DIR/docs, здесь описание
CREATE TABLE IF NOT EXISTS plan_files (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  thumb INTEGER NOT NULL DEFAULT 0,   -- 1, если у картинки есть миниатюра
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plan_files_plan ON plan_files (plan_id);

-- сохранённые наборы «Сегодня»: слова, правило, задания и ответы одним снимком
CREATE TABLE IF NOT EXISTS today_sets (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,           -- ГГГГ-ММ-ДД
  right_n INTEGER NOT NULL,    -- верных ответов
  total_n INTEGER NOT NULL,    -- всего заданий
  data TEXT NOT NULL,          -- снимок набора (JSON)
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS today_sets_created ON today_sets (created);

-- сеансы после двухфакторного входа: хранится только хэш
CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
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
    this.migrate()
  }

  /** Столбцы, добавленные после первой версии базы: у старого файла их ещё нет. */
  private migrate() {
    const has = (table: string, column: string) => this.all<{ name: string }>(`PRAGMA table_info(${table})`).some(c => c.name === column)
    if (!has('images', 'description')) this.sql.exec("ALTER TABLE images ADD COLUMN description TEXT NOT NULL DEFAULT ''")
    if (!has('notes', 'images')) this.sql.exec("ALTER TABLE notes ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
    if (!has('notes', 'tags')) this.sql.exec("ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
    if (!has('plans', 'kind')) this.sql.exec("ALTER TABLE plans ADD COLUMN kind TEXT NOT NULL DEFAULT 'own'")
    if (!has('images', 'tags')) this.sql.exec("ALTER TABLE images ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'")
    if (!has('images', 'kind')) {
      // картинки заметок и обложка кабинета раньше лежали в общем списке: разносим по назначению
      this.sql.exec("ALTER TABLE images ADD COLUMN kind TEXT NOT NULL DEFAULT 'gallery'")
      const used = (sql: string) => this.all<{ images?: string; value?: string }>(sql)
      for (const n of used('SELECT images FROM notes WHERE images IS NOT NULL')) {
        try {
          for (const id of JSON.parse(n.images ?? '[]') as string[]) this.run("UPDATE images SET kind = 'note' WHERE id = ?", id)
        } catch {
          /* битый список: пропускаем */
        }
      }
      try {
        const profile = JSON.parse(used("SELECT value FROM meta WHERE key = 'profile'")[0]?.value ?? '{}') as { cover?: string }
        if (profile.cover) this.run("UPDATE images SET kind = 'cover' WHERE id = ?", profile.cover)
      } catch {
        /* нет профиля */
      }
    }
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
