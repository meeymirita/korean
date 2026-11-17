import { describe, expect, it } from 'vitest'
import { KNOWN_GRAMMAR, KNOWN_NOT_YET, KNOWN_READINGS, KNOWN_RULES, KNOWN_WORDS } from '../src/chat/curriculum'
import { buildPrompt, SYSTEM_PROMPT } from '../src/voice/prompt'
import { SCENES, sceneOf } from '../src/voice/scenes'
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
  const body = secretBody({ model: 'gpt-realtime-2.1-mini', voice: 'marin', ttl: 120 })
  it('модель, голос и короткий срок ключа заданы сервером', () => {
    expect(body.expires_after.seconds).toBe(120)
    expect(body.session.model).toBe('gpt-realtime-2.1-mini')
    expect(body.session.audio.output.voice).toBe('marin')
    expect(body.session.audio.input.transcription.model).toBeTruthy()
    expect(body.session.instructions).toBe(SYSTEM_PROMPT)
  })
  it('в инструкции пройденное и правила про пол и границы', () => {
    expect(SYSTEM_PROMPT).toContain(KNOWN_GRAMMAR.slice(0, 40))
    expect(SYSTEM_PROMPT).toMatch(/Пол ученика неизвестен/)
    expect(SYSTEM_PROMPT).toMatch(/НЕ пройдено/)
    expect(SYSTEM_PROMPT).toMatch(/Только корейский и учёба/)
    expect(SYSTEM_PROMPT).not.toMatch(/[぀-ヿ一-鿿]/)
  })
  it('«пройдено» и «не пройдено» берутся из данных сайта, руками в инструкции не набраны (будущее время пройдено, а не наоборот)', () => {
    expect(SYSTEM_PROMPT).toMatch(/ПРОЙДЕНО ВСЁ ИЗ СПИСКА ВЫШЕ/)
    expect(SYSTEM_PROMPT).toContain(`Пока НЕ пройдено: ${KNOWN_NOT_YET}.`)
    expect(KNOWN_GRAMMAR).toContain('(으)ㄹ 거예요 — планы, будущее')
    expect(KNOWN_NOT_YET).not.toContain('거예요')
  })
  it('правила: факты о будущем времени, «Верно!» только на фразы, нет родовых форм, просьба о примерах выполняется', () => {
    expect(SYSTEM_PROMPT).toMatch(/основа с 받침: \+을/i)
    expect(SYSTEM_PROMPT).toMatch(/먹을 거예요/)
    expect(SYSTEM_PROMPT).toMatch(/НЕ говори «построил»/)
    expect(SYSTEM_PROMPT).toMatch(/Просят N примеров/)
    expect(SYSTEM_PROMPT).toMatch(/«Верно!» говори только о корейской фразе/)
  })
  it('справочник правил из карточек сайта в инструкции: прошедшее и будущее время объяснены по карточкам', () => {
    expect(KNOWN_RULES).toMatch(/았어요 \/ 었어요 \/ 였어요: основа \+ 았어요/)
    expect(KNOWN_RULES).toMatch(/Последняя гласная основы ㅏ или ㅗ → 았어요/)
    expect(KNOWN_RULES).toMatch(/\(으\)ㄹ 거예요: основа глагола/)
    expect(SYSTEM_PROMPT).toContain(KNOWN_RULES)
    expect(SYSTEM_PROMPT).toMatch(/опирайся ТОЛЬКО на этот справочник/)
    expect(SYSTEM_PROMPT).not.toMatch(/[{}]|\*\*/.source ? /\{[a-z]\|/ : /x/)
  })
  it('чтения кириллицей: «мокта», «када», «конбухада» связаны с 먹다, 가다, 공부하다', () => {
    expect(KNOWN_READINGS).toContain('мокта=먹다')
    expect(KNOWN_READINGS).toContain('када=가다')
    expect(KNOWN_READINGS).toContain('конбухада=공부하다')
    expect(SYSTEM_PROMPT).toContain(KNOWN_READINGS)
    expect(SYSTEM_PROMPT).toMatch(/먹다 это не 있다/)
    expect(SYSTEM_PROMPT).toMatch(/разбери КАЖДОЕ по шагам/)
  })
  it('инструкция короткая: весь список слов в неё не вставляется', () => {
    expect(SYSTEM_PROMPT.length).toBeLessThan(13500)
    expect(SYSTEM_PROMPT).not.toContain(KNOWN_WORDS.slice(0, 200))
  })
  it('нажми-и-говори выключает автоопределение конца фразы, обычный режим включает', () => {
    expect(secretBody({ model: 'm', voice: 'v', ttl: 1, ptt: true }).session.audio.input.turn_detection).toBeNull()
    expect(body.session.audio.input.turn_detection?.type).toBe('semantic_vad')
  })
})

describe('голос: сценки', () => {
  const known = new Set(KNOWN_WORDS.split(/\s+/))
  it('у каждой сценки есть шаги и слова, а неизвестная сценка даёт свободный разговор', () => {
    expect(sceneOf('нет такой').id).toBe('free')
    for (const s of SCENES.filter(x => x.id !== 'free')) {
      expect(s.steps.length).toBeGreaterThan(2)
      expect(buildPrompt(s.id)).toContain(s.steps[0]!.ko)
    }
  })
  it('слова сценок только из пройденного (словарь chat/curriculum.ts)', () => {
    const unknown = SCENES.flatMap(s => s.words.split(/\s+/).filter(w => w && !known.has(w) && !/^(뭐예요\?|얼마예요\?|안녕하세요\?)$/.test(w)))
    expect(unknown).toEqual([])
  })
})
