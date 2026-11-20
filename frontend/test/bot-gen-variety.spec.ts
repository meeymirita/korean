// Бот-игрок, уровень A: разнообразие заданий в потоке (docs/bot.md, раздел «Разнообразие»). 1000 заданий на режим, зерно фиксировано.
// Что считаем: один и тот же верный ответ подряд, повтор того же задания, доля самого частого ответа, место верного варианта.
import { appendFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SEED, generate, modeLevels } from './bot-lib'
import type { ChoiceQ } from '@/game/types'

const COUNT = Number(process.env.BOT_VARIETY_N ?? 1000)
/** Режимы без вопроса «выбери» или с ответом внутри текста: у них свои проверки (bot-gen.spec.ts). */
const SKIP = new Set(['weak', 'ptext', 'expert', 'tenses', 'finderr', 'oddone'])
const note = (s: string) => {
  if (process.env.BOT_REPORT) appendFileSync(process.env.BOT_REPORT, s + '\n')
}

describe(`бот-игрок: разнообразие (зерно ${SEED}, ${COUNT} заданий на режим)`, () => {
  for (const t of modeLevels().filter(x => !SKIP.has(x.id))) {
    it(t.id, () => {
      const list = generate(t.id, 'simple', COUNT, SEED)
      const rights = list.map(g => g.q.mode + '|' + (g.q.right || g.q.key))
      const kinds = new Set(rights).size
      const keys = new Set(list.map(g => g.q.key)).size

      // 1. один и тот же верный ответ в любых 10 подряд: не больше потолка по числу разных ответов режима
      let maxSame = 0
      for (let i = 0; i + 10 <= rights.length; i++) {
        const c = new Map<string, number>()
        for (const r of rights.slice(i, i + 10)) c.set(r, (c.get(r) ?? 0) + 1)
        maxSame = Math.max(maxSame, ...c.values())
      }
      const cap = Math.max(4, Math.ceil(10 / kinds) + 2)
      expect(maxSame, `${t.id}: из 10 подряд один ответ ${maxSame} раз (потолок ${cap}, разных ответов ${kinds})`).toBeLessThanOrEqual(cap)

      // 2. доля самого частого ответа
      const count = new Map<string, number>()
      rights.forEach(r => count.set(r, (count.get(r) ?? 0) + 1))
      const top = Math.max(...count.values()) / list.length
      expect(top, `${t.id}: самый частый ответ ${(top * 100).toFixed(0)}% при ${kinds} разных`).toBeLessThanOrEqual(Math.max(0.25, 1.6 / kinds))

      // 3. то же задание ближе, чем через 30: только если в режиме хватает разных заданий (иначе это нехватка данных, она в отчёте)
      let dup = 0
      list.forEach((g, i) => {
        for (let j = Math.max(0, i - 30); j < i; j++)
          if (list[j]!.q.key === g.q.key) {
            dup++
            break
          }
      })
      if (keys >= 60) expect(dup / list.length, `${t.id}: повторы заданий в окне 30 (${keys} разных заданий)`).toBeLessThanOrEqual(0.1)
      else note(`- ${t.id}: в режиме всего ${keys} разных заданий, повторы в окне 30 неизбежны (${dup} из ${list.length}); нужно 60+ заданий, слова/предложения добавляет владелец`)

      // 4. место верного варианта среди вариантов: не больше 1,5 доли поровну (+5%); «найди ошибку» и порядок слов: место задаётся предложением
      if (!['err', 'ord'].includes(t.id)) {
        const ch = list.filter(g => g.q.type === 'choice').map(g => g.q as ChoiceQ)
        if (ch.length > 100) {
          const k = Math.max(...ch.map(c => c.options.length))
          const pos: number[] = Array.from({ length: k }, () => 0)
          ch.forEach(c => pos[c.correct]++)
          const share = Math.max(...pos) / ch.length
          expect(share, `${t.id}: верный вариант на одном месте в ${(share * 100).toFixed(0)}% (${pos.join('/')})`).toBeLessThanOrEqual(1.5 / k + 0.05)
        }
      }
    })
  }

  it('«Микс» даёт все свои режимы', () => {
    const list = generate('mix', 'simple', 2000, SEED)
    const seen = new Set(list.map(g => g.q.mode))
    for (const m of ['word', 'rev', 'form', 'qw', 'part', 'build', 'spot', 'type', 'err', 'pair', 'ord', 'dlg', 'days', 'when', 'too', 'neg', 'place', 'dem', 'polite', 'fut', 'only'])
      expect(seen.has(m), `в «Миксе» нет режима ${m}`).toBe(true)
    const byMode = new Map<string, number>()
    list.forEach(g => byMode.set(g.q.mode, (byMode.get(g.q.mode) ?? 0) + 1))
    expect(Math.max(...byMode.values()) / list.length, 'один режим занимает больше четверти «Микса»').toBeLessThanOrEqual(0.25)
  })
})
