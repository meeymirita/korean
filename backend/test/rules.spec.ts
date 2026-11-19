import { describe, expect, it } from 'vitest'
import { checkSentence, RULES, rulesDocument, TOPICS, WORKFLOW } from '../src/public/rules.js'
import { STUDY_SENTENCES } from '../src/public/study.data.js'

describe('правила проверки (/api/public/rules)', () => {
  it('у каждого правила есть примеры, номера и названия не повторяются', () => {
    expect(new Set(RULES.map(r => r.id)).size).toBe(RULES.length)
    for (const r of RULES) {
      expect(r.title && r.why, r.id).toBeTruthy()
      expect(r.bad.length, r.id).toBeGreaterThan(0)
      expect(r.good.length, r.id).toBeGreaterThan(0)
    }
  })

  it('шаблон правила находит все «плохие» примеры и ни одного «хорошего»', () => {
    for (const r of RULES.filter(x => x.pattern)) {
      const re = new RegExp(r.pattern!, 'iu')
      for (const s of r.bad) expect(re.test(s), `${r.id}: «${s}» должно находиться`).toBe(true)
      for (const s of r.good) expect(re.test(s), `${r.id}: «${s}» не должно находиться`).toBe(false)
    }
  })

  it('checkSentence возвращает находки с правилом и куском текста', () => {
    expect(checkSentence('엄마가 저에게 사과를 줘요.').map(f => f.rule)).toEqual(['no-egae'])
    expect(checkSentence('사과를 한 개 먹어요.')).toEqual([])
    expect(checkSentence('', 'Я ходил в школу.')[0]).toMatchObject({ rule: 'ru-gender-i', scope: 'ru' })
  })

  it('собственные предложения сайта не нарушают запретов (forbid)', () => {
    const all = (JSON.parse(STUDY_SENTENCES) as { sentences: { ko: string; ru: string }[] }).sentences
    const hits = all.flatMap(s => checkSentence(s.ko, s.ru).filter(f => f.severity === 'forbid').map(f => `${f.rule}: ${s.ko} | ${s.ru}`))
    expect(hits).toEqual([])
  })

  it('правила работы: сценарии, подтверждение только для придуманного, единые темы', () => {
    expect(WORKFLOW.scenarios.map(s => s.id)).toEqual(['notebook-check', 'textbook-words', 'page-content', 'self-made'])
    expect(WORKFLOW.scenarios.filter(s => s.confirm).map(s => s.id)).toEqual(['self-made'])
    expect(new Set(TOPICS).size).toBe(TOPICS.length)
    expect(TOPICS).toEqual(expect.arrayContaining(['만', 'прошедшее время', 'счётные слова']))
    expect(WORKFLOW.tokens).toContain('60 минут')
    const d = rulesDocument()
    expect(d.workflow.always.length).toBeGreaterThan(2)
    expect(d.topics).toBe(TOPICS)
  })

  it('документ содержит пройденное, непройденное и правила, без секретов', () => {
    const d = rulesDocument()
    expect(d.passed.length).toBeGreaterThan(20)
    expect(d.notYet.length).toBeGreaterThan(3)
    expect(d.forbid.length).toBe(RULES.length)
    expect(/bearer [a-f0-9]{20,}|password|token=/i.test(JSON.stringify(d))).toBe(false)
  })
})
