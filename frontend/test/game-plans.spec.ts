import { describe, expect, it } from 'vitest'
import { boot, closeHelp } from './game-helpers'

// Режимы «Планы (-(으)ㄹ 거예요)» и «Только (만)» (отдельный файл: игровые тесты в одном файле упираются в память).
function start(mode: string) {
  boot({ mode: () => mode })
  closeHelp()
}

const opts = () => [...document.querySelectorAll<HTMLButtonElement>('#opts .opt')]
const optText = (b: Element) => (b.querySelector('.t')?.textContent ?? '').trim()
const next = () => (document.querySelector('#nextBtn') as HTMLButtonElement).click()

/** Отвечает «наугад» n раз: у каждого вопроса варианты разные, верный один; возвращает верные ответы. */
function play(mode: string, n: number) {
  start(mode)
  const rights: string[] = []
  for (let i = 0; i < n; i++) {
    const texts = opts().map(optText)
    expect(new Set(texts).size, `${mode}: варианты не повторяются`).toBe(texts.length)
    opts()[0]!.click()
    expect(document.querySelectorAll('#opts .opt.ok').length, `${mode}: верный один`).toBe(1)
    rights.push(optText(document.querySelector('#opts .opt.ok')!))
    next()
  }
  return rights
}

describe('режим «Планы (-(ㄹ)을 거예요)»', () => {
  it('верный ответ: форма будущего (거예요) или обычное настоящее при «지금»', () => {
    for (const r of play('fut', 120)) expect(r).toMatch(/(거예요|어요|아요|해요|가요|봐요|셔요|요)$/)
  })
  it('в «Планах» бывают и будущее, и настоящее, но будущее чаще', () => {
    const rights = play('fut', 200)
    expect(rights.filter(r => r.endsWith('거예요')).length).toBeGreaterThan(80)
    expect(rights.filter(r => !r.endsWith('거예요')).length).toBeGreaterThan(5)
  })
})

describe('режим «Только (만)»', () => {
  it('верный ответ: 만, 도, 에만 или 에서만', () => {
    const rights = play('only', 150)
    for (const r of rights) expect(['만', '도', '에만', '에서만']).toContain(r)
    expect(rights).toContain('도')
    expect(rights).toContain('에만')
  })
})
