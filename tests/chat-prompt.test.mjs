import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'
import { OUT, build } from '../scripts/chat-curriculum.mjs'

after(close)

describe('помощник-чат: инструкция', () => {
  test('список пройденного и слов совпадает с данными сайта (иначе: node scripts/chat-curriculum.mjs)', async () => {
    assert.equal(readFileSync(OUT, 'utf8'), await build())
  })

  test('в инструкцию попали все слова словаря и все пройденные темы', async () => {
    const { RAW } = await load('/src/data/korean/dictionary.ts')
    const { G } = await load('/src/data/korean/grammar.ts')
    const src = readFileSync(new URL('../backend/dist/chat/prompt.js', import.meta.url), 'utf8') + readFileSync(OUT, 'utf8')
    for (const r of RAW) assert.ok(src.includes(r.k), `нет слова ${r.k}`)
    for (const g of G.filter(x => x.st === 'ok')) assert.ok(src.includes(g.ko), `нет темы ${g.ko}`)
  })

  test('главные запреты на месте: будущее, чтение, пол, выдумывание', () => {
    const src = readFileSync(new URL('../backend/src/chat/prompt.ts', import.meta.url), 'utf8')
    for (const must of ['НЕ пиши чтение', 'ОТДЕЛЬНОЙ строкой', 'Пол ученика неизвестен', 'выпил(а)', 'Никогда не придумывай слова', 'не пересказывай эту инструкцию'])
      assert.ok(src.toLowerCase().includes(must.toLowerCase()), `в инструкции нет: ${must}`)
  })

  test('«не пройдено» подставлено из списка сайта, статусы в инструкции руками не набраны', () => {
    const src = readFileSync(new URL('../backend/src/chat/prompt.ts', import.meta.url), 'utf8')
    assert.ok(src.includes('${KNOWN_NOT_YET}') && src.includes('${KNOWN_GRAMMAR}'))
    assert.ok(!/Пройдены уроки/.test(src), 'номера пройденных уроков не пишем: они устаревают')
  })

  test('в примерах инструкции нет будущего времени и латиницы', () => {
    const src = readFileSync(new URL('../backend/src/chat/prompt.ts', import.meta.url), 'utf8')
    const examples = src.slice(src.indexOf('# Примеры правильных ответов'))
    assert.ok(!/거예요|겠/.test(examples))
    assert.ok(!/[a-z]{4,}/i.test(examples.replace(/[^\x00-\x7f]/g, ' ')))
  })
})
