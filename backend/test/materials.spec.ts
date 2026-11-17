import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { cleanMaterial, MATERIALS_FORMAT, MAX_ITEMS } from '../src/materials/materials.schema.js'

const ok = (items: unknown[], extra: object = {}) => cleanMaterial({ source: ' Тетрадь ', items, ...extra })

describe('проверка пачки материалов', () => {
  it('нормализует источник, вид по умолчанию «другое», лишние поля отбрасываются', () => {
    const r = ok([{ type: 'note', text: ' заметка ', junk: 1 }])
    expect(r).toEqual({ source: 'Тетрадь', kind: 'other', items: [{ type: 'note', text: 'заметка' }] })
  })

  it('пример из описания формата проходит проверку целиком', () => {
    const r = cleanMaterial(MATERIALS_FORMAT.example)
    expect(r.items).toHaveLength(MATERIALS_FORMAT.example.items.length)
    expect(new Set(r.items.map(i => i.type))).toEqual(new Set(['word', 'sentence', 'dialog', 'text', 'grammar', 'exercise', 'note']))
  })

  it('каждому типу нужны свои обязательные поля', () => {
    for (const bad of [{ type: 'word', ko: '가' }, { type: 'sentence' }, { type: 'dialog', lines: [{ ko: 'a', ru: 'b' }] }, { type: 'text', sentences: [] }, { type: 'grammar' }, { type: 'exercise' }, { type: 'note' }, { type: 'ghost' }])
      expect(() => ok([bad]), JSON.stringify(bad)).toThrow(BadRequestException)
  })

  it('вопрос к тексту: 2–6 вариантов и номер верного с нуля', () => {
    const q = (answer: unknown, options: string[] = ['а', 'б']) => ok([{ type: 'text', sentences: [{ ko: '가요.', ru: 'Идёт.' }], questions: [{ q: '?', options, answer }] }])
    expect(() => q(1)).not.toThrow()
    expect(() => q(2)).toThrow(BadRequestException)
    expect(() => q(-1)).toThrow(BadRequestException)
    expect(() => q('0')).toThrow(BadRequestException)
    expect(() => q(0, ['а'])).toThrow(BadRequestException)
  })

  it('лимиты: источник, список элементов, длина строк, вид и не-объекты', () => {
    expect(() => cleanMaterial({ source: '', items: [{ type: 'note', text: 'a' }] })).toThrow(BadRequestException)
    expect(() => cleanMaterial({ source: 'x', items: [] })).toThrow(BadRequestException)
    expect(() => ok(Array.from({ length: MAX_ITEMS + 1 }, () => ({ type: 'note', text: 'a' })))).toThrow(BadRequestException)
    expect(() => ok([{ type: 'word', ko: 'x'.repeat(61), ru: 'a' }])).toThrow(BadRequestException)
    expect(() => ok([{ type: 'note', text: 5 }])).toThrow(BadRequestException)
    expect(() => ok([{ type: 'note', text: 'a' }], { kind: 'secret' })).toThrow(BadRequestException)
    for (const b of [null, 'text', [], 5]) expect(() => cleanMaterial(b)).toThrow(BadRequestException)
  })
})

describe('описание формата', () => {
  it('открытое описание не содержит секретов и перечисляет маршруты приёма', () => {
    const text = JSON.stringify(MATERIALS_FORMAT)
    expect(/bearer [a-f0-9]{20,}|password/i.test(text)).toBe(false)
    expect(MATERIALS_FORMAT.routes.map(r => `${r.method} ${r.path}`)).toEqual(expect.arrayContaining(['POST /api/materials', 'POST /api/new-words', 'GET /api/materials/format']))
  })
})
