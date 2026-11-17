/** Помощник-чат: пересылает вопросы в OpenRouter и возвращает ответ. Чаты и их сообщения хранятся в базе (таблицы chat_convs и chat_msgs). */
import { BadGatewayException, BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { CHAT_DAILY_LIMIT, CHAT_MAX_HISTORY, CHAT_MAX_SAVED, CHAT_MAX_TEXT, CHAT_BASE, CHAT_KEY, CHAT_MODEL } from '../config.js'
import { Db } from '../db/db.service.js'
import { SYSTEM_PROMPT } from './prompt.js'

export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
}

const bad = (error: string) => new BadRequestException({ error })

/** Проверяет присланную переписку и оставляет последние сообщения. Последнее должно быть вопросом. */
export function cleanMessages(v: unknown): ChatMsg[] {
  if (!Array.isArray(v) || !v.length || v.length > 100) throw bad('invalid messages')
  const out: ChatMsg[] = []
  for (const m of v) {
    const { role, text } = (m ?? {}) as { role?: unknown; text?: unknown }
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string') throw bad('invalid messages')
    const t = text.trim()
    if (!t) throw bad('empty message')
    if (t.length > CHAT_MAX_TEXT) throw bad('message too long')
    out.push({ role, text: t })
  }
  if (out[out.length - 1]!.role !== 'user') throw bad('last message must be from user')
  const tail = out.slice(-CHAT_MAX_HISTORY)
  // модель ждёт, что переписка начинается с вопроса
  while (tail.length > 1 && tail[0]!.role !== 'user') tail.shift()
  return tail
}

/** Куда сохранять: ничего (старый вызов без чата), 'new' (завести чат) или номер чата. */
export function cleanConv(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (v === 'new' || (typeof v === 'string' && /^[0-9a-f]{16}$/.test(v))) return v
  throw bad('invalid conv')
}

@Injectable()
export class ChatService {
  constructor(private readonly db: Db) {}

  private day = ''
  private used = 0

  /** Счётчик вопросов за сутки: хранится в памяти, после перезапуска службы начинается заново. */
  private roll() {
    const today = new Date().toISOString().slice(0, 10)
    if (today !== this.day) {
      this.day = today
      this.used = 0
    }
  }

  private take(): number {
    this.roll()
    if (this.used >= CHAT_DAILY_LIMIT) throw new HttpException({ error: 'daily limit', limit: CHAT_DAILY_LIMIT }, 429)
    this.used++
    return CHAT_DAILY_LIMIT - this.used
  }

  status() {
    this.roll()
    return { configured: !!CHAT_KEY, model: CHAT_MODEL, limit: CHAT_DAILY_LIMIT, left: CHAT_DAILY_LIMIT - this.used }
  }

  async ask(body: Record<string, unknown>) {
    const messages = cleanMessages(body?.messages)
    const conv = cleanConv(body?.conv)
    if (!CHAT_KEY) throw new ServiceUnavailableException({ error: 'chat not configured' })
    // чат проверяем до обращения к модели: вопрос не тратится, если чата нет или он переполнен
    if (conv && conv !== 'new') await this.checkRoom(conv)
    const left = this.take()
    // бесплатный маршрутизатор иногда отдаёт пустой ответ: пробуем ещё раз (вопрос в счётчике один раз)
    let reply = ''
    for (let attempt = 0; attempt < 2 && !reply; attempt++) reply = await this.once(messages)
    if (!reply) {
      this.used--
      throw new BadGatewayException({ error: 'empty answer' })
    }
    const saved = conv ? await this.save(conv, messages[messages.length - 1]!.text, reply) : undefined
    return { reply, left, ...(saved ? { conv: saved } : {}) }
  }

  private async checkRoom(id: string) {
    const db = await this.db.orm()
    if (!(await db.chatConv.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'not found' })
    if ((await db.chatMsg.count({ where: { conv: id } })) >= CHAT_MAX_SAVED) throw bad('chat too long')
  }

  /** Записывает вопрос и ответ в чат (для 'new' заводит его); возвращает номер чата. */
  private async save(conv: string, question: string, reply: string): Promise<string> {
    const now = Date.now()
    let id = conv
    await this.db.tx(async () => {
      const db = await this.db.orm()
      if (conv === 'new') {
        id = randomBytes(8).toString('hex')
        await db.chatConv.create({ data: { id, started: BigInt(now), updated: BigInt(now), title: question.replace(/\s+/g, ' ').slice(0, 80) } })
      } else {
        await db.chatConv.update({ where: { id }, data: { updated: BigInt(now) } })
      }
      await db.chatMsg.createMany({ data: [{ conv: id, t: BigInt(now), role: 'user', text: question }, { conv: id, t: BigInt(now + 1), role: 'assistant', text: reply }] })
    })
    return id
  }

  /** Список чатов, новые сверху: заголовок (начало первого вопроса), время и число сообщений. */
  async list() {
    const db = await this.db.orm()
    const convs = await db.chatConv.findMany({ orderBy: { updated: 'desc' }, take: 200 })
    const counts = await db.chatMsg.groupBy({ by: ['conv'], where: { conv: { in: convs.map(c => c.id) } }, _count: { _all: true } })
    const n = new Map(counts.map(c => [c.conv, c._count._all]))
    return { conversations: convs.map(c => ({ id: c.id, title: c.title, started: Number(c.started), updated: Number(c.updated), messages: n.get(c.id) ?? 0 })) }
  }

  async get(id: string) {
    const db = await this.db.orm()
    const c = await db.chatConv.findUnique({ where: { id } })
    if (!c) throw new NotFoundException({ error: 'not found' })
    const rows = await db.chatMsg.findMany({ where: { conv: id }, orderBy: { id: 'asc' } })
    return { id: c.id, title: c.title, started: Number(c.started), updated: Number(c.updated), messages: rows.map(m => ({ role: m.role, text: m.text, t: Number(m.t) })) }
  }

  async remove(id: string) {
    const db = await this.db.orm()
    if (!(await db.chatConv.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'not found' })
    await this.db.tx(async () => {
      const tx = await this.db.orm()
      await tx.chatMsg.deleteMany({ where: { conv: id } })
      await tx.chatConv.delete({ where: { id } })
    })
    return { ok: true }
  }

  /** Один запрос к модели; пустая строка, если модель ничего не написала. */
  private async once(messages: ChatMsg[]): Promise<string> {
    let res: Response
    try {
      res = await fetch(`${CHAT_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CHAT_KEY}`, 'HTTP-Referer': 'https://korean.meeymirita.ru', 'X-Title': 'Urimal' },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.map(m => ({ role: m.role, content: m.text }))],
          temperature: 0.4,
          max_tokens: 1200,
        }),
        signal: AbortSignal.timeout(40_000),
      })
    } catch {
      this.used--
      throw new BadGatewayException({ error: 'chat service unreachable' })
    }
    if (!res.ok) {
      this.used--
      if (res.status === 429) throw new HttpException({ error: 'rate limit' }, 429)
      throw new BadGatewayException({ error: `chat service ${res.status}` })
    }
    const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null
    const c = data?.choices?.[0]?.message?.content
    const reply = typeof c === 'string' ? c.trim() : ''
    return reply
  }
}
