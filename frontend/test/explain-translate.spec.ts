import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ExplainTranslateView from '@/views/korean/ExplainTranslateView.vue'
import TaskSession from '@/components/korean/TaskSession.vue'
import { STUDY_TRANSLATIONS } from '@/data/korean/study'
import type { Task } from '@/data/korean/tasks'

describe('Переведи и объясни', () => {
  it('после ответа показан разбор предложения и список правил со ссылками', async () => {
    const w = await mountSuspended(ExplainTranslateView)
    expect(w.find('.rs-bar').text()).toContain('1 из 15')
    expect(w.find('.rs-rules').exists()).toBe(false)
    const ko = w.find('.rs-q').text()
    const right = STUDY_TRANSLATIONS[ko]!
    await w.findAll('.rs-opt').find(b => b.text().includes(right))!.trigger('click')
    expect(w.find('.bd-cards').exists()).toBe(true)
    expect(w.find('.rs-rules').exists()).toBe(true)
    expect(w.findAll('.rs-rules li').length).toBeGreaterThan(0)
    expect(w.find('.rs-rules .xb-b').text()).toBe('Открыть правило')
    expect(w.find('.xb').exists()).toBe(false) // верный ответ: разбора ошибки нет
    w.unmount()
  })

  it('неверный ответ: разбор ошибки и правила тоже видны', async () => {
    const w = await mountSuspended(ExplainTranslateView)
    const right = STUDY_TRANSLATIONS[w.find('.rs-q').text()]!
    await w.findAll('.rs-opt').find(b => !b.text().includes(right))!.trigger('click')
    expect(w.find('.xb').exists()).toBe(true)
    expect(w.find('.rs-rules').exists()).toBe(true)
    w.unmount()
  })

  it('у обычного задания без rules блока правил нет', async () => {
    const t: Task = { id: 0, kind: 'tr', title: 'Т', prompt: '저는 학생이에요.', options: ['A', 'B'], answer: 'A', sentence: '저는 학생이에요.' }
    const w = await mountSuspended(TaskSession, { props: { tasks: [t], source: 'test' } })
    await w.findAll('.rs-opt')[0]!.trigger('click')
    expect(w.find('.rs-rules').exists()).toBe(false)
    w.unmount()
  })
})
