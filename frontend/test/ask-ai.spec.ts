import { beforeEach, describe, expect, it, vi } from 'vitest'
import { breakdownContext, buildAskAi } from '@/lib/askAi'

// «Спросить ИИ» в окнах разбора: кнопка открывает панель, вопрос уходит с разбором с экрана, ответ рисуется карточками.
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  const over: Record<string, () => unknown> = { unlocked: () => true, bearer: () => 'токен' }
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), { get: (t, k, r) => (typeof k === 'string' && over[k] ? over[k]() : Reflect.get(t, k, r)) }),
  }
})

const bodies: Record<string, unknown>[] = []
let status = 200

beforeEach(() => {
  document.body.innerHTML = ''
  bodies.length = 0
  status = 200
  vi.stubGlobal('fetch', async (_u: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    if (status !== 200) return new Response(JSON.stringify({ error: 'daily limit' }), { status })
    return new Response(JSON.stringify({ reply: '저는 빵을 먹어요. — Я ем хлеб.', left: 39, conv: 'aaaaaaaaaaaaaaaa' }))
  })
})

const mountAsk = (onToggle?: (o: boolean) => void) => {
  const host = document.createElement('div')
  document.body.append(host)
  host.append(buildAskAi(() => breakdownContext('저는 학생이에요', ['Ответ ученика: x']), p => host.append(p), onToggle))
  return host
}
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0))
}

describe('Спросить ИИ', () => {
  it('контекст содержит предложение, перевод и части', () => {
    const c = breakdownContext('저는 학생이에요', ['Ответ ученика: x'])
    expect(c).toContain('Предложение: 저는 학생이에요')
    expect(c).toContain('Как собрано:')
    expect(c).toContain('Ответ ученика: x')
  })
  it('панель закрыта, пока не нажали кнопку; нажатие сообщает окну', () => {
    const seen: boolean[] = []
    const host = mountAsk(o => seen.push(o))
    const panel = host.querySelector<HTMLElement>('.ask-panel')!
    expect(panel.hidden).toBe(true)
    host.querySelector<HTMLButtonElement>('.ask-btn')!.click()
    expect(panel.hidden).toBe(false)
    host.querySelector<HTMLButtonElement>('.ask-btn')!.click()
    expect(seen).toEqual([true, false])
  })
  it('быстрый вопрос уходит с разбором, ответ рисуется карточкой, следующий вопрос дописывает тот же чат', async () => {
    const host = mountAsk()
    host.querySelector<HTMLButtonElement>('.ask-btn')!.click()
    host.querySelector<HTMLButtonElement>('.ask-chip')!.click()
    await settle()
    expect(bodies[0]!.conv).toBe('new')
    expect(String(bodies[0]!.context)).toContain('저는 학생이에요')
    expect(host.querySelector('.ask-phrase .ask-ko')?.textContent).toBe('저는 빵을 먹어요.')
    const input = host.querySelector<HTMLInputElement>('.ask-in')!
    input.value = 'А почему 는?'
    host.querySelector<HTMLFormElement>('.ask-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await settle()
    expect(bodies[1]!.conv).toBe('aaaaaaaaaaaaaaaa')
    expect((bodies[1]!.messages as unknown[]).length).toBe(3)
  })
  it('лимит закончился: понятное сообщение, вопрос не остаётся в переписке', async () => {
    status = 429
    const host = mountAsk()
    host.querySelector<HTMLButtonElement>('.ask-btn')!.click()
    host.querySelector<HTMLButtonElement>('.ask-chip')!.click()
    await settle()
    expect(host.querySelector('.ask-msg.err')?.textContent).toContain('закончились')
    status = 200
    host.querySelector<HTMLButtonElement>('.ask-chip')?.click()
    host.querySelector<HTMLFormElement>('.ask-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    host.querySelector<HTMLInputElement>('.ask-in')!.value = 'ещё'
    host.querySelector<HTMLFormElement>('.ask-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await settle()
    expect((bodies[bodies.length - 1]!.messages as unknown[]).length).toBe(1)
  })
})
