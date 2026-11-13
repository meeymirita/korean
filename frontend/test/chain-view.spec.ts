import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ChainView from '@/views/korean/ChainView.vue'
import { lastSyllable, firstSyllable } from '@/data/korean/chain'

describe('Цепочки слов', () => {
  it('серия из 12, верный ответ показывает перевод, следующее опорное слово это ответ', async () => {
    const w = await mountSuspended(ChainView)
    expect(w.find('.rs-bar').text()).toContain('1 из 12')
    const q = w.find('.rs-q').text()
    const need = lastSyllable(q)
    const opts = w.findAll('.rs-opt')
    expect(opts).toHaveLength(4)
    const rights = opts.filter(b => firstSyllable(b.attributes('data-opt')!) === need)
    expect(rights).toHaveLength(1)
    expect(w.find('.rs-note').exists()).toBe(false)
    const answer = rights[0]!.attributes('data-opt')!
    await rights[0]!.trigger('click')
    expect(w.find('.rs-note').text()).toContain(q)
    expect(w.find('.rs-note').text()).toContain(answer)
    expect(w.find('.xb').exists()).toBe(false)
    await w.find('.rs-next').trigger('click')
    expect(w.find('.rs-bar').text()).toContain('2 из 12')
    expect(w.find('.rs-q').text()).toBe(answer)
    w.unmount()
  })

  it('неверный ответ: разбор ошибки с переводом, отдельного абзаца нет', async () => {
    const w = await mountSuspended(ChainView)
    const q = w.find('.rs-q').text()
    const need = lastSyllable(q)
    await w.findAll('.rs-opt').find(b => firstSyllable(b.attributes('data-opt')!) !== need)!.trigger('click')
    expect(w.find('.xb').text()).toContain(`«${q}»`)
    expect(w.find('.rs-note').exists()).toBe(false)
    w.unmount()
  })
})
