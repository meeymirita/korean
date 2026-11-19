import { describe, expect, it } from 'vitest'
import { koreanOnly, splitKorean } from '@/lib/voiceText'

// Реплика собеседника режется на русский текст и корейские фразы (их показываем крупно и разбираем по нажатию).
describe('голос: корейские фразы в реплике', () => {
  it('русский и корейский отделяются, знаки конца остаются у фразы', () => {
    expect(splitKorean('Скажи: 이름이 뭐예요? Хорошо.')).toEqual([
      { text: 'Скажи: ', ko: false },
      { text: '이름이 뭐예요?', ko: true },
      { text: ' Хорошо.', ko: false },
    ])
  })
  it('несколько слов подряд это одна фраза, без хангыля всё русское', () => {
    expect(splitKorean('집에 있어요, 공부해요')).toEqual([{ text: '집에 있어요, 공부해요', ko: true }])
    expect(splitKorean('Привет!')).toEqual([{ text: 'Привет!', ko: false }])
    expect(splitKorean('')).toEqual([])
  })
  it('для разбора знак конца убирается', () => {
    expect(koreanOnly('뭐예요?')).toBe('뭐예요')
  })
})

describe('голос: ширина окна при растягивании', () => {
  it('не уже 340 px и не шире окна браузера', async () => {
    const { clampPanelWidth } = await import('@/lib/voiceText')
    expect(clampPanelWidth(100, 1440)).toBe(340)
    expect(clampPanelWidth(900, 1440)).toBe(900)
    expect(clampPanelWidth(5000, 1440)).toBe(1416)
    expect(clampPanelWidth(500, 300)).toBe(276)
  })
})
