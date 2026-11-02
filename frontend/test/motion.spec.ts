import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gsap } from 'gsap'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, nextTick, ref } from 'vue'
import { countTo, enterPage, initMotion, swapTab } from '@/lib/motion'

/** Дорисовывает все анимации до конца сразу (проверяем, что после них ничего не осталось невидимым или сдвинутым). */
const finish = () => gsap.globalTimeline.progress(1, false)
let stop: (() => void) | undefined

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
})
afterEach(() => {
  stop?.()
  stop = undefined
  gsap.globalTimeline.clear()
  vi.unstubAllGlobals()
})

describe('анимации сайта (GSAP)', () => {
  it('окно с role=dialog появляется плавно и после анимации не остаётся прозрачным или сдвинутым', async () => {
    stop = initMotion()
    document.body.innerHTML = '<div class="back"><div role="dialog" class="box">окно</div></div>'
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    const box = document.querySelector<HTMLElement>('.box')!
    expect(box.hasAttribute('data-m')).toBe(true)
    finish()
    expect(box.style.opacity).toBe('')
    expect(box.style.transform).toBe('')
  })

  it('карточки в пределах экрана остаются видимыми (их не прячут навсегда)', async () => {
    stop = initMotion()
    document.body.innerHTML = '<div class="gh-cards"><a class="gh-card">игра</a><a class="gh-card">игра 2</a></div>'
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
    finish()
    for (const c of document.querySelectorAll<HTMLElement>('.gh-card')) {
      expect(c.style.opacity === '' || c.style.opacity === '1').toBe(true)
    }
  })

  it('появление страницы: блоки выезжают и после анимации стоят на месте', () => {
    document.body.innerHTML = '<div class="wrap"><section>1</section><section>2</section><section>3</section></div>'
    enterPage()
    const first = document.querySelector<HTMLElement>('.wrap > section')!
    expect(first.hasAttribute('data-m')).toBe(true)
    finish()
    expect(first.style.opacity).toBe('')
    expect(first.style.transform).toBe('')
  })

  it('смена вкладки: содержимое появляется заново и возвращается в обычное состояние', () => {
    document.body.innerHTML = '<div class="cb-body">вкладка</div>'
    swapTab()
    finish()
    const el = document.querySelector<HTMLElement>('.cb-body')!
    expect(el.style.opacity).toBe('')
  })

  it('«уменьшить движение»: ничего не анимируется', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }))
    stop = initMotion()
    document.body.innerHTML = '<div class="wrap"><section>1</section></div><div class="back"><div role="dialog" class="box">окно</div></div>'
    await nextTick()
    enterPage()
    swapTab()
    const box = document.querySelector<HTMLElement>('.box')!
    expect(box.hasAttribute('data-m')).toBe(false)
    expect(document.querySelector('.wrap > section')!.hasAttribute('data-m')).toBe(false)
    expect(document.querySelector('.wrap > section')!.getAttribute('style')).toBeNull()
  })

  it('счётчик: число доходит до нужного и остаётся узлом Vue', () => {
    const t = document.createTextNode('0')
    countTo(t, 42, 0)
    finish()
    expect(t.nodeValue).toBe('42')
    countTo(t, 42, 42)
    expect(t.nodeValue).toBe('42')
  })

  it('директива v-count: после обновления показывает новое число, обычные обновления Vue дальше работают', async () => {
    const n = ref(5)
    const C = defineComponent({ setup: () => ({ n }), template: '<b class="c" v-count="n">{{ n }}</b>' })
    const w = await mountSuspended(C)
    expect(w.find('.c').text()).toBe('5')
    n.value = 30
    await nextTick()
    finish()
    expect(w.find('.c').text()).toBe('30')
    n.value = 31
    await nextTick()
    finish()
    expect(w.find('.c').text()).toBe('31')
  })
})
