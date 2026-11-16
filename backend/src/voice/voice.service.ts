/** Голосовой собеседник: выдаёт браузеру временный ключ OpenAI Realtime, считает минуты за сутки и хранит расшифровки разговоров (звук не хранится). */
import { BadGatewayException, BadRequestException, HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { EDGE_ENABLED, GEMINI_KEY, GROQ_KEY, VOICE_BASE, VOICE_COST_PER_MIN, VOICE_DAILY_MINUTES, VOICE_KEY, VOICE_MAX_MESSAGES, VOICE_MAX_SESSION_MIN, VOICE_MODEL, VOICE_TZ, VOICE_VOICE } from '../config.js'
import { Db } from '../db/db.service.js'
import { logError } from '../log.js'
import { cleanMessages } from '../chat/chat.service.js'
import { AiError, askInOrder, CHECK_PROMPT, edgeVoice, orderFor, providers, speak, speakEdge, transcribe, TTS_VOICES, ttsVoice } from './ai.js'
import { buildPrompt } from './prompt.js'
import { REVIEW_PROMPT, reviewInput } from './review.js'
import { SCENES, sceneOf } from './scenes.js'
import { cleanRole, cleanText, costOf, countedSeconds, dayKey, secretBody } from './voice.util.js'

/** Разговоры в бесплатном режиме (Groq и браузер, без OpenAI) записываются с этой «моделью» и минуты OpenAI не тратят. */
const FREE_MODEL = 'free'
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
    const rows = await (await this.db.orm()).voiceSession.findMany({ where: { day: dayKey(now, VOICE_TZ), model: { not: FREE_MODEL } }, select: { started: true, ended: true, seconds: true } })
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
      scenes: SCENES.map(x => ({ id: x.id, title: x.title, hint: x.hint })),
      providers: providers().map(p => ({ id: p.id, title: p.title, model: p.model })),
      whisper: !!GROQ_KEY,
      tts: !!GEMINI_KEY,
      edge: EDGE_ENABLED,
      ttsVoices: [...TTS_VOICES],
    }
  }

  /** Начать разговор: проверить остаток минут, получить у OpenAI временный ключ и завести запись разговора. */
  async start(body: Record<string, unknown> = {}) {
    const scene = sceneOf(body?.scene)
    const ptt = body?.ptt === true
    if (body?.free === true) return this.startFree(scene.id)
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
        body: JSON.stringify(secretBody({ model: VOICE_MODEL, voice: VOICE_VOICE, ttl: SECRET_TTL, scene: scene.id, ptt })),
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
    return { id, scene: scene.id, secret, callsUrl: `${VOICE_BASE}/realtime/calls`, maxSec: Math.min(MAX_SEC, left), ...this.statusOf(used) }
  }

  /** Бесплатный разговор: Whisper (Groq) слышит, выбранная модель отвечает, озвучивает браузер. OpenAI не нужен, минуты OpenAI не тратятся. */
  private async startFree(scene: string) {
    if (!GROQ_KEY || !providers().length) throw new ServiceUnavailableException({ error: 'free voice not configured' })
    const now = Date.now()
    const id = randomBytes(8).toString('hex')
    await (await this.db.orm()).voiceSession.create({ data: { id, day: dayKey(now, VOICE_TZ), started: BigInt(now), model: FREE_MODEL } })
    return { id, scene, free: true, maxSec: MAX_SEC, ...this.statusOf(await this.usedToday(now)) }
  }

  /**
   * Ответ текстовой модели на реплики разговора. Выбранная модель отвечает первой, при отказе (лимит, ошибка) пробуем остальных.
   * Проверка: `cross` другая модель читает ответ, `self` та же; в ответе пометка «Проверка: …».
   */
  async ask(body: Record<string, unknown>) {
    const messages = cleanMessages(body?.messages)
    const list = providers()
    if (!list.length) throw new ServiceUnavailableException({ error: 'no models configured' })
    const order = orderFor(body?.provider, list)
    const mode = body?.check === 'cross' || body?.check === 'self' ? body.check : 'none'
    try {
      const answer = await askInOrder(order, [{ role: 'system', content: buildPrompt(body?.scene) }, ...messages.map(m => ({ role: m.role, content: m.text }))])
      let check: { provider: string; text: string } | null = null
      if (mode !== 'none') {
        const other = order.filter(p => p.id !== answer.provider.id)
        const checkers = mode === 'cross' && other.length ? other : [answer.provider]
        const asked = messages[messages.length - 1]!.text
        try {
          const c = await askInOrder(checkers, [{ role: 'system', content: CHECK_PROMPT }, { role: 'user', content: `Вопрос ученика: ${asked}\n\nОтвет репетитора: ${answer.text}` }], { maxTokens: 300, temperature: 0.1 })
          check = { provider: c.provider.title, text: c.text }
        } catch {
          check = null
        }
      }
      return { text: answer.text, provider: answer.provider.title, check, failed: answer.failed }
    } catch (e) {
      throw this.aiHttp(e)
    }
  }

  /** Распознавание речи ученика (запись из браузера в base64, не длиннее нескольких минут). */
  async transcribeAudio(body: Record<string, unknown>) {
    const audio = typeof body?.audio === 'string' ? body.audio : ''
    const mime = typeof body?.mime === 'string' ? body.mime.slice(0, 60) : 'audio/webm'
    if (!audio) throw bad('no audio')
    const buf = Buffer.from(audio, 'base64')
    if (!buf.length || buf.length > 3_000_000) throw bad('audio too large')
    try {
      return { text: await transcribe(buf, mime, { lang: body?.lang }) }
    } catch (e) {
      throw this.aiHttp(e)
    }
  }

  /** Озвучка ответа голосом Gemini: текст без разметки (до 700 знаков) в звук WAV (base64). */
  async speakText(body: Record<string, unknown>) {
    const raw = typeof body?.text === 'string' ? body.text : ''
    const text = raw.replace(/[*_#`]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 700)
    if (!text) throw bad('empty text')
    // engine: gemini | edge | auto (Gemini, а когда его лимит кончился, Edge)
    const engine = body?.engine === 'gemini' || body?.engine === 'edge' ? body.engine : 'auto'
    try {
      if (engine === 'edge' && !EDGE_ENABLED) throw new AiError('озвучка Edge выключена (EDGE_TTS=0)', 503)
      if (engine === 'edge') return this.packSpeech(await speakEdge(text, edgeVoice(body?.edgeVoice)), 'edge')
      if (engine === 'gemini') return this.packSpeech(await speak(text, ttsVoice(body?.voice)), 'gemini')
      try {
        if (!GEMINI_KEY) throw new AiError('нет ключа Gemini', 503)
        return this.packSpeech(await speak(text, ttsVoice(body?.voice)), 'gemini')
      } catch (e) {
        if ((e instanceof AiError && e.status === 400) || !EDGE_ENABLED) throw e
        return this.packSpeech(await speakEdge(text, edgeVoice(body?.edgeVoice)), 'edge')
      }
    } catch (e) {
      throw this.aiHttp(e)
    }
  }

  private packSpeech(r: { audio: Buffer; mime: string; cached: boolean }, engine: string) {
    return { audio: r.audio.toString('base64'), mime: r.mime, cached: r.cached, engine }
  }

  /** Ошибка модели в понятный ответ сайту: 429 лимит, 503 не настроено, иначе 502 с названием причины. */
  private aiHttp(e: unknown) {
    const err = e instanceof AiError ? e : new AiError('ошибка модели', 502)
    logError('voice: модель', err.message)
    if (err.status === 429) return new HttpException({ error: 'rate limit', message: err.message }, 429)
    if (err.status === 503) return new ServiceUnavailableException({ error: 'not configured', message: err.message })
    return new BadGatewayException({ error: 'model failed', message: err.message })
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
    return { id: s.id, review: s.review ?? '', started: Number(s.started), seconds: s.ended === null ? countedSeconds(Number(s.started), Date.now(), MAX_SEC) : s.seconds, messages: rows.map(m => ({ id: Number(m.id), t: Number(m.t), role: m.role, text: m.text })) }
  }

  /** Разбор разговора: сильная текстовая модель (та же, что у помощника-чата) читает расшифровку и пишет отчёт. Готовый отчёт хранится, повторный вызов отдаёт его без запроса к модели. */
  async review(id: string, force = false, provider?: unknown) {
    const row = await this.open(id)
    if (row.review && !force) return { review: row.review }
    const list = providers()
    if (!list.length) throw new ServiceUnavailableException({ error: 'chat not configured' })
    const rows = await (await this.db.orm()).voiceMessage.findMany({ where: { session: id }, orderBy: { id: 'asc' }, select: { role: true, text: true } })
    const input = reviewInput(rows.map(r => ({ role: r.role === 'assistant' ? 'assistant' : 'user', text: r.text })))
    if (!input) throw bad('nothing to review')
    let review = ''
    try {
      review = (await askInOrder(orderFor(provider, list), [{ role: 'system', content: REVIEW_PROMPT }, { role: 'user', content: input }], { maxTokens: 1000, temperature: 0.2 })).text
    } catch (e) {
      throw this.aiHttp(e)
    }
    await (await this.db.orm()).voiceSession.update({ where: { id }, data: { review } })
    return { review }
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
