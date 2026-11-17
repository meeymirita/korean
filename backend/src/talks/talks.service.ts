/** Общая история разговоров: чаты с помощником и голосовые разговоры в одном списке, с поиском по тексту. Читает таблицы chat_* и voice_*. */
import { Injectable } from '@nestjs/common'
import { Db } from '../db/db.service.js'

export interface Talk {
  kind: 'chat' | 'voice'
  id: string
  /** название: у чата начало первого вопроса, у голоса начало первой фразы ученика */
  title: string
  /** время последней активности, мс */
  when: number
  messages: number
  /** при поиске: кусок текста вокруг найденного и сколько сообщений совпало */
  snippet?: string
  matches?: number
}

const MIN_Q = 2
const MAX_Q = 80
/** Кусок текста вокруг первого совпадения (по 45 знаков с каждой стороны). */
export function snippetOf(text: string, q: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = flat.toLowerCase().indexOf(q.toLowerCase())
  if (at < 0) return flat.slice(0, 90)
  const from = Math.max(0, at - 45)
  const to = Math.min(flat.length, at + q.length + 45)
  return `${from > 0 ? '…' : ''}${flat.slice(from, to)}${to < flat.length ? '…' : ''}`
}

@Injectable()
export class TalksService {
  constructor(private readonly db: Db) {}

  /** Чистый запрос поиска: строка до 80 знаков; короче двух знаков поиска нет (весь список). */
  static cleanQuery(v: unknown): string {
    const q = typeof v === 'string' ? v.trim().slice(0, MAX_Q) : ''
    return q.length >= MIN_Q ? q : ''
  }

  async list(raw: unknown) {
    const q = TalksService.cleanQuery(raw)
    return { q, talks: q ? await this.search(q) : await this.recent() }
  }

  private async recent(): Promise<Talk[]> {
    const db = await this.db.orm()
    const [convs, sessions] = await Promise.all([db.chatConv.findMany({ orderBy: { updated: 'desc' }, take: 100 }), db.voiceSession.findMany({ orderBy: { started: 'desc' }, take: 100 })])
    const [cc, vc, firsts] = await Promise.all([
      db.chatMsg.groupBy({ by: ['conv'], where: { conv: { in: convs.map(c => c.id) } }, _count: { _all: true } }),
      db.voiceMessage.groupBy({ by: ['session'], where: { session: { in: sessions.map(s => s.id) } }, _count: { _all: true } }),
      db.voiceMessage.findMany({ where: { session: { in: sessions.map(s => s.id) }, role: 'user' }, orderBy: { id: 'asc' }, select: { session: true, text: true } }),
    ])
    const chatN = new Map(cc.map(c => [c.conv, c._count._all]))
    const voiceN = new Map(vc.map(c => [c.session, c._count._all]))
    const first = new Map<string, string>()
    for (const f of firsts) if (!first.has(f.session)) first.set(f.session, f.text)
    const out: Talk[] = [
      ...convs.map(c => ({ kind: 'chat' as const, id: c.id, title: c.title, when: Number(c.updated), messages: chatN.get(c.id) ?? 0 })),
      // разговор голоса без единой реплики (не успели ничего сказать) в список не берём
      ...sessions.filter(s => (voiceN.get(s.id) ?? 0) > 0).map(s => ({ kind: 'voice' as const, id: s.id, title: (first.get(s.id) ?? '').slice(0, 80), when: Number(s.ended ?? s.started), messages: voiceN.get(s.id) ?? 0 })),
    ]
    return out.sort((a, b) => b.when - a.when).slice(0, 150)
  }

  private async search(q: string): Promise<Talk[]> {
    const db = await this.db.orm()
    const where = { text: { contains: q, mode: 'insensitive' as const } }
    const [cm, vm, titled] = await Promise.all([
      db.chatMsg.findMany({ where, orderBy: { id: 'desc' }, take: 400, select: { conv: true, text: true, t: true } }),
      db.voiceMessage.findMany({ where, orderBy: { id: 'desc' }, take: 400, select: { session: true, text: true, t: true } }),
      db.chatConv.findMany({ where: { title: { contains: q, mode: 'insensitive' } }, take: 100 }),
    ])
    const hits = new Map<string, { kind: 'chat' | 'voice'; id: string; snippet: string; when: number; matches: number }>()
    const add = (kind: 'chat' | 'voice', id: string, text: string, t: bigint) => {
      const key = `${kind}:${id}`
      const h = hits.get(key)
      if (h) h.matches++
      else hits.set(key, { kind, id, snippet: snippetOf(text, q), when: Number(t), matches: 1 })
    }
    for (const m of cm) add('chat', m.conv, m.text, m.t)
    for (const m of vm) add('voice', m.session, m.text, m.t)
    for (const c of titled) if (!hits.has(`chat:${c.id}`)) hits.set(`chat:${c.id}`, { kind: 'chat', id: c.id, snippet: snippetOf(c.title, q), when: Number(c.updated), matches: 1 })
    const chatIds = [...hits.values()].filter(h => h.kind === 'chat').map(h => h.id)
    const voiceIds = [...hits.values()].filter(h => h.kind === 'voice').map(h => h.id)
    const [convs, sessions, cc, vc, firsts] = await Promise.all([
      db.chatConv.findMany({ where: { id: { in: chatIds } } }),
      db.voiceSession.findMany({ where: { id: { in: voiceIds } } }),
      db.chatMsg.groupBy({ by: ['conv'], where: { conv: { in: chatIds } }, _count: { _all: true } }),
      db.voiceMessage.groupBy({ by: ['session'], where: { session: { in: voiceIds } }, _count: { _all: true } }),
      db.voiceMessage.findMany({ where: { session: { in: voiceIds }, role: 'user' }, orderBy: { id: 'asc' }, select: { session: true, text: true } }),
    ])
    const title = new Map(convs.map(c => [c.id, c.title]))
    const ended = new Map(sessions.map(s => [s.id, Number(s.ended ?? s.started)]))
    const n = new Map<string, number>([...cc.map(c => [`chat:${c.conv}`, c._count._all] as const), ...vc.map(c => [`voice:${c.session}`, c._count._all] as const)])
    const first = new Map<string, string>()
    for (const f of firsts) if (!first.has(f.session)) first.set(f.session, f.text)
    const out: Talk[] = []
    for (const [key, h] of hits) {
      // чат или разговор удалили, а сообщения остались: не показываем
      if (h.kind === 'chat' && !title.has(h.id)) continue
      if (h.kind === 'voice' && !ended.has(h.id)) continue
      out.push({ kind: h.kind, id: h.id, title: h.kind === 'chat' ? title.get(h.id)! : (first.get(h.id) ?? '').slice(0, 80), when: h.kind === 'voice' ? ended.get(h.id)! : h.when, messages: n.get(key) ?? 0, snippet: h.snippet, matches: h.matches })
    }
    return out.sort((a, b) => b.when - a.when).slice(0, 100)
  }
}
