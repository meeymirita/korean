import { describe, expect, it } from 'vitest'
import { answerAndNext, hasBatchim, start } from './game-helpers'

// Игры по разделам грамматики (вынесено из game.spec.ts: тот не помещался в память на CI).
describe('игры по разделам грамматики', () => {
  it('«Это или не это»: форма по 받침 и по смыслу (это / не это)', () => {
    start('neg')
    for (let i = 0; i < 80; i++) {
      const prompt = (document.querySelector('.prompt')!.textContent ?? '').trim()
      const right = answerAndNext()
      const neg = prompt.startsWith('Это не ')
      const m = /^(.+?)(이에요|예요|이 아니에요|가 아니에요)$/.exec(right)
      expect(m, `${prompt} → ${right}`).not.toBeNull()
      const [, stem, ending] = m!
      expect(ending.includes('아니에요'), prompt).toBe(neg)
      const withB = hasBatchim(stem![stem!.length - 1]!)
      expect(['이에요', '이 아니에요'].includes(ending!), `${prompt} → ${right}`).toBe(withB)
    }
  })

  it('«Куда, где»: 에 к 가요 и 있어요, 에서 к действию', () => {
    start('place')
    let at = 0
    let to = 0
    for (let i = 0; i < 150; i++) {
      const sentence = (document.querySelector('.sentence')!.textContent ?? '').replace(/\s+/g, ' ')
      const right = answerAndNext()
      const moves = /(가요|있어요)\.$/.test(sentence.trim())
      expect(right, sentence).toBe(moves ? '에' : '에서')
      if (moves) to++
      else at++
    }
    expect(at).toBeGreaterThan(20)
    expect(to).toBeGreaterThan(20)
  })

  it('«Этот, тот, вон тот»: значения указателей', () => {
    const ko: Record<string, string> = { 'этот (рядом со мной)': '이', 'эта вещь (рядом со мной)': '이것', 'здесь (рядом со мной)': '여기', 'вон тот (далеко от обоих)': '저', 'вон там (далеко от обоих)': '저기', 'вон та вещь (далеко от обоих)': '저것' }
    start('dem')
    let checked = 0
    for (let i = 0; i < 120; i++) {
      const prompt = (document.querySelector('.prompt')!.textContent ?? '').trim()
      const right = answerAndNext()
      if (ko[prompt]) {
        expect(right, prompt).toBe(ko[prompt])
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('«Уровень вежливости»: другу — 고마워, начальнику — 감사합니다', () => {
    start('polite')
    let checked = 0
    for (let i = 0; i < 80; i++) {
      const prompt = (document.querySelector('.prompt')!.textContent ?? '').trim()
      const right = answerAndNext()
      if (prompt === 'друзьям') {
        expect(right).toBe('고마워')
        checked++
      }
      if (prompt === '감사합니다') {
        expect(right).toContain('по работе')
        checked++
      }
    }
    expect(checked).toBeGreaterThan(5)
  })
})
