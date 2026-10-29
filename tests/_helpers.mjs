/** Общие заглушки сети для тестов хранилища. */

/** Ответ сервера: статус, тело и заголовки (регистр ключа важен, как в коде стора). */
export const reply = (status, body = {}, headers = {}) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
  headers: { get: k => headers[k] ?? null },
})

/** Сервер недоступен. */
export const offline = async () => {
  throw new Error('Failed to fetch')
}
