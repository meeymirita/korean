import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AuthGate from '@/components/AuthGate.vue'
import { useProgressStore } from '@/stores/progress'

// Экран входа: три способа (токен, Телеграм, почта); вход по коду из Telegram или почты открывает сайт без токена.
const calls: { url: string; method: string; body?: string; auth?: string }[] = []
let channels = { enabled: true, telegram: true, mail: true }
let verifyStatus = 200

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  calls.length = 0
  channels = { enabled: true, telegram: true, mail: true }
  verifyStatus = 200
  const progress = useProgressStore()
  progress.disconnect()
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined, auth: headers.Authorization })
    if (url === '/api/login/code/channels') return new Response(JSON.stringify(channels))
    if (url === '/api/login/code/send') return new Response('{"ok":true}')
    if (url === '/api/login/code/verify') return verifyStatus === 200 ? new Response(JSON.stringify({ session: 'a'.repeat(32) })) : new Response('{"error":"wrong code"}', { status: 401 })
    return new Response('{}')
  })
})
afterEach(() => vi.unstubAllGlobals())

const cards = () => [...document.querySelectorAll<HTMLButtonElement>('.gate-method')]

describe('экран входа: три способа', () => {
  it('сначала три кнопки: Токен, Телеграм, Почта', async () => {
    const w = await mountSuspended(AuthGate, { attachTo: document.body })
    await flushPromises()
    expect(cards().map(c => c.querySelector('b')!.textContent)).toEqual(['Токен', 'Телеграм', 'Почта'])
    expect(cards().every(c => !c.disabled)).toBe(true)
    w.unmount()
  })

  it('способ, который не настроен на сервере, недоступен и подписан', async () => {
    channels = { enabled: true, telegram: true, mail: false }
    const w = await mountSuspended(AuthGate, { attachTo: document.body })
    await flushPromises()
    const [, tg, mail] = cards()
    expect(tg!.disabled).toBe(false)
    expect(mail!.disabled).toBe(true)
    expect(mail!.textContent).toContain('Не настроено')
    w.unmount()
  })

  it('«Токен» открывает поле токена и ссылку «Другой способ входа»', async () => {
    const w = await mountSuspended(AuthGate, { attachTo: document.body })
    await flushPromises()
    cards()[0]!.click()
    await flushPromises()
    expect(document.querySelector('.gate-form input[type=password]')).not.toBeNull()
    const back = [...document.querySelectorAll<HTMLAnchorElement>('.gate-help a')].find(a => a.textContent!.includes('Другой способ'))!
    back.click()
    await flushPromises()
    expect(cards()).toHaveLength(3)
    w.unmount()
  })

  it('вход по коду выключен на сервере: сразу поле токена, без кнопок', async () => {
    channels = { enabled: false, telegram: false, mail: false }
    const w = await mountSuspended(AuthGate, { attachTo: document.body })
    await flushPromises()
    expect(cards()).toHaveLength(0)
    expect(document.querySelector('.gate-form input[type=password]')).not.toBeNull()
    w.unmount()
  })

  it('Телеграм: код уходит в выбранный канал, шесть цифр открывают сайт без токена, сайт ходит с сеансом', async () => {
    const w = await mountSuspended(AuthGate, { attachTo: document.body })
    await flushPromises()
    cards()[1]!.click()
    await flushPromises()
    const send = calls.find(c => c.url === '/api/login/code/send')!
    expect(JSON.parse(send.body!)).toEqual({ channel: 'telegram' })
    expect(send.auth, 'без токена').toBeUndefined()
    const input = document.querySelector<HTMLInputElement>('.gate-form input')!
    expect(input.maxLength).toBe(6)
    input.value = '123456'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(JSON.parse(calls.find(c => c.url === '/api/login/code/verify')!.body!)).toEqual({ code: '123456' })
    const progress = useProgressStore()
    expect(progress.bearer).toBe(`ses:${'a'.repeat(32)}`)
    expect(progress.unlocked).toBe(true)
    // дальше запросы идут с «ses:»
    expect(calls.filter(c => c.auth?.startsWith('Bearer ses:')).length).toBeGreaterThan(0)
    w.unmount()
  })

  it('неверный код: понятное сообщение, поле очищается, сайт не открывается', async () => {
    verifyStatus = 401
    const w = await mountSuspended(AuthGate, { attachTo: document.body })
    await flushPromises()
    cards()[2]!.click() // почта
    await flushPromises()
    expect(JSON.parse(calls.find(c => c.url === '/api/login/code/send')!.body!)).toEqual({ channel: 'mail' })
    const input = document.querySelector<HTMLInputElement>('.gate-form input')!
    input.value = '000000'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(document.querySelector('.gate-err')!.textContent).toContain('Неверный или просроченный код')
    expect(input.value).toBe('')
    expect(useProgressStore().unlocked).toBe(false)
    w.unmount()
  })
})
