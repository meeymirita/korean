import { describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ReadView from '@/views/korean/ReadView.vue'
import { READ_QUESTIONS } from '@/data/korean/read'
import { EXCHANGES } from '@/game/dialogs'

// «Чтение и диалоги»: рассказы с вопросом и сценки с ответами собеседнику.
describe('Чтение и диалоги', () => {
  it('«Рассказы»: виден рассказ и вопрос, четыре варианта; верный ответ показывает перевод предложения', async () => {
    const w = await mountSuspended(ReadView)
    expect(w.find('.rd-tabs .on').text()).toBe('Рассказы')
    expect(w.find('.rs-bar').text()).toContain('1 из 8')
    expect(w.find('.rs-sub').text()).toContain('Рассказ «')
    expect(w.find('.rs-sub').classes()).toContain('rs-pre')
    expect(w.findAll('.rs-opt')).toHaveLength(4)
    const q = READ_QUESTIONS.find(r => r.q === w.find('.rs-q').text())!
    expect(q).toBeTruthy()
    await w.findAll('.rs-opt').find(b => b.text().includes(q.a))!.trigger('click')
    expect(w.find('.rs-note').text()).toContain('В рассказе:')
    w.unmount()
  })

  it('«Диалоги»: заголовок с названием сценки, вопрос собеседника, три варианта ответа; неверный ответ объясняет, на какой вопрос он подходит', async () => {
    const w = await mountSuspended(ReadView)
    await w.findAll('.rd-tabs button')[1]!.trigger('click')
    await new Promise(r => setTimeout(r, 100)) // вкладка записывается в адрес, переход идёт чуть позже клика
    await flushPromises()
    expect(w.find('.rd-tabs .on').text()).toBe('Диалоги')
    expect(w.find('.rs-sub').text()).toContain('Диалог «')
    const ask = w.find('.rs-q').text().replace(/^—\s*/, '')
    const ex = EXCHANGES.find(e => e[0] === ask)!
    expect(ex).toBeTruthy()
    expect(w.findAll('.rs-opt')).toHaveLength(3)
    await w.findAll('.rs-opt').find(b => !b.text().includes(ex[2]))!.trigger('click')
    expect(w.find('.rs-sub.rs-note, .xb').exists() || w.text().includes('это про')).toBe(true)
    w.unmount()
  })
})
