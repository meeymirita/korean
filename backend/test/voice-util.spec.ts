import { describe, expect, it } from 'vitest'
import { KNOWN_WORDS } from '../src/chat/curriculum'
import { SYSTEM_PROMPT } from '../src/voice/prompt'
import { cleanRole, cleanText, costOf, countedSeconds, dayKey, secretBody } from '../src/voice/voice.util'

// Голосовой собеседник: чистые функции (без базы и сети).
describe('голос: день для суточного лимита', () => {
  it('день считается по часовому поясу, а не по UTC', () => {
    const t = Date.UTC(2026, 10, 16, 20, 0) // 20:00 UTC = 03:00 17 ноября в Новосибирске
    expect(dayKey(t, 'UTC')).toBe('2026-11-16')
    expect(dayKey(t, 'Asia/Novosibirsk')).toBe('2026-11-17')
  })
  it('неизвестный пояс не роняет сервер', () => {
    expect(dayKey(Date.UTC(2026, 10, 16, 5), 'Нет/Такого')).toBe('2026-11-16')
  })
})

describe('голос: ввод и расчёты', () => {
  it('роль и текст реплики проверяются', () => {
    expect(cleanRole('user')).toBe('user')
    expect(cleanRole('assistant')).toBe('assistant')
    expect(cleanRole('system')).toBeNull()
    expect(cleanText('  안녕하세요 \n  반갑습니다 ')).toBe('안녕하세요 반갑습니다')
    expect(cleanText('   ')).toBeNull()
    expect(cleanText(5)).toBeNull()
    expect(cleanText('я'.repeat(9000))!.length).toBe(4000)
  })
  it('секунды разговора считает сервер и режет по пределу', () => {
    expect(countedSeconds(0, 90_000, 600)).toBe(90)
    expect(countedSeconds(0, 3_600_000, 600), 'вкладку забыли закрыть').toBe(600)
    expect(countedSeconds(5000, 1000, 600), 'часы назад не идут').toBe(0)
  })
  it('цена примерная, до цента', () => {
    expect(costOf(600, 0.05)).toBe(0.5)
    expect(costOf(0, 0.05)).toBe(0)
  })
})

describe('голос: запрос временного ключа и инструкция', () => {
  const body = secretBody({ model: 'gpt-realtime-mini', voice: 'marin', ttl: 120 })
  it('модель, голос и короткий срок ключа заданы сервером', () => {
    expect(body.expires_after.seconds).toBe(120)
    expect(body.session.model).toBe('gpt-realtime-mini')
    expect(body.session.audio.output.voice).toBe('marin')
    expect(body.session.audio.input.transcription.model).toBeTruthy()
    expect(body.session.instructions).toBe(SYSTEM_PROMPT)
  })
  it('в инструкции пройденное и правила про пол и границы', () => {
    expect(SYSTEM_PROMPT).toContain(KNOWN_WORDS.slice(0, 20))
    expect(SYSTEM_PROMPT).toMatch(/Пол ученика неизвестен/)
    expect(SYSTEM_PROMPT).toMatch(/НЕ пройдено/)
    expect(SYSTEM_PROMPT).toMatch(/Только корейский язык/)
    expect(SYSTEM_PROMPT).not.toMatch(/[぀-ヿ一-鿿]/)
  })
})
