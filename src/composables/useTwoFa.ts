import { ref } from 'vue'
import { fetchT } from '@/lib/http'
import { useProgressStore } from '@/stores/progress'

export interface TwoFaStatus {
  enabled: boolean
  /** защита выключена аварийным выключателем на сервере */
  bypassed: boolean
  /** адрес со звёздочками */
  email: string
  mailConfigured: boolean
}

/** Двухфакторная защита: шаги входа (код из письма) и включение или выключение в кабинете. */
export function useTwoFa() {
  const progress = useProgressStore()
  const status = ref<TwoFaStatus | null>(null)
  const headers = (json = false, confirm?: string) => ({
    Authorization: `Bearer ${progress.bearer}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(confirm ? { 'X-Confirm-Token': confirm } : {}),
  })

  /** Понятный текст по ответу сервера. */
  async function fail(res: Response): Promise<Error> {
    let body: { error?: string; wait?: number } = {}
    try {
      body = await res.json()
    } catch {
      /* без тела */
    }
    if (res.status === 429) return new Error(body.wait ? `Код уже отправлен, новый можно через ${body.wait} с` : 'Слишком много попыток, подождите несколько минут')
    if (res.status === 401) return new Error(body.error === 'wrong code' ? 'Неверный или просроченный код' : 'Нужно войти заново')
    if (res.status === 403) return new Error('Неверный токен подтверждения')
    if (res.status === 503) return new Error(body.error === 'mail not configured' ? 'На сервере не настроена почта (SMTP в server/.env)' : 'Не получилось отправить письмо, попробуйте позже')
    if (res.status === 400) return new Error(body.error === 'invalid email' ? 'Проверьте адрес почты' : 'Запрос не принят')
    return new Error(`Ошибка сервера ${res.status}`)
  }

  async function load() {
    const res = await fetchT('/api/2fa/status', { headers: headers() })
    if (!res.ok) throw await fail(res)
    status.value = (await res.json()) as TwoFaStatus
    return status.value
  }

  /** Вход: письмо с кодом на адрес из настроек. Возвращает адрес со звёздочками. */
  async function sendLoginCode(): Promise<string> {
    const res = await fetchT('/api/2fa/send', { method: 'POST', headers: headers() })
    if (!res.ok) throw await fail(res)
    return ((await res.json()) as { email: string }).email
  }

  /** Вход: проверка кода; верный открывает сайт. */
  async function verifyLogin(code: string) {
    const res = await fetchT('/api/2fa/verify', { method: 'POST', headers: headers(true), body: JSON.stringify({ code }) })
    if (!res.ok) throw await fail(res)
    progress.setSession(((await res.json()) as { session: string }).session)
    await progress.init()
  }

  /** Включение, шаг 1: код на новый адрес. */
  async function startEnable(email: string): Promise<string> {
    const res = await fetchT('/api/2fa/enable/start', { method: 'POST', headers: headers(true), body: JSON.stringify({ email }) })
    if (!res.ok) throw await fail(res)
    return ((await res.json()) as { email: string }).email
  }

  /** Включение, шаг 2: код из письма; защита включается, это устройство остаётся в системе. */
  async function confirmEnable(code: string) {
    const res = await fetchT('/api/2fa/enable/confirm', { method: 'POST', headers: headers(true), body: JSON.stringify({ code }) })
    if (!res.ok) throw await fail(res)
    progress.setSession(((await res.json()) as { session: string }).session)
    await load()
  }

  /** Выключение: сервер просит токен ещё раз (подтверждение приходит из окна askTokenDo). */
  async function disable(confirm: string) {
    const res = await fetchT('/api/2fa', { method: 'DELETE', headers: headers(false, confirm) })
    if (!res.ok) throw await fail(res)
    progress.setSession('')
    await load()
  }

  /** Выход со всех устройств: у всех сеансов срок кончается, на каждом нужен новый код. */
  async function revokeAll(confirm: string) {
    const res = await fetchT('/api/2fa/sessions', { method: 'DELETE', headers: headers(false, confirm) })
    if (!res.ok) throw await fail(res)
  }

  return { status, load, sendLoginCode, verifyLogin, startEnable, confirmEnable, disable, revokeAll }
}
