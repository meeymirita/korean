import { errText, fetchT } from './http'

export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
}

/** Сколько знаков можно в одном вопросе (так же на сервере). */
export const CHAT_MAX_TEXT = 2000

/** Понятный текст ошибки помощника по ответу сервера. */
export function chatErrorText(status: number, error?: string): string {
  if (status === 503) return 'Помощник не настроен: на сервере нет ключа (OPENROUTER_API_KEY в backend/.env)'
  if (status === 429) return error === 'daily limit' ? 'На сегодня вопросы закончились, завтра можно снова' : 'Слишком часто, подожди минуту и спроси ещё раз'
  if (status === 502) return 'Помощник сейчас не отвечает, попробуй чуть позже'
  if (status === 401 || status === 403) return 'Помощник доступен только после входа по токену'
  if (status === 400) return error === 'message too long' ? `Вопрос длиннее ${CHAT_MAX_TEXT} знаков, сократи его` : 'Не получилось отправить вопрос'
  return `ошибка сервера ${status}`
}

/** Задаёт вопрос: переписка целиком, последнее сообщение от пользователя. Бросает Error с понятным текстом. */
export async function askChat(bearer: string, messages: ChatMsg[]): Promise<{ reply: string; left: number }> {
  let res: Response
  try {
    res = await fetchT('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify({ messages }) }, 60_000)
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok) throw new Error(chatErrorText(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error))
  return (await res.json()) as { reply: string; left: number }
}

export async function chatStatus(bearer: string): Promise<{ configured: boolean; model: string; limit: number; left: number } | null> {
  try {
    const res = await fetchT('/api/chat', { headers: { Authorization: `Bearer ${bearer}` } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export interface Piece {
  text: string
  bold: boolean
}
export interface Line {
  bullet: boolean
  pieces: Piece[]
}

/** Ответ помощника для показа: строки, пункты «- …» и жирное **слово**. Остальная разметка (таблицы, #, лишние звёздочки) убирается, HTML не используется. */
export function parseReply(raw: string): Line[] {
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !(l.includes('|') && /^[\s:|-]+$/.test(l)) && !/^[-–—_=*]{3,}$/.test(l))
    .map(l => {
      let t = l.replace(/^#{1,6}\s+/, '')
      const bullet = /^[-*•]\s+/.test(t)
      if (bullet) t = t.replace(/^[-*•]\s+/, '')
      if (t.startsWith('|')) t = t.replace(/^\||\|$/g, '').replace(/\s*\|\s*/g, ' · ').trim()
      const pieces: Piece[] = []
      t.split('**').forEach((part, i) => {
        const text = part.replace(/\*+/g, '')
        if (text) pieces.push({ text, bold: i % 2 === 1 })
      })
      return { bullet, pieces }
    })
}

/** Корейские фразы из ответа для разбора: куски хангыля между любыми другими знаками, без повторов, не больше шести. */
export function koreanParts(text: string, max = 6): string[] {
  const seen = new Set<string>()
  for (const raw of text.replace(/[^가-힣 \t]+/g, '|').split('|')) {
    const t = raw.replace(/\s+/g, ' ').trim()
    if (/[가-힣]{2,}/.test(t)) seen.add(t)
  }
  return [...seen].slice(0, max)
}
