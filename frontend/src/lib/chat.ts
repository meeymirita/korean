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
  if (status === 404) return 'Этот чат уже удалён, начни новый'
  if (status === 400) return error === 'message too long' ? `Вопрос длиннее ${CHAT_MAX_TEXT} знаков, сократи его` : error === 'chat too long' ? 'Чат стал слишком длинным, начни новый' : 'Не получилось отправить вопрос'
  return `ошибка сервера ${status}`
}

/** Задаёт вопрос: переписка целиком, последнее сообщение от пользователя. conv: 'new' завести чат, номер чата дописать в него (ответ вернёт номер). Бросает Error с понятным текстом. */
export async function askChat(bearer: string, messages: ChatMsg[], conv?: string): Promise<{ reply: string; left: number; conv?: string }> {
  let res: Response
  try {
    res = await fetchT('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` }, body: JSON.stringify(conv ? { messages, conv } : { messages }) }, 60_000)
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok) throw new Error(chatErrorText(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error))
  return (await res.json()) as { reply: string; left: number; conv?: string }
}

/** Сохранённый чат в списке. */
export interface ChatInfo {
  id: string
  title: string
  started: number
  updated: number
  messages: number
}

/** Список сохранённых чатов (новые сверху); пустой, если сервер не ответил. */
export async function listChats(bearer: string): Promise<ChatInfo[]> {
  try {
    const res = await fetchT('/api/chat/conversations', { headers: { Authorization: `Bearer ${bearer}` } })
    return res.ok ? (((await res.json()) as { conversations?: ChatInfo[] }).conversations ?? []) : []
  } catch {
    return []
  }
}

/** Сообщения одного чата; null, если чата нет или сервер не ответил. */
export async function loadChat(bearer: string, id: string): Promise<ChatMsg[] | null> {
  try {
    const res = await fetchT(`/api/chat/conversations/${id}`, { headers: { Authorization: `Bearer ${bearer}` } })
    if (!res.ok) return null
    return ((await res.json()) as { messages: ChatMsg[] }).messages.map(m => ({ role: m.role, text: m.text }))
  } catch {
    return null
  }
}

/** Удаляет чат вместе с сообщениями. Бросает Error с понятным текстом. */
export async function deleteChat(bearer: string, id: string): Promise<void> {
  let res: Response
  try {
    res = await fetchT(`/api/chat/conversations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${bearer}` } })
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok && res.status !== 404) throw new Error(chatErrorText(res.status))
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

export interface RichPart {
  text: string
  bold: boolean
  /** кусок хангыля: показывается выделенным шрифтом */
  ko: boolean
}
export interface RichLine {
  /** text: обычная строка; head: подзаголовок («Правило:»); phrase: корейская фраза карточкой; tip: задание или совет */
  kind: 'text' | 'head' | 'phrase' | 'tip'
  bullet: boolean
  /** номер пункта «1.» из нумерованного списка */
  num?: string
  parts: RichPart[]
  /** для phrase: корейская фраза и перевод под ней */
  ko?: string
  ru?: string
}

const HANGUL = /[가-힣]/g
const KO_RUN = /(?:\([가-힣]+\))?[가-힣ㄱ-ㅎ]+(?:\([가-힣]+\))?[가-힣ㄱ-ㅎ]*(?:[ /][가-힣ㄱ-ㅎ]+(?:\([가-힣]+\))?[가-힣ㄱ-ㅎ]*)*/g
const TIP = /^(попробуй|задание|совет|важно|запомни|внимание|сам\b|твоя очередь)/i

/** Доля хангыля среди букв строки (0–1): отличает корейскую фразу от русского текста с примером. */
function koShare(s: string): number {
  const ko = (s.match(HANGUL) ?? []).length
  const letters = (s.match(/[A-Za-zА-Яа-яЁё가-힣]/g) ?? []).length
  return letters ? ko / letters : 0
}

/** Режет текст на куски: хангыль отдельно, чтобы показать его другим шрифтом и цветом. */
function splitKo(text: string, bold: boolean): RichPart[] {
  const out: RichPart[] = []
  let last = 0
  for (const m of text.matchAll(KO_RUN)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold, ko: false })
    out.push({ text: m[0], bold, ko: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), bold, ko: false })
  return out
}

/**
 * Ответ помощника для красивого показа: корейские фразы с переводом карточками («저는 빵을 먹어요. — Я ем хлеб.»),
 * подзаголовки («Правило:»), задания плашкой, нумерация, хангыль внутри текста выделен. HTML не используется.
 */
export function richReply(raw: string): RichLine[] {
  return parseReply(raw).map(l => {
    const plain = l.pieces.map(p => p.text).join('')
    const num = /^(\d+)[.)]\s+/.exec(plain)?.[1]
    const text = num ? plain.replace(/^\d+[.)]\s+/, '') : plain
    // «корейская фраза — перевод» или просто корейская фраза
    const pair = /^([^—–]+?)\s+[—–]\s+(.+)$/.exec(text)
    if (pair && koShare(pair[1]!) >= 0.6 && /[А-Яа-яЁё]/.test(pair[2]!)) return { kind: 'phrase', bullet: false, num, parts: [], ko: pair[1]!.trim(), ru: pair[2]!.trim() } satisfies RichLine
    if (koShare(text) >= 0.8 && text.length <= 80 && !/[А-Яа-яЁё]/.test(text)) return { kind: 'phrase', bullet: false, num, parts: [], ko: text.trim() } satisfies RichLine
    if (!l.bullet && !num && /^[^.!?]{2,40}:$/.test(text.trim())) return { kind: 'head', bullet: false, parts: [{ text: text.trim().slice(0, -1), bold: true, ko: false }] } satisfies RichLine
    const parts = l.pieces.flatMap(p => splitKo(num && p === l.pieces[0] ? p.text.replace(/^\d+[.)]\s+/, '') : p.text, p.bold))
    return { kind: !l.bullet && !num && TIP.test(text.trim()) ? 'tip' : 'text', bullet: l.bullet, num, parts } satisfies RichLine
  })
}
