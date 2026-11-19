/** Голосовой собеседник: чистые функции (без базы и сети). */
import { VOICE_MAX_TEXT } from '../config.js'
import { buildPrompt } from './prompt.js'

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

/**
 * Тело запроса на временный ключ: модель, голос, инструкция сценки и расшифровка речи ученика (язык определяется сам: ученик говорит и по-русски, и по-корейски).
 * `ptt` (нажал и говори): автоопределение конца фразы выключено, ответ собеседник даёт только после того, как сайт отправит запись (`stores/voice.ts`).
 */
export function secretBody(o: { model: string; voice: string; ttl: number; scene?: unknown; ptt?: boolean }) {
  return {
    expires_after: { anchor: 'created_at', seconds: o.ttl },
    session: {
      type: 'realtime',
      model: o.model,
      instructions: buildPrompt(o.scene),
      audio: {
        input: {
          transcription: { model: 'gpt-4o-transcribe' },
          noise_reduction: { type: 'near_field' },
          turn_detection: o.ptt ? null : { type: 'semantic_vad', eagerness: 'low', interrupt_response: true },
        },
        output: { voice: o.voice },
      },
    },
  }
}
