// Бот-игрок, уровень A (docs/bot.md): каждый режим на каждом чипе уровня, по N заданий с зерном; инварианты из bot-lib.ts.
// Повторить сбой: BOT_SEED=<зерно из сообщения> BOT_N=2000 npx vitest run test/bot-gen.spec.ts --maxWorkers=1
import { describe, expect, it } from 'vitest'
import { N, SEED, generate, modeLevels, violations } from './bot-lib'
import { MODES } from '@/game/modes'
import { PFAMS } from '@/game/families'
import type { BuildQ } from '@/game/types'

const table = modeLevels()

/**
 * Известные нехватки данных (решает владелец, слова в словарь сам не добавляю): «клетка:код» → что нужно.
 * Запись удаляется, когда данные дописаны. Печатается в отчёте бота.
 */
export const KNOWN: Record<string, string> = {
  'polite/long:повтор-предложения-в-тексте': 'В «Уровне вежливости» всего 4 формы «спасибо» (4 разных предложения), а чип «Длинный 5–10» просит 5–10. Нужно 6+ новых примеров с «спасибо» (по 2 на форму) или отдельный набор фраз.',
}

describe('бот-игрок: режимы и подрежимы берутся из кода', () => {
  it('каждый режим из MODES есть в таблице, у каждого есть хотя бы один уровень', () => {
    expect(table.map(t => t.id)).toEqual(MODES.map(m => m.id))
    for (const t of table) expect(t.levels.length, t.id).toBeGreaterThan(0)
  })
})

describe(`бот-игрок: задания без нарушений (зерно ${SEED}, ${N} заданий на клетку)`, () => {
  for (const t of table.filter(x => x.id !== 'weak')) {
    for (const lv of t.levels) {
      it(`${t.id} / ${lv.label}`, () => {
        const list = generate(t.id, lv.id, N, SEED)
        expect(list.length).toBe(N)
        const found = new Map<string, number>()
        const sample = new Map<string, string>()
        for (const g of list) {
          for (const v of violations(g)) {
            const code = v.split(':')[0]!
            found.set(code, (found.get(code) ?? 0) + 1)
            if (!sample.has(code)) sample.set(code, `${v} | key=${g.q.key} i=${g.i}`)
          }
        }
        const report = [...found].filter(([c]) => !KNOWN[`${t.id}/${lv.id}:${c}`]).map(([c, n]) => `${n}× ${sample.get(c)}`)
        expect(report, `${t.id}/${lv.id}, зерно ${SEED}`).toEqual([])
      })
    }
  }
})

describe('бот-игрок: переключатели внутри режима', () => {
  for (const lv of [1, 2, 3, 4] as const) {
    it(`«Собери предложение»: сложность ${lv} (простой, средний, сложный, мастер)`, () => {
      for (const sub of ['simple', 'story', 'long']) {
        const list = generate('build', sub, Math.min(N, 80), SEED, S => { S.level = lv })
        const bad = list.flatMap(g => violations(g))
        expect(bad, `build/${sub}/сложность ${lv}`).toEqual([])
        if (sub === 'simple') for (const g of list) expect((g.q as BuildQ).level, 'сложность задания совпадает с чипом').toBe(lv)
      }
    })
  }
  for (const f of PFAMS) {
    for (const lv of ['story', 'long']) {
      it(`«Тексты по правилу»: ${f.name} / ${lv}`, () => {
        const list = generate('ptext', lv, Math.min(N, 80), SEED, S => { S.pfam = f.id })
        expect(list.flatMap(g => violations(g)), `ptext/${f.id}/${lv}`).toEqual([])
        // в текстах правила только частицы этого правила
        for (const g of list) {
          const q: any = g.q
          for (const gp of q.gaps) expect(f.marks.includes(gp.right), `${f.id}: «${gp.right}» не из правила`).toBe(true)
        }
      })
    }
  }
  for (const t of ['pres', 'past', 'both']) {
    it(`«Выбери форму» и «Напиши форму»: время ${t}`, () => {
      for (const mode of ['form', 'type']) {
        const list = generate(mode, 'simple', Math.min(N, 80), SEED, S => { S.tense = t })
        expect(list.flatMap(g => violations(g)), `${mode}/${t}`).toEqual([])
      }
    })
  }
  for (const cats of [{ v: 1 }, { a: 1 }, { q: 1 }, { s: 1 }, { w: 1 }, { n: 1 }, { d: 1 }, { p: 1 }, { l: 1 }]) {
    it(`наборы слов ${Object.keys(cats)[0]}: «Слово → перевод» и «Перевод → слово»`, () => {
      for (const mode of ['word', 'rev', 'type']) {
        const list = generate(mode, 'simple', Math.min(N, 80), SEED, S => {
          for (const k of Object.keys(S.cats)) S.cats[k] = 0
          Object.assign(S.cats, cats)
        })
        expect(list.flatMap(g => violations(g)), `${mode}/${JSON.stringify(cats)}`).toEqual([])
      }
    })
  }
})
