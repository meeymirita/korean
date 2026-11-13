import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import PartOfSpeechView from '@/views/korean/PartOfSpeechView.vue'
import { posWords, POS_LABEL } from '@/data/korean/part-of-speech'

const rightOf = (ko: string) => POS_LABEL[posWords().find(w => w.k === ko)!.pos]

describe('Определи часть речи', () => {
  it('три варианта; верный ответ: объяснение и пример в предложении, ошибки нет', async () => {
    const w = await mountSuspended(PartOfSpeechView)
    expect(w.find('.rs-bar').text()).toContain('1 из 15')
    expect(w.findAll('.rs-opt').length).toBe(3)
    expect(w.find('.rs-note').exists()).toBe(false)
    const right = rightOf(w.find('.rs-q').text())
    await w.findAll('.rs-opt').find(b => b.text().includes(right))!.trigger('click')
    expect(w.find('.rs-note').text()).toContain('это')
    expect(w.find('.xb').exists()).toBe(false)
    expect(w.find('.bd-cards').exists()).toBe(true)
    w.unmount()
  })

  it('неверный ответ: разбор ошибки с объяснением и пример', async () => {
    const w = await mountSuspended(PartOfSpeechView)
    const ko = w.find('.rs-q').text()
    const right = rightOf(ko)
    await w.findAll('.rs-opt').find(b => !b.text().includes(right))!.trigger('click')
    expect(w.find('.xb').text()).toContain(`«${ko}» это`)
    expect(w.find('.bd-cards').exists()).toBe(true)
    w.unmount()
  })
})
