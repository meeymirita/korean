/** Помощник-чат: пересылает вопросы в OpenRouter и возвращает ответ. Историю переписки хранит браузер, сервер её не сохраняет. */
import { BadGatewayException, BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { CHAT_DAILY_LIMIT, CHAT_MAX_HISTORY, CHAT_MAX_TEXT, CHAT_BASE, CHAT_KEY, CHAT_MODEL } from '../config'
import { SYSTEM_PROMPT } from './prompt'

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

@Injectable()
export class ChatService {
  private day = ''
  private used = 0

  /** Счётчик вопросов за сутки: хранится в памяти, после перезапуска службы начинается заново. */
  private take(): number {
    const today = new Date().toISOString().slice(0, 10)
    if (today !== this.day) {
      this.day = today
      this.used = 0
    }
    if (this.used >= CHAT_DAILY_LIMIT) throw new HttpException({ error: 'daily limit', limit: CHAT_DAILY_LIMIT }, 429)
    this.used++
    return CHAT_DAILY_LIMIT - this.used
  }

  status() {
    return { configured: !!CHAT_KEY, model: CHAT_MODEL, limit: CHAT_DAILY_LIMIT }
  }

  async ask(body: Record<string, unknown>) {
    const messages = cleanMessages(body?.messages)
    if (!CHAT_KEY) throw new ServiceUnavailableException({ error: 'chat not configured' })
    const left = this.take()
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
    if (!reply) throw new BadGatewayException({ error: 'empty answer' })
    return { reply, left }
  }
}
