/**
 * Прогресс владельца в базе. Сайт шлёт короткие «действия» (ответ, профиль, настройки, сброс, импорт) на POST /api/ops,
 * сервер раскладывает их по таблицам answers / words / days / meta, а GET /api/progress собирает из них тот же объект,
 * который сайт использовал раньше. Правила (что считается выученным, как растёт серия) повторяют сайт: см. tests/parity.test.mjs.
 */
import { BadRequestException, Injectable } from '@nestjs/common'
import { Db } from '../db/db.service'
import { pruneImages } from '../images/images.service'

/** Слово считается выученным после стольких верных ответов подряд. */
const KNOWN_STREAK = 3
const GOALS = [10, 20, 50]
const LOG_LIMIT = 300
const MAX_OPS = 500
const DAY = /^\d{4}-\d{2}-\d{2}$/

export interface Profile {
  name: string
  avatar: string
  /** id картинки из раздела «Картинки» для шапки кабинета; пусто — без обложки */
  cover: string
}
export interface Settings {
  goal: number
  cats: string[]
  gameCats: Record<string, number> | null
  /** закладки: «w:слово» и «g:id правила» */
  marks: string[]
}

const bad = (msg: string): never => {
  throw new BadRequestException({ error: msg })
}
const str = (v: unknown, max: number) => (typeof v === 'string' && v.length <= max ? v : bad('invalid op'))
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : bad('invalid op'))

const DEFAULT_PROFILE: Profile = { name: '', avatar: '🌸', cover: '' }
const IMAGE_ID = /^[a-f0-9]{16}$/
/** За одно действие таймера можно записать не больше часа. */
const MAX_TIME_OP = 3600
const DEFAULT_SETTINGS: Settings = { goal: 20, cats: [], gameCats: null, marks: [] }
const MARK = /^[wg]:.{1,40}$/
const MAX_MARKS = 500
const MOOD_DAYS = 400
const MOODS = ['easy', 'ok', 'hard'] as const

@Injectable()
export class ProgressService {
  constructor(private readonly db: Db) {}

  private json<T>(key: string, fallback: T): T {
    try {
      const raw = this.db.getMeta(key)
      return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
    } catch {
      return fallback
    }
  }

  /** Весь прогресс одним объектом, как его ждёт сайт (поле v: 1). */
  read() {
    const days: Record<string, number> = {}
    const all: Record<string, number> = {}
    for (const r of this.db.all<{ day: string; ok: number; total: number }>('SELECT day, ok, total FROM days')) {
      days[r.day] = r.ok
      all[r.day] = r.total
    }
    const time: Record<string, number> = {}
    for (const r of this.db.all<{ day: string; seconds: number }>('SELECT day, seconds FROM study_time')) time[r.day] = r.seconds
    const words: Record<string, { ok: number; bad: number; streak: number; last: number; kd?: number }> = {}
    for (const r of this.db.all<{ word: string; ok: number; bad: number; streak: number; last: number; kd: number | null }>('SELECT * FROM words')) {
      words[r.word] = { ok: r.ok, bad: r.bad, streak: r.streak, last: r.last, ...(r.kd ? { kd: r.kd } : {}) }
    }
    const sources: Record<string, { ok: number; bad: number }> = {}
    for (const r of this.db.all<{ source: string; ok: number; bad: number }>(
      'SELECT source, SUM(ok) AS ok, SUM(1 - ok) AS bad FROM answers GROUP BY source',
    )) {
      sources[r.source] = { ok: r.ok, bad: r.bad }
    }
    const log = this.db
      .all<{ t: number; word: string | null; ok: number; source: string }>('SELECT t, word, ok, source FROM answers ORDER BY id DESC LIMIT ?', LOG_LIMIT)
      .map(r => ({ t: r.t, w: r.word, ok: !!r.ok, s: r.source }))
    return {
      v: 1,
      updated: Number(this.db.getMeta('updated') ?? 0),
      xp: Number(this.db.getMeta('xp') ?? 0),
      days,
      all,
      time,
      words,
      sources,
      log,
      moods: this.json<Record<string, number[]>>('moods', {}),
      profile: this.json<Profile>('profile', DEFAULT_PROFILE),
      settings: { ...DEFAULT_SETTINGS, ...this.json<Partial<Settings>>('settings', {}) },
    }
  }

