import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import GrammarAsk from '@/components/korean/GrammarAsk.vue'
import { G } from '@/data/korean/grammar'

// «Что хочешь сказать?»: рассказы из «Мастера+» (кнопка «Случайный рассказ»)
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))
const buttons = (w: { findAll: (s: string) => { element: Element }[] }) => w.findAll('.opts .o').map(b => b.element as HTMLButtonElement)

describe('«Что хочешь сказать?»: цепочки', () => {
  it('случайный рассказ показывает три предложения с двумя связками и кнопку «Ещё случайный»', async () => {
    const w = await mountSuspended(GrammarAsk, { props: { cards: G.filter(g => g.st === 'ok') } })
    await flushPromises()
    await pause(500)
    buttons(w).find(b => b.textContent!.includes('Соединить предложения'))!.click()
    await pause(900)
    expect(w.text()).toContain('Их пять')
    buttons(w).find(b => b.textContent!.includes('Случайный рассказ'))!.click()
    await pause(900)
    const pair = w.findAll('.pair').at(-1)!
    expect(pair.findAll('.a, .b').length).toBe(3)
    expect(w.text()).toMatch(/Здесь 2 связки/)
    expect(buttons(w).some(b => b.textContent!.includes('Ещё случайный'))).toBe(true)
  })
})
