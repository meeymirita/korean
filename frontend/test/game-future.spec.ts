import { describe, expect, it } from 'vitest'
import { boot, closeHelp } from './game-helpers'
import { futureForm } from '@/data/korean/conjugation'

// «Выбери форму»: будущее время -(ㄹ)을 거예요 (отдельный файл: игровые тесты в одном файле упираются в память).
function start(save?: object) {
  boot({ mode: () => 'form' }, false, save)
  closeHelp()
}

/** Играет n вопросов, возвращает подписи, плитки и подчёркнутое слово каждого вопроса (всегда выбирает первый вариант). */
function play(n: number) {
  const seen: { label: string; options: string[] }[] = []
  for (let i = 0; i < n; i++) {
    seen.push({
      label: document.querySelector('.label')?.textContent ?? '',
      options: [...document.querySelectorAll<HTMLElement>('#opts .opt')].map(o => o.textContent ?? ''),
    })
    ;(document.querySelector('#opts .opt') as HTMLButtonElement)?.click()
    ;(document.querySelector('#nextBtn') as HTMLButtonElement)?.click()
  }
  return seen
}

describe('futureForm: будущее с -(으)ㄹ 거예요', () => {
  it('ㄹ после гласной, 을 после 받침, основа на ㄹ, глаголы на 하다; ㄷ / ㅂ-изменения пропускаются', () => {
    expect(futureForm('가다')).toBe('갈 거예요')
    expect(futureForm('보다')).toBe('볼 거예요')
    expect(futureForm('쉬다')).toBe('쉴 거예요')
    expect(futureForm('마시다')).toBe('마실 거예요')
    expect(futureForm('먹다')).toBe('먹을 거예요')
    expect(futureForm('읽다')).toBe('읽을 거예요')
    expect(futureForm('살다')).toBe('살 거예요')
    expect(futureForm('만들다')).toBe('만들 거예요')
    expect(futureForm('운동하다')).toBe('운동할 거예요')
    expect(futureForm('듣다')).toBeNull()
    expect(futureForm('돕다')).toBeNull()
    expect(futureForm('학교')).toBeNull()
  })
})

describe('игра «Выбери форму»: будущее время', () => {
  it('в настройках по умолчанию «будущее: да», среди вопросов бывает будущее; верная форма среди плиток, есть ловушка с неверным ㄹ / 을', () => {
    start()
    expect(($('#fut') as HTMLSelectElement).value).toBe('on')
    const seen = play(120).filter(x => x.label.includes('будущего'))
    expect(seen.length).toBeGreaterThan(5)
    for (const q of seen) {
      expect(q.options.length).toBe(4)
      expect(q.options.some(o => o.endsWith('거예요'))).toBe(true)
      expect(new Set(q.options).size).toBe(4)
    }
  })

  it('«будущее: нет» и «только настоящее» убирают будущее', () => {
    start({ fut: 'off' })
    expect(play(100).some(x => x.label.includes('будущего'))).toBe(false)
    start({ tense: 'pres' })
    expect(play(100).some(x => x.label.includes('будущего'))).toBe(false)
  })
})

function $(s: string) {
  return document.querySelector(s) as HTMLElement
}
