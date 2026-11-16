/** Голосовой собеседник: чистые функции (без базы и сети). */
import { VOICE_MAX_TEXT } from '../config.js'
import { SYSTEM_PROMPT } from './prompt.js'

export type VoiceRole = 'user' | 'assistant'

/** День ГГГГ-ММ-ДД по часовому поясу (для суточного лимита). Неизвестный пояс: UTC. */
export function dayKey(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
  } catch {
    return new Date(ms).toISOString().slice(0, 10)
  }
}

export const cleanRole = (v: unknown): VoiceRole | null => (v === 'user' || v === 'assistant' ? v : null)

/** Текст реплики: без лишних пробелов, не длиннее предела; пустое даёт null. */
export function cleanText(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, VOICE_MAX_TEXT) : null
}

/** Сколько секунд разговора засчитать: от старта до конца по часам сервера, не больше предела (сайту про длительность не верим). */
export function countedSeconds(started: number, ended: number, maxSec: number): number {
  return Math.max(0, Math.min(maxSec, Math.round((ended - started) / 1000)))
}

/** Примерная цена в долларах, два знака после запятой не меньше цента. */
export const costOf = (seconds: number, perMin: number) => Math.round((seconds / 60) * perMin * 100) / 100

/** Тело запроса на временный ключ: модель, голос, инструкция и расшифровка речи ученика (язык определяется сам: ученик говорит и по-русски, и по-корейски). */
export function secretBody(o: { model: string; voice: string; ttl: number }) {
  return {
    expires_after: { anchor: 'created_at', seconds: o.ttl },
    session: {
      type: 'realtime',
      model: o.model,
      instructions: SYSTEM_PROMPT,
      audio: {
        input: { transcription: { model: 'gpt-4o-mini-transcribe' } },
        output: { voice: o.voice },
      },
    },
  }
}
