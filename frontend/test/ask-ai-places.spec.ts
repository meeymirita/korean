import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AskAi from '@/components/korean/AskAi.vue'

// «Спросить ИИ» как общий компонент: показывается только владельцу после входа, контекст уходит модели, быстрые вопросы свои у каждого места.
let owner = true
vi.mock('@/stores/progress', async original => {
  const real = await original<typeof import('@/stores/progress')>()
  return {
    ...real,
    useProgressStore: (...a: Parameters<typeof real.useProgressStore>) =>
      new Proxy(real.useProgressStore(...a), {
        get: (t, k, r) => (k === 'unlocked' ? owner : k === 'role' ? (owner ? 'owner' : 'guest') : k === 'bearer' ? 'токен' : Reflect.get(t, k, r)),
      }),
  }
})

const bodies: Record<string, unknown>[] = []
beforeEach(() => {
  bodies.length = 0
  owner = true
  vi.stubGlobal('fetch', async (_u: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ reply: 'Ответ', left: 39, conv: 'aaaaaaaaaaaaaaaa' }))
  })
})

describe('AskAi в разных местах', () => {
  it('у владельца есть кнопка, свои быстрые вопросы и контекст из места', async () => {
    const w = await mountSuspended(AskAi, { props: { context: 'Правило из карточки: 은/는', quick: ['Объясни правило'], placeholder: 'Спроси про это правило…' } })
    expect(w.find('.ask-btn').exists()).toBe(true)
    expect(w.findAll('.ask-chip').map(c => c.text())).toEqual(['Объясни правило'])
    expect(w.find('.ask-in').attributes('placeholder')).toBe('Спроси про это правило…')
    await w.find('.ask-btn').trigger('click')
    await w.find('.ask-chip').trigger('click')
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    expect(bodies[0]!.context).toBe('Правило из карточки: 은/는')
  })
  it('контекст можно дать функцией: берётся при каждом вопросе', async () => {
    let n = 0
    const w = await mountSuspended(AskAi, { props: { context: () => `Слово ${++n}` } })
    await w.find('.ask-btn').trigger('click')
    await w.find('.ask-chip').trigger('click')
    await flushPromises()
    await new Promise(r => setTimeout(r, 0))
    expect(bodies[0]!.context).toBe('Слово 1')
  })
  it('у гостя и без входа кнопки нет', async () => {
    owner = false
    const w = await mountSuspended(AskAi, { props: { context: 'x' } })
    expect(w.find('.ask-btn').exists()).toBe(false)
  })
})
