import { errText, fetchT } from './http'

/** Один разговор в общей истории: чат с помощником или голосовой разговор. */
export interface Talk {
  kind: 'chat' | 'voice'
  id: string
  title: string
  when: number
  messages: number
  snippet?: string
  matches?: number
}

/** Общая история разговоров (новые сверху); при `q` от двух знаков ищет по тексту. Бросает Error с понятным текстом. */
export async function listTalks(bearer: string, q = ''): Promise<Talk[]> {
  let res: Response
  try {
    res = await fetchT(`/api/talks${q.trim().length >= 2 ? `?q=${encodeURIComponent(q.trim())}` : ''}`, { headers: { Authorization: `Bearer ${bearer}` } })
  } catch (e) {
    throw new Error(errText(e))
  }
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'История доступна только после входа по токену' : `ошибка сервера ${res.status}`)
  return ((await res.json()) as { talks: Talk[] }).talks
}

/** Куски текста: найденное слово отдельно, чтобы показать его выделенным (HTML не используется). */
export function highlight(text: string, q: string): { text: string; hit: boolean }[] {
  const needle = q.trim()
  if (needle.length < 2 || !text) return [{ text, hit: false }]
  const out: { text: string; hit: boolean }[] = []
  const lower = text.toLowerCase()
  const n = needle.toLowerCase()
  let at = 0
  for (let i = lower.indexOf(n); i >= 0; i = lower.indexOf(n, at)) {
    if (i > at) out.push({ text: text.slice(at, i), hit: false })
    out.push({ text: text.slice(i, i + n.length), hit: true })
    at = i + n.length
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false })
  return out
}
