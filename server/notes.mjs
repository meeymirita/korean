/**
 * Заметки владельца в кабинете: название и описание, всё одним JSON-файлом (server/data/notes.json).
 * Гость заметок не видит и не сохраняет: ему отдаётся пустой ответ, а его запись игнорируется.
 */
import { MAX_NOTES, MAX_NOTES_BODY, MAX_NOTE_TEXT, MAX_NOTE_TITLE } from './config.mjs'
import { readBody, send } from './http.mjs'
import { readNotes, saveNotes } from './storage.mjs'
import { roleHeaders } from './guests.mjs'

const isStr = (v, max) => typeof v === 'string' && v.length <= max
const num = v => typeof v === 'number' && Number.isFinite(v)

/** Приводит тело запроса к виду { v: 1, updated, notes } или возвращает null, если оно нарушает лимиты. */
export function validNotes(data) {
  if (!data || typeof data !== 'object' || data.v !== 1 || !Array.isArray(data.notes) || data.notes.length > MAX_NOTES) return null
  const ids = new Set()
  const notes = []
  for (const n of data.notes) {
    if (!n || typeof n !== 'object' || !isStr(n.id, 40) || !n.id || ids.has(n.id)) return null
    if (!isStr(n.title, MAX_NOTE_TITLE) || !isStr(n.text, MAX_NOTE_TEXT) || !num(n.created) || !num(n.updated)) return null
    ids.add(n.id)
    notes.push({ id: n.id, title: n.title, text: n.text, created: n.created, updated: n.updated })
  }
  return { v: 1, updated: num(data.updated) ? data.updated : 0, notes }
}

/** GET и PUT /api/notes. */
export async function notesApi(req, res, who) {
  const hdr = roleHeaders(who)

  if (req.method === 'GET') return send(res, 200, who.role === 'guest' ? {} : await readNotes(), hdr)

  if (req.method === 'PUT') {
    let body
    try {
      body = JSON.parse(await readBody(req, MAX_NOTES_BODY))
    } catch (e) {
      return send(res, e.status || 400, { error: e.status === 413 ? 'too large' : 'invalid json' })
    }
    const data = validNotes(body)
    if (!data) return send(res, 400, { error: 'invalid notes' })
    if (who.role === 'guest') return send(res, 200, { ok: true, guest: true }, hdr)
    await saveNotes(data)
    return send(res, 200, { ok: true, updated: data.updated }, hdr)
  }

  return send(res, 405, { error: 'method not allowed' })
}
