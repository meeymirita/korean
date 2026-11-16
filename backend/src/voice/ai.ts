/**
 * Бесплатные ИИ-помощники голосового окна: OpenRouter (ключ помощника-чата), Groq и Gemini. Все три отвечают по схеме OpenAI `POST {base}/chat/completions`,
 * поэтому один код. Распознавание речи (Whisper) только у Groq. Поставщик без ключа в список не попадает.
 */
import { createHash } from 'node:crypto'
import { CHAT_BASE, CHAT_KEY, CHAT_MODEL, GEMINI_BASE, GEMINI_KEY, GEMINI_MODEL, GEMINI_NATIVE_BASE, GEMINI_TTS_MODEL, GEMINI_TTS_VOICE, GROQ_BASE, GROQ_KEY, GROQ_MODEL, GROQ_STT_MODEL } from '../config.js'

export type ProviderId = 'openrouter' | 'groq' | 'gemini'
export interface Provider {
  id: ProviderId
  title: string
  base: string
  key: string
  model: string
}
export interface AiMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Ошибка поставщика; `status` 429 это лимит (пробуем следующего). */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** Подключённые поставщики в порядке предпочтения: быстрый Groq, сильный Gemini, запасной OpenRouter. */
export function providers(): Provider[] {
  const all: Provider[] = [
    { id: 'groq', title: 'Groq', base: GROQ_BASE, key: GROQ_KEY, model: GROQ_MODEL },
    { id: 'gemini', title: 'Gemini', base: GEMINI_BASE, key: GEMINI_KEY, model: GEMINI_MODEL },
    { id: 'openrouter', title: 'OpenRouter', base: CHAT_BASE, key: CHAT_KEY, model: CHAT_MODEL },
  ]
  return all.filter(p => p.key)
}

/** Порядок попыток: выбранный первым, остальные запасными. Неизвестный или не подключённый выбор игнорируется. */
export function orderFor(choice: unknown, list = providers()): Provider[] {
  const first = list.find(p => p.id === choice)
  return first ? [first, ...list.filter(p => p !== first)] : list
}

/** Один запрос к модели; пустой ответ считается ошибкой. */
export async function complete(p: Provider, messages: AiMsg[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  let res: Response
  try {
    res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}`, 'HTTP-Referer': 'https://korean.meeymirita.ru', 'X-Title': 'Urimal' },
      body: JSON.stringify({ model: p.model, messages, temperature: opts.temperature ?? 0.4, max_tokens: opts.maxTokens ?? 900 }),
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new AiError(`${p.title} не ответил за 20 секунд`, 502)
  }
  if (!res.ok) throw new AiError(res.status === 404 ? `${p.title}: модель «${p.model}» не найдена (поменяй её в backend/.env)` : `${p.title} ответил ${res.status}`, res.status)
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null
  const c = data?.choices?.[0]?.message?.content
  const text = typeof c === 'string' ? c.trim() : ''
  if (!text) throw new AiError(`${p.title} вернул пустой ответ`, 502)
  return text
}

/** Пробует поставщиков по порядку, пока кто-то не ответит. `failed` это отказавшие до него (сайт показывает, кто и почему не ответил). Последняя ошибка уходит наружу, если не ответил никто. */
export async function askInOrder(order: Provider[], messages: AiMsg[], opts?: { maxTokens?: number; temperature?: number }): Promise<{ text: string; provider: Provider; failed: string[] }> {
  let last: AiError = new AiError('нет подключённых моделей', 503)
  const failed: string[] = []
  for (const p of order) {
    try {
      return { text: await complete(p, messages, opts), provider: p, failed }
    } catch (e) {
      last = e instanceof AiError ? e : new AiError('ошибка модели', 502)
      failed.push(last.message)
    }
  }
  throw last
}

/** Распознавание речи через Groq Whisper (бесплатно, лимит смотреть в кабинете Groq). Язык не задаём: ученик говорит и по-русски, и по-корейски. */
export async function transcribe(audio: Buffer, mime: string): Promise<string> {
  if (!GROQ_KEY) throw new AiError('нет ключа Groq', 503)
  const ext = /ogg/.test(mime) ? 'ogg' : /mp4|m4a|aac/.test(mime) ? 'm4a' : /wav/.test(mime) ? 'wav' : 'webm'
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime || 'audio/webm' }), `speech.${ext}`)
  form.append('model', GROQ_STT_MODEL)
  form.append('response_format', 'json')
  form.append('temperature', '0')
  let res: Response
  try {
    res = await fetch(`${GROQ_BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: form, signal: AbortSignal.timeout(40_000) })
  } catch {
    throw new AiError('Groq недоступен', 502)
  }
  if (!res.ok) throw new AiError(`Groq Whisper ответил ${res.status}`, res.status)
  const data = (await res.json().catch(() => null)) as { text?: unknown } | null
  return typeof data?.text === 'string' ? data.text.replace(/\s+/g, ' ').trim() : ''
}

