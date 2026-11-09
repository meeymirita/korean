import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import ExamRun from '@/components/korean/ExamRun.vue'
import { blockRules, examParts, partPoints, type ExamBlock, type PartAnswers, type PointResult } from '@/data/korean/exam'

/** Проходит часть экзамена: верно (из данных блоков) или специально неверно. */
async function fillPart(wrapper: Awaited<ReturnType<typeof mountSuspended>>, blocks: ExamBlock[], correct: boolean) {
  const root = wrapper.element as HTMLElement
  const sections = [...root.querySelectorAll<HTMLElement>('.er-block')]
  for (const [bi, b] of blocks.entries()) {
    const sec = sections[bi]!
    if (b.kind === 'gaps') {
      const gaps = [...sec.querySelectorAll<HTMLElement>('.er-gap')]
      const answers = b.sentences.flatMap(s => s.pieces.filter(p => typeof p !== 'string').map(p => (p as { answer: string }).answer))
      for (const [i, g] of gaps.entries()) {
        const ans = correct ? answers[i]! : '＠'
        if (b.typed) {
          const input = g as HTMLInputElement
          input.value = ans
          input.dispatchEvent(new Event('input'))
        } else {
          const tile = [...sec.querySelectorAll<HTMLButtonElement>('.er-bank .er-tile')].find(t => t.textContent === (correct ? ans : b.bank.find(x => x !== answers[i])))!
          tile.click()
          await nextTick()
        }
      }
    } else if (b.kind === 'match') {
      const sels = [...sec.querySelectorAll<HTMLSelectElement>('select')]
      for (const [i, s] of sels.entries()) {
        s.value = correct ? b.items[i]!.ru : b.choices.find(c => c !== b.items[i]!.ru)!
        s.dispatchEvent(new Event('change'))
      }
    } else if (b.kind === 'order') {
      const lis = [...sec.querySelectorAll<HTMLElement>('li')]
      for (const [i, li] of lis.entries()) {
        const words = b.items[i]!.words
        const order = correct ? b.items[i]!.ko.split(/\s+/).map(w => words.indexOf(w)) : words.map((_, k) => k)
        const used = new Set<number>()
        for (const w of order) {
          let idx = w
          if (correct) {
            // одинаковые слова: берём первый неиспользованный индекс
            idx = words.findIndex((x, k) => x === b.items[i]!.ko.split(/\s+/)[order.indexOf(w)] && !used.has(k))
          }
          used.add(idx)
          ;[...li.querySelectorAll<HTMLButtonElement>('.er-bank .er-tile')][idx]!.click()
          await nextTick()
        }
      }
    } else {
      const lis = [...sec.querySelectorAll<HTMLElement>('li')]
      for (const [i, li] of lis.entries()) {
        const btns = li.querySelectorAll<HTMLButtonElement>('.er-yn .er-tile')
        const wantBad = correct ? b.items[i]!.bad : !b.items[i]!.bad
        btns[wantBad ? 1 : 0]!.click()
        await nextTick()
      }
    }
  }
}

describe('ExamRun: часть итогового экзамена', () => {
  it('все ответы верные: каждый пункт верный, результаты по правилам, ничего не показывается по ходу', async () => {
    const blocks = examParts()[0]!
    let points: PointResult[] = []
    const wrapper = await mountSuspended(ExamRun, { props: { blocks, part: 1, parts: 3, onSaved: (p: PointResult[]) => (points = p) } })
    await nextTick()
    const btn = () => wrapper.element.querySelector<HTMLButtonElement>('.er-foot .rs-start')!
    expect(btn().disabled).toBe(true) // пока не всё отвечено
    expect(btn().textContent).toContain('Сохранить часть')
    await fillPart(wrapper, blocks, true)
    await nextTick()
    expect(btn().disabled).toBe(false)
    btn().click()
    await nextTick()
    expect(points.length).toBe(partPoints(blocks))
    expect(points.every(p => p.ok), JSON.stringify(points.filter(p => !p.ok))).toBe(true)
    expect(points.map(p => p.rule)).toEqual(blocks.flatMap(blockRules))
    // по ходу и после сохранения правильные ответы не показываются
    expect(wrapper.element.querySelector('.er-right, .er-mark')).toBeNull()
    wrapper.unmount()
  })

  it('все ответы неверные: у каждого пункта ошибка с вопросом, ответом и верным ответом', async () => {
    const blocks = examParts()[1]!
    let points: PointResult[] = []
    const wrapper = await mountSuspended(ExamRun, { props: { blocks, part: 3, parts: 3, onSaved: (p: PointResult[]) => (points = p) } })
    await nextTick()
    await fillPart(wrapper, blocks, false)
    await nextTick()
    const btn = wrapper.element.querySelector<HTMLButtonElement>('.er-foot .rs-start')!
    expect(btn.textContent).toContain('Закончить экзамен')
    btn.click()
    await nextTick()
    expect(points.length).toBe(partPoints(blocks))
    const wrong = points.filter(p => !p.ok)
    expect(wrong.length).toBeGreaterThan(points.length * 0.8)
    for (const p of wrong) expect(p.m && p.m.q && p.m.a && p.m.b).toBeTruthy()
    wrapper.unmount()
  })

  it('«Сохранить и выйти»: ответы отдаются без оценки, и при возврате восстанавливаются', async () => {
    const blocks = examParts()[2]!
    let paused: PartAnswers | null = null
    let saved = false
    const w1 = await mountSuspended(ExamRun, { props: { blocks, part: 2, parts: 3, onPause: (a: PartAnswers) => (paused = a), onSaved: () => (saved = true) } })
    await nextTick()
    // отвечаем только на несколько пунктов: блок с ошибками, первое предложение
    const errBlock = blocks.findIndex(b => b.kind === 'errors')
    const sec = [...w1.element.querySelectorAll<HTMLElement>('.er-block')][errBlock]!
    sec.querySelectorAll<HTMLElement>('li')[0]!.querySelectorAll<HTMLButtonElement>('.er-yn .er-tile')[1]!.click()
    await nextTick()
    const pauseBtn = w1.element.querySelector<HTMLButtonElement>('.ex-pause')!
    expect(pauseBtn.disabled).toBe(false) // без обязательного ответа на все пункты
    pauseBtn.click()
    await nextTick()
    expect(saved).toBe(false)
    expect(paused).not.toBeNull()
    expect(paused!.verdict[`${errBlock}:0`]).toBe(true)
    w1.unmount()
    const w2 = await mountSuspended(ExamRun, { props: { blocks, part: 2, parts: 3, initial: paused! } })
    await nextTick()
    const sec2 = [...w2.element.querySelectorAll<HTMLElement>('.er-block')][errBlock]!
    expect(sec2.querySelectorAll<HTMLElement>('li')[0]!.querySelectorAll('.er-yn .er-tile')[1]!.classList.contains('on')).toBe(true)
    expect(w2.element.textContent).toContain('Осталось ответить')
    w2.unmount()
  })
})
