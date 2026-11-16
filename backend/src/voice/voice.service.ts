/** Голосовой собеседник: выдаёт браузеру временный ключ OpenAI Realtime, считает минуты за сутки и хранит расшифровки разговоров (звук не хранится). */
import { BadGatewayException, BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { VOICE_BASE, VOICE_COST_PER_MIN, VOICE_DAILY_MINUTES, VOICE_KEY, VOICE_MAX_MESSAGES, VOICE_MAX_SESSION_MIN, VOICE_MODEL, VOICE_TZ, VOICE_VOICE } from '../config.js'
import { Db } from '../db/db.service.js'
import { logError } from '../log.js'
import { cleanRole, cleanText, costOf, countedSeconds, dayKey, secretBody } from './voice.util.js'

const MAX_SEC = VOICE_MAX_SESSION_MIN * 60
const DAY_SEC = VOICE_DAILY_MINUTES * 60
/** Временный ключ нужен только чтобы начать соединение: две минуты. */
const SECRET_TTL = 120
/** Постоянный безличный признак ученика для OpenAI (рекомендуют передавать: так они могут отличить одного пользователя от всей организации). */
const SAFETY_ID = createHash('sha256').update('urimal-owner').digest('hex').slice(0, 32)
const bad = (error: string) => new BadRequestException({ error })

@Injectable()
export class VoiceService {
  constructor(private readonly db: Db) {}

  /** Секунды разговоров за сегодня: у неоконченного считаются часы от старта, но не больше предела (вкладку могли закрыть, не закончив). */
  private async usedToday(now = Date.now()): Promise<number> {
    const rows = await (await this.db.orm()).voiceSession.findMany({ where: { day: dayKey(now, VOICE_TZ) }, select: { started: true, ended: true, seconds: true } })
    return rows.reduce((sum, r) => sum + (r.ended === null ? countedSeconds(Number(r.started), now, MAX_SEC) : r.seconds), 0)
  }

  async status() {
    const used = await this.usedToday()
    return this.statusOf(used)
  }

  private statusOf(used: number) {
    return {
      configured: !!VOICE_KEY,
      model: VOICE_MODEL,
      limitSec: DAY_SEC,
      maxSessionSec: MAX_SEC,
      usedSec: Math.min(used, DAY_SEC),
      leftSec: Math.max(0, DAY_SEC - used),
      costPerMin: VOICE_COST_PER_MIN,
      costToday: costOf(used, VOICE_COST_PER_MIN),
    }
  }

  /** Начать разговор: проверить остаток минут, получить у OpenAI временный ключ и завести запись разговора. */
  async start() {
    if (!VOICE_KEY) throw new ServiceUnavailableException({ error: 'voice not configured' })
    const now = Date.now()
    const used = await this.usedToday(now)
    const left = DAY_SEC - used
    if (left <= 0) throw new HttpException({ error: 'daily limit', limitSec: DAY_SEC }, 429)
    let res: Response
    try {
      res = await fetch(`${VOICE_BASE}/realtime/client_secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VOICE_KEY}`, 'OpenAI-Safety-Identifier': SAFETY_ID },
        body: JSON.stringify(secretBody({ model: VOICE_MODEL, voice: VOICE_VOICE, ttl: SECRET_TTL })),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      logError('voice: OpenAI недоступен', e)
      throw new BadGatewayException({ error: 'voice service unreachable' })
    }
    if (!res.ok) {
      logError('voice: OpenAI ответил', res.status)
      if (res.status === 401 || res.status === 403) throw new BadGatewayException({ error: 'voice key rejected' })
      if (res.status === 429) throw new HttpException({ error: 'rate limit' }, 429)
      throw new BadGatewayException({ error: `voice service ${res.status}` })
    }
    const data = (await res.json().catch(() => null)) as { value?: unknown } | null
    const secret = typeof data?.value === 'string' ? data.value : ''
    if (!secret) throw new BadGatewayException({ error: 'empty secret' })
    const id = randomBytes(8).toString('hex')
    await (await this.db.orm()).voiceSession.create({ data: { id, day: dayKey(now, VOICE_TZ), started: BigInt(now), model: VOICE_MODEL } })
    return { id, secret, callsUrl: `${VOICE_BASE}/realtime/calls`, maxSec: Math.min(MAX_SEC, left), ...this.statusOf(used) }
  }

  private async open(id: string) {
    const row = await (await this.db.orm()).voiceSession.findUnique({ where: { id } })
    if (!row) throw new NotFoundException({ error: 'not found' })
    return row
  }

  /** Реплика разговора (расшифровка речи ученика или ответа). Пустые и лишние сверх предела пропускаются. */
  async addMessage(id: string, body: Record<string, unknown>) {
    const role = cleanRole(body?.role)
    const text = cleanText(body?.text)
    if (!role || !text) throw bad('invalid message')
    await this.open(id)
    const db = await this.db.orm()
    if ((await db.voiceMessage.count({ where: { session: id } })) >= VOICE_MAX_MESSAGES) throw bad('too many messages')
    await db.voiceMessage.create({ data: { session: id, t: BigInt(Date.now()), role, text } })
    return { ok: true }
  }

  /** Закончить разговор: секунды считает сервер по своим часам. Повторный вызов ничего не меняет. */
  async end(id: string) {
    const row = await this.open(id)
    const now = Date.now()
    if (row.ended === null) {
      const seconds = countedSeconds(Number(row.started), now, MAX_SEC)
      await (await this.db.orm()).voiceSession.update({ where: { id }, data: { ended: BigInt(now), seconds } })
    }
    return this.status()
  }

  /** Список разговоров, новые сверху: с числом реплик и началом первой фразы ученика. */
  async list() {
    const db = await this.db.orm()
    const sessions = await db.voiceSession.findMany({ orderBy: { started: 'desc' }, take: 100 })
    const now = Date.now()
    const out = []
    for (const s of sessions) {
      const [count, first] = await Promise.all([db.voiceMessage.count({ where: { session: s.id } }), db.voiceMessage.findFirst({ where: { session: s.id, role: 'user' }, orderBy: { id: 'asc' }, select: { text: true } })])
      const seconds = s.ended === null ? countedSeconds(Number(s.started), now, MAX_SEC) : s.seconds
      out.push({ id: s.id, started: Number(s.started), seconds, messages: count, preview: first?.text.slice(0, 80) ?? '', live: s.ended === null && now - Number(s.started) < MAX_SEC * 1000 })
    }
    return { sessions: out }
  }

  async get(id: string) {
    const s = await this.open(id)
    const rows = await (await this.db.orm()).voiceMessage.findMany({ where: { session: id }, orderBy: { id: 'asc' } })
    return { id: s.id, started: Number(s.started), seconds: s.ended === null ? countedSeconds(Number(s.started), Date.now(), MAX_SEC) : s.seconds, messages: rows.map(m => ({ id: Number(m.id), t: Number(m.t), role: m.role, text: m.text })) }
  }

  /** Удалить разговор и его расшифровку. Минуты за сегодня при этом не возвращаются: удаляется текст, а не факт разговора. */
  async remove(id: string) {
    const row = await this.open(id)
    await this.db.tx(async () => {
      const db = await this.db.orm()
      await db.voiceMessage.deleteMany({ where: { session: id } })
      // запись о длительности остаётся за сегодня, чтобы лимит нельзя было обойти удалением
      if (row.day === dayKey(Date.now(), VOICE_TZ)) await db.voiceSession.update({ where: { id }, data: row.ended === null ? { ended: BigInt(Date.now()), seconds: countedSeconds(Number(row.started), Date.now(), MAX_SEC) } : {} })
      else await db.voiceSession.delete({ where: { id } })
    })
    return { ok: true }
  }
}