/** Проверка ответа репетитора другой (или той же) моделью: короткая пометка. */
export const CHECK_PROMPT = `Ты проверяешь ответ репетитора корейского для начинающего ученика. Даны вопрос ученика и ответ репетитора.
Напиши по-русски одной-двумя короткими фразами: «Проверка: верно» или «Проверка: ошибка» и что именно не так (корейская фраза, частица, перевод) и как правильно.
Не придирайся к стилю. Ничего не выдумывай: сомневаешься, напиши «Проверка: не уверен». Чтение корейского латиницей или кириллицей не пиши. Не предлагай непройденное.`

/** Голоса озвучки, которые можно выбрать в окне (названия голосов Gemini TTS). Неизвестное имя заменяется голосом по умолчанию. */
export const TTS_VOICES = ['Kore', 'Puck', 'Zephyr', 'Aoede', 'Leda', 'Charon', 'Fenrir', 'Orus'] as const
export const ttsVoice = (v: unknown): string => (typeof v === 'string' && (TTS_VOICES as readonly string[]).includes(v) ? v : GEMINI_TTS_VOICE)

/** Готовые озвучки по тексту и голосу: повторные фразы (шаги сценки, «Верно!») не тратят лимит. */
const ttsCache = new Map<string, { mime: string; audio: Buffer }>()
const TTS_CACHE_MAX = 150

/** WAV-заголовок для сырого звука PCM 16 бит (старые модели Gemini TTS отдают его без заголовка, новые уже WAV). */
function wavOf(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20)
  h.writeUInt16LE(1, 22)
  h.writeUInt32LE(rate, 24)
  h.writeUInt32LE(rate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

/** Озвучка текста голосом Gemini (русский и корейский в одной фразе модель читает сама). Возвращает WAV. */
export async function speak(text: string, voice: string): Promise<{ mime: string; audio: Buffer; cached: boolean }> {
  if (!GEMINI_KEY) throw new AiError('нет ключа Gemini', 503)
  const key = createHash('sha1').update(`${GEMINI_TTS_MODEL}|${voice}|${text}`).digest('hex')
  const hit = ttsCache.get(key)
  if (hit) return { ...hit, cached: true }
  let res: Response
  try {
    res = await fetch(`${GEMINI_NATIVE_BASE}/models/${GEMINI_TTS_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }),
      signal: AbortSignal.timeout(25_000),
    })
  } catch {
    throw new AiError('озвучка Gemini не ответила за 25 секунд', 502)
  }
  if (!res.ok) throw new AiError(res.status === 404 ? `озвучка: модель «${GEMINI_TTS_MODEL}» не найдена (поменяй GEMINI_TTS_MODEL в backend/.env)` : `озвучка Gemini ответила ${res.status}`, res.status)
  const data = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] } | null
  const part = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)?.inlineData
  if (!part?.data) throw new AiError('озвучка Gemini вернула пустой ответ', 502)
  const raw = Buffer.from(part.data, 'base64')
  const isWav = raw.subarray(0, 4).toString() === 'RIFF'
  const rate = Number(/rate=(\d+)/.exec(part.mimeType ?? '')?.[1] ?? 24000)
  const out = { mime: 'audio/wav', audio: isWav ? raw : wavOf(raw, rate) }
  if (ttsCache.size >= TTS_CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value!)
  ttsCache.set(key, out)
  return { ...out, cached: false }
}
