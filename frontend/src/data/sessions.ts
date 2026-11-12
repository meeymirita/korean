/** Ответ из журнала (`GET /api/report/answers`). */
export interface AnswerItem {
  t: number
  w: string | null
  ok: boolean
  source: string
  mode: string
  /** q — вопрос, a — верный ответ, y — что выбрано, n — как отвечал, r — номер раунда */
  d?: { q?: string; a?: string; y?: string; n?: string; r?: string }
}

/** Одно занятие: раунд или серия одного режима. */
export interface Session {
  source: string
  mode: string
  start: number
  end: number
  ok: number
  bad: number
  /** ответы по порядку, первый сверху */
  items: AnswerItem[]
}

/** Перерыв, после которого начинается новое занятие (для ответов без номера раунда: старые записи, игра, «Сегодня»). */
export const SESSION_GAP = 2 * 60_000

/**
 * Делит ответы на занятия. Ответы с номером раунда (`d.r`) собираются по нему: два раунда подряд не сливаются, а долгий раунд не рвётся.
 * Остальные делятся по перерыву: тот же раздел и режим, между ответами не больше `gap`. Новые занятия сверху.
 */
export function groupSessions(items: AnswerItem[], gap = SESSION_GAP): Session[] {
  const out: Session[] = []
  const byRound = new Map<string, Session>()
  let cur: Session | undefined
  const add = (s: Session, a: AnswerItem) => {
    s.items.push(a)
    s.end = a.t
    if (a.ok) s.ok++
    else s.bad++
  }
  const open = (a: AnswerItem): Session => {
    const s: Session = { source: a.source, mode: a.mode, start: a.t, end: a.t, ok: 0, bad: 0, items: [] }
    out.push(s)
    return s
  }
  for (const a of [...items].sort((x, y) => x.t - y.t)) {
    const r = a.d?.r
    if (r) {
      const key = `${a.source}|${a.mode}|${r}`
      let s = byRound.get(key)
      if (!s) byRound.set(key, (s = open(a)))
      add(s, a)
      continue
    }
    if (!cur || cur.source !== a.source || cur.mode !== a.mode || a.t - cur.end > gap) cur = open(a)
    add(cur, a)
  }
  return out.sort((x, y) => y.start - x.start)
}

/** «3 мин 20 с», «45 с». */
export function lasted(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)} мин ${String(s % 60).padStart(2, '0')} с` : `${s} с`
}
