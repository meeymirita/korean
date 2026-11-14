import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

export type CodeChannel = 'telegram' | 'mail'
export interface CodeChannels {
  /** вход по коду включён на сервере (`CODE_LOGIN`) */
  enabled: boolean
  telegram: boolean
  mail: boolean
}

/** Вход по коду без токена (Telegram или почта): какие способы есть, отправить код, проверить код. Токен для этого не нужен. */
export function useCodeLogin() {
  const progress = useProgressStore()
  const json = { 'Content-Type': 'application/json' }

  /** Понятный текст по ответу сервера; `wait` секунд до нового кода. */
  async function fail(res: Response): Promise<Error> {
    let body: { error?: string; wait?: number } = {}
    try {
      body = await res.json()
    } catch {
      /* без тела */
    }
    if (res.status === 429) {
      const e = body.error === 'too many' ? 'Слишком много кодов за час, попробуйте позже' : body.wait ? `Код уже отправлен, новый можно через ${body.wait} с` : 'Слишком много попыток, подождите несколько минут'
      return Object.assign(new Error(e), { wait: body.error === 'too soon' ? body.wait : undefined })
    }
    if (res.status === 401) return new Error('Неверный или просроченный код')
    if (res.status === 400) return new Error('Этот способ сейчас недоступен')
    if (res.status === 503) return new Error('Не получилось отправить код, попробуйте другой способ или токен')
    return new Error(`Ошибка сервера ${res.status}`)
  }

  async function channels(): Promise<CodeChannels> {
    const res = await fetchT('/api/login/code/channels')
    if (!res.ok) throw await fail(res)
    return (await res.json()) as CodeChannels
  }

  async function send(channel: CodeChannel) {
    const res = await fetchT('/api/login/code/send', { method: 'POST', headers: json, body: JSON.stringify({ channel }) })
    if (!res.ok) throw await fail(res)
  }

  /** Верный код открывает сайт без токена. */
  async function verify(code: string) {
    const res = await fetchT('/api/login/code/verify', { method: 'POST', headers: json, body: JSON.stringify({ code }) })
    if (!res.ok) throw await fail(res)
    await progress.connectSession(((await res.json()) as { session: string }).session)
  }

  return { channels, send, verify }
}
