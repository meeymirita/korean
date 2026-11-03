import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import KnowView from '@/views/korean/KnowView.vue'
import LabView from '@/views/korean/LabView.vue'
import SitesView from '@/views/korean/SitesView.vue'
import KeyboardView from '@/views/korean/KeyboardView.vue'
import { G } from '@/data/korean/grammar'

describe('новые страницы раздела', () => {
  it('«Что я уже знаю»: карточка на каждую пройденную тему', async () => {
    const w = await mountSuspended(KnowView)
    expect(w.findAll('.know-item').length).toBe(G.filter(g => g.st === 'ok').length)
    expect(w.text()).toContain('이에요')
    w.unmount()
  })

  it('«Мастерская»: конструктор собирает предложение и меняет его при выборе', async () => {
    const w = await mountSuspended(LabView)
    expect(w.find('.sentence').text()).toBe('저는 커피를 마셔요.')
    const chips = w.findAll('.slot .chip')
    await chips[2]!.trigger('click') // «Не…»
    expect(w.find('.sentence').text()).toContain('안 ')
    w.unmount()
  })

  it('«Полезные сайты»: все ссылки открываются в новой вкладке безопасно', async () => {
    const w = await mountSuspended(SitesView)
    const links = w.findAll('a.site')
    expect(links.length).toBeGreaterThan(5)
    for (const a of links) {
      expect(a.attributes('target')).toBe('_blank')
      expect(a.attributes('rel')).toContain('noopener')
    }
    w.unmount()
  })

  it('тренажёр печати: верные нажатия двигают задание, ошибка считается', async () => {
    const w = await mountSuspended(KeyboardView, { attachTo: document.body })
    await nextTick()
    const input = w.find('input.catch')
    const need = () => w.find('.need b').text()
    const first = need()
    expect(first).not.toBe('')
    // неверная клавиша не двигает задание
    const hit = () => w.find('.kb .key.hit')
    const keys = w.findAll('.kb .key').map(k => k.classes().includes('hit'))
    expect(keys.filter(Boolean).length).toBe(1)
    const L = 'qwertyuiopasdfghjklzxcvbnm'
    const wrong = L[(keys.indexOf(true) + 1) % L.length]!
    await input.trigger('keydown', { code: 'Key' + wrong.toUpperCase(), key: wrong })
    expect(w.find('.count').text()).toContain('1 из')
    expect(hit().exists()).toBe(true)
    // верная нажимается: в режиме букв одно нажатие = следующее задание
    const idx = keys.indexOf(true)
    await input.trigger('keydown', { code: 'Key' + L[idx]!.toUpperCase(), key: L[idx] })
    expect(w.find('.count').text()).toContain('2 из')
    w.unmount()
  })
})
