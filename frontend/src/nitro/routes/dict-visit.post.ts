// Переход внутри словаря без перезагрузки страницы: браузер сообщает о нём сюда (plugins/dict-visits.client.ts), а сайт передаёт API.
// Напрямую в API браузер писать не может: /api/dict/visit закрыт снаружи.
import { defineEventHandler, readBody, setResponseStatus } from 'h3'
import { reportDictVisit } from '../utils/dictVisit'

export default defineEventHandler(async event => {
  const body = await readBody<{ path?: unknown }>(event).catch(() => null)
  if (typeof body?.path === 'string') reportDictVisit(event, body.path, '')
  setResponseStatus(event, 204)
  return null
})