  /** Применяет пачку действий по порядку; если хоть одно неверное, не применяется ничего (400). */
  apply(body: unknown) {
    const ops = (body as { ops?: unknown })?.ops
    if (!Array.isArray(ops) || ops.length > MAX_OPS) bad('invalid ops')
    this.db.tx(() => {
      for (const op of ops as Record<string, unknown>[]) this.one(op)
      this.db.setMeta('updated', String(Date.now()))
    })
    pruneImages(this.db) // старая обложка удаляется через час после замены
    return { ok: true, applied: (ops as unknown[]).length }
  }

  private one(op: Record<string, unknown>) {
    switch (op?.type) {
      case 'answer':
        return this.answer(op)
      case 'reset':
        return this.reset()
      case 'profile':
        return this.profile(op)
      case 'settings':
        return this.settings(op)
      case 'time':
        return this.time(op)
      case 'mood':
        return this.mood(op)
      case 'import':
        return this.import(op.data)
      default:
        return bad('unknown op')
    }
  }

  /** Один ответ: строка в answers, статистика слова, счётчик дня и очки. */
  private answer(op: Record<string, unknown>) {
    const t = int(op.t, 0, Number.MAX_SAFE_INTEGER)
    const day = typeof op.day === 'string' && DAY.test(op.day) ? op.day : bad('invalid op')
    const word = op.word == null ? null : str(op.word, 100)
    const ok = typeof op.ok === 'boolean' ? op.ok : bad('invalid op')
    const source = str(op.source, 20) || bad('invalid op')
    const mode = op.mode == null ? '' : str(op.mode, 30)
    const xp = ok ? (op.xp == null ? 10 : int(op.xp, 0, 1000)) : 0

    this.db.run('INSERT INTO answers (t, word, ok, source, mode, xp) VALUES (?, ?, ?, ?, ?, ?)', t, word, ok ? 1 : 0, source, mode, xp)
    if (word) {
      const w = this.db.get<{ streak: number; kd: number | null }>('SELECT streak, kd FROM words WHERE word = ?', word)
      if (!w) this.db.run('INSERT INTO words (word, ok, bad, streak, last) VALUES (?, 0, 0, 0, 0)', word)
      const streak = ok ? (w?.streak ?? 0) + 1 : 0
      const kd = ok && streak >= KNOWN_STREAK && !w?.kd ? t : (w?.kd ?? null)
      this.db.run('UPDATE words SET ok = ok + ?, bad = bad + ?, streak = ?, last = ?, kd = ? WHERE word = ?', ok ? 1 : 0, ok ? 0 : 1, streak, t, kd, word)
    }
    this.db.run(
      'INSERT INTO days (day, ok, total) VALUES (?, ?, 1) ON CONFLICT(day) DO UPDATE SET ok = ok + excluded.ok, total = total + 1',
      day,
      ok ? 1 : 0,
    )
    if (xp) this.db.setMeta('xp', String(Number(this.db.getMeta('xp') ?? 0) + xp))
  }

  /** Сброс: ответы, слова, дни и очки обнуляются; профиль и настройки остаются. */
  private reset() {
    this.db.run('DELETE FROM answers')
    this.db.run('DELETE FROM words')
    this.db.run('DELETE FROM days')
    this.db.run('DELETE FROM study_time')
    this.db.setMeta('xp', '0')
    this.db.setMeta('moods', '{}')
  }

  /** Секунды занятий за день (таймер на сайте): прибавляются к дню. */
  private time(op: Record<string, unknown>) {
    const day = typeof op.day === 'string' && DAY.test(op.day) ? op.day : bad('invalid op')
    const seconds = int(op.seconds, 1, MAX_TIME_OP)
    this.db.run('INSERT INTO study_time (day, seconds) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET seconds = seconds + excluded.seconds', day, seconds)
  }

  /** Настроение занятия: «легко / нормально / тяжело» прибавляется к счётчикам дня; хранятся последние MOOD_DAYS дней. */
  private mood(op: Record<string, unknown>) {
    const day = typeof op.day === 'string' && DAY.test(op.day) ? op.day : bad('invalid op')
    const i = MOODS.indexOf(op.mood as (typeof MOODS)[number])
    if (i < 0) bad('invalid op')
    const cur = this.json<Record<string, number[]>>('moods', {})
    const row = cur[day] ?? [0, 0, 0]
    row[i] = Math.min(1000, (row[i] ?? 0) + 1)
    cur[day] = row
    const keep = Object.keys(cur).sort().slice(-MOOD_DAYS)
    this.db.setMeta('moods', JSON.stringify(Object.fromEntries(keep.map(k => [k, cur[k]]))))
  }

