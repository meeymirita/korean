import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import HomeGuideDrawer from '@/components/home/HomeGuideDrawer.vue'
import AboutView from '@/views/AboutView.vue'
import { GAMES, PAGES } from '@/data/guide'

// «Что здесь есть» и «О платформе»: закрытая страница без токена открывает окно «Запросить доступ» с Telegram, а не уводит на вход.
/** вход подменён: настоящий без сервера невозможен */
const who = vi.hoisted(() => ({ unlocked: false }))
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => who.unlocked, isGuest: () => false }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})
afterEach(() => (who.unlocked = false))

const dialog = () => document.querySelector('.ar')

describe('«Что здесь есть»: закрытые разделы без токена', () => {
  it('нажатие на закрытый раздел открывает окно «Запросить доступ» с Telegram автора; шторка остаётся', async () => {
    const closed: boolean[] = []
    const w = await mountSuspended(HomeGuideDrawer, { props: { modelValue: true, 'onUpdate:modelValue': (v: boolean) => closed.push(v) }, attachTo: document.body })
    await flushPromises()
    const privateCard = PAGES.find(c => c.private)!
    const card = [...document.querySelectorAll<HTMLElement>('#guide-pages .card')].find(c => c.querySelector('b')!.textContent === privateCard.title)!
    expect(card.tagName, 'у закрытого раздела вместо ссылки кнопка').toBe('BUTTON')
    expect(card.getAttribute('href')).toBeNull()
    card.click()
    await flushPromises()
    expect(dialog()).not.toBeNull()
    expect(dialog()!.textContent).toContain(`«${privateCard.title}»`)
    const tg = dialog()!.querySelector<HTMLAnchorElement>('a.ar-tg')!
    expect(tg.href).toBe('https://t.me/meeymirita')
    expect(tg.getAttribute('rel')).toContain('noopener')
    expect(closed, 'шторка не закрылась').toEqual([])

    // Esc закрывает только окно доступа
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(closed).toEqual([])
    w.unmount()
  })

  it('открытый всем раздел остаётся ссылкой и закрывает шторку', async () => {
    const closed: boolean[] = []
    const w = await mountSuspended(HomeGuideDrawer, { props: { modelValue: true, 'onUpdate:modelValue': (v: boolean) => closed.push(v) }, attachTo: document.body })
    await flushPromises()
    const open = PAGES.find(c => !c.private)!
    const card = [...document.querySelectorAll<HTMLElement>('#guide-pages .card')].find(c => c.querySelector('b')!.textContent === open.title)!
    expect(card.tagName).toBe('A')
    expect(card.getAttribute('href')).toBe(open.to)
    card.addEventListener('click', e => e.preventDefault()) // без настоящего перехода в тесте
    card.click()
    expect(closed).toEqual([false])
    w.unmount()
  })

  it('с токеном все карточки ссылки, окна доступа нет', async () => {
    who.unlocked = true
    const w = await mountSuspended(HomeGuideDrawer, { props: { modelValue: true }, attachTo: document.body })
    await flushPromises()
    expect(document.querySelectorAll('#guide-pages button.card')).toHaveLength(0)
    expect(document.querySelectorAll('#guide-pages a.card')).toHaveLength(PAGES.length)
    w.unmount()
  })

  it('разделы и игры сворачиваются кнопками; игры по умолчанию свёрнуты', async () => {
    const w = await mountSuspended(HomeGuideDrawer, { props: { modelValue: true }, attachTo: document.body })
    await flushPromises()
    const [pages, games] = [...document.querySelectorAll<HTMLButtonElement>('.acc-btn')]
    expect(pages!.getAttribute('aria-expanded')).toBe('true')
    expect(games!.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('#guide-games')!.hasAttribute('inert')).toBe(true)
    expect(document.querySelectorAll('#guide-games .card'), 'карточки игр не рисуются, пока список не раскрывали').toHaveLength(0)
    pages!.click()
    await flushPromises()
    expect(document.querySelector('#guide-pages')!.classList.contains('open')).toBe(false)
    games!.click()
    await flushPromises()
    expect(document.querySelectorAll('#guide-games .card')).toHaveLength(GAMES.length)
    w.unmount()
  })
})

describe('«О платформе»: закрытая страница без токена', () => {
  it('кнопка «Открыть страницу» закрытого слайда открывает окно доступа', async () => {
    const w = await mountSuspended(AboutView, { attachTo: document.body })
    await flushPromises()
    const rows = [...document.querySelectorAll<HTMLElement>('.row')]
    const closedRow = rows.find(r => r.querySelector('.lock'))!
    const btn = closedRow.querySelector<HTMLElement>('.open')!
    expect(btn.tagName).toBe('BUTTON')
    btn.click()
    await flushPromises()
    expect(dialog()!.querySelector('a.ar-tg')!.getAttribute('href')).toBe('https://t.me/meeymirita')
    const openRow = rows.find(r => !r.querySelector('.lock'))!
    expect(openRow.querySelector('.open')!.tagName, 'открытая страница остаётся ссылкой').toBe('A')
    w.unmount()
  })
})