  private profile(op: Record<string, unknown>) {
    const cur = this.json<Profile>('profile', DEFAULT_PROFILE)
    if (op.name !== undefined) cur.name = str(op.name, 24)
    if (op.avatar !== undefined) cur.avatar = str(op.avatar, 60_000) || cur.avatar
    if (op.cover !== undefined) {
      const cover = str(op.cover, 40)
      cur.cover = cover === '' || IMAGE_ID.test(cover) ? cover : bad('invalid op')
    }
    this.db.setMeta('profile', JSON.stringify(cur))
  }

  private settings(op: Record<string, unknown>) {
    const cur = this.json<Settings>('settings', DEFAULT_SETTINGS)
    if (op.goal !== undefined) cur.goal = GOALS.includes(op.goal as number) ? (op.goal as number) : bad('invalid goal')
    if (op.cats !== undefined) {
      if (!Array.isArray(op.cats) || op.cats.length > 30) bad('invalid cats')
      cur.cats = (op.cats as unknown[]).map(c => str(c, 40))
    }
    if (op.gameCats !== undefined) {
      const g = op.gameCats as Record<string, unknown> | null
      if (g === null) cur.gameCats = null
      else if (typeof g === 'object' && !Array.isArray(g) && Object.keys(g).length <= 30) {
        cur.gameCats = Object.fromEntries(Object.entries(g).map(([k, v]) => [str(k, 10), int(v, 0, 1)]))
      } else bad('invalid gameCats')
    }
    if (op.marks !== undefined) {
      if (!Array.isArray(op.marks) || op.marks.length > MAX_MARKS) bad('invalid marks')
      const list = (op.marks as unknown[]).map(m => (typeof m === 'string' && MARK.test(m) ? m : bad('invalid marks')))
      cur.marks = [...new Set(list)]
    }
    this.db.setMeta('settings', JSON.stringify(cur))
  }

  /** Загрузка копии: слова, дни, очки, профиль и настройки заменяются. Журнал ответов и источники из копии не восстанавливаются. */
  private import(data: unknown) {
    const d = data as Partial<ReturnType<ProgressService['read']>> | null
    if (!d || typeof d !== 'object' || d.v !== 1) bad('invalid import')
    const words = Object.entries(d!.words ?? {})
    const days = Object.entries(d!.days ?? {})
    if (words.length > 5000 || days.length > 5000) bad('invalid import')
    this.reset()
    for (const [word, w] of words) {
      const s = w as { ok?: number; bad?: number; streak?: number; last?: number; kd?: number }
      this.db.run(
        'INSERT INTO words (word, ok, bad, streak, last, kd) VALUES (?, ?, ?, ?, ?, ?)',
        str(word, 100),
        int(s.ok ?? 0, 0, 1e9),
        int(s.bad ?? 0, 0, 1e9),
        int(s.streak ?? 0, 0, 1e9),
        int(s.last ?? 0, 0, Number.MAX_SAFE_INTEGER),
        s.kd ? int(s.kd, 0, Number.MAX_SAFE_INTEGER) : null,
      )
    }
    for (const [day, ok] of days) {
      if (!DAY.test(day)) bad('invalid import')
      const total = Math.max(Number(d!.all?.[day] ?? 0), Number(ok))
      this.db.run('INSERT INTO days (day, ok, total) VALUES (?, ?, ?)', day, int(Number(ok), 0, 1e9), int(total, 0, 1e9))
    }
    for (const [day, sec] of Object.entries(d!.time ?? {})) {
      if (!DAY.test(day)) bad('invalid import')
      this.db.run('INSERT INTO study_time (day, seconds) VALUES (?, ?)', day, int(Number(sec), 0, 1e9))
    }
    this.db.setMeta('xp', String(int(Number(d!.xp ?? 0), 0, 1e12)))
    const moods = d!.moods && typeof d!.moods === 'object' && !Array.isArray(d!.moods) ? Object.entries(d!.moods as Record<string, unknown>) : []
    if (moods.length > MOOD_DAYS) bad('invalid import')
    this.db.setMeta(
      'moods',
      JSON.stringify(
        Object.fromEntries(
          moods.map(([day, v]) => {
            if (!DAY.test(day) || !Array.isArray(v)) bad('invalid import')
            return [day, [0, 1, 2].map(i => int(Number((v as unknown[])[i] ?? 0), 0, 1000))]
          }),
        ),
      ),
    )
    if (d!.profile) this.profile(d!.profile as unknown as Record<string, unknown>)
    if (d!.settings) this.settings(d!.settings as unknown as Record<string, unknown>)
  }
}
