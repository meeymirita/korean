import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { makeBuild, LIMITS } = await load('/src/game/build.ts')
const { analyze } = await load('/src/data/korean/parse.ts')
const { D } = await load('/src/game/words.ts')
const { RAW } = await load('/src/data/korean/dictionary.ts')
const { TRANSLATIONS } = await load('/src/data/korean/translations.ts')
after(close)

const WORDS = { 1: [2, 2], 2: [3, 4], 3: [5, 7] }
const SEEDS = 4000
const sample = (level, mode = 'b', n = SEEDS) => Array.from({ length: n }, (_, i) => makeBuild(level, mode, i + 1))

describe('«Собери предложение»: уровни', () => {
  for (const level of [1, 2, 3]) {
    test(`уровень ${level}: слов ${WORDS[level].join('–')}, длина в пределах потолка, правильный ответ среди допустимых`, () => {
      for (const mode of ['p', 'a', 'b']) {
        for (const b of sample(level, mode, 800)) {
          const n = b.right.split(' ').length
          assert.ok(n >= WORDS[level][0] && n <= WORDS[level][1], `${b.right}: ${n} слов`)
          assert.ok(b.right.replace(/ /g, '').length <= LIMITS[level].ko, `${b.right} длиннее ${LIMITS[level].ko} знаков`)
          assert.ok(b.ru.length <= LIMITS[level].chars, `${b.ru} длиннее ${LIMITS[level].chars} знаков`)
          assert.ok(b.ru.split(/\s+/).length <= LIMITS[level].words, `${b.ru} больше ${LIMITS[level].words} слов`)
          assert.ok(b.accept.includes(b.right))
          assert.ok(b.right.split(' ').every(t => b.tiles.includes(t)), `в плитках нет слова из ${b.right}`)
          assert.ok(b.ru.endsWith('.'))
        }
      }
    })
  }

  test('одно и то же зерно даёт одно и то же предложение', () => {
    for (const level of [1, 2, 3]) assert.deepEqual(makeBuild(level, 'b', 4242), makeBuild(level, 'b', 4242))
  })

  test('на простом уровне нет длинных предложений: самый длинный русский перевод не длиннее потолка', () => {
    const longest = Math.max(...sample(1).map(b => b.ru.length))
    assert.ok(longest <= LIMITS[1].chars, `самый длинный: ${longest}`)
    assert.ok(LIMITS[1].chars < LIMITS[2].chars && LIMITS[2].chars < LIMITS[3].chars)
  })
})

describe('«Собери предложение»: пул заданий', () => {
  const MIN = { 1: 350, 2: 1200, 3: 2300 }
  for (const level of [1, 2, 3]) {
    test(`уровень ${level}: не меньше ${MIN[level]} разных предложений, и все слова есть в словаре`, () => {
      const seen = new Map(sample(level).map(b => [b.right, b]))
      assert.ok(seen.size >= MIN[level], `разных предложений: ${seen.size}`)
      for (const b of seen.values()) {
        const unknown = analyze(b.sentence).filter(x => x.type === 'unknown').map(x => x.text)
        assert.deepEqual(unknown, [], `${b.right}: нет в словаре ${unknown}`)
      }
    })
  }

  test('новые слова 그런데 и 그래서 попадают в предложения, а 그리고 тоже', () => {
    const all = [...sample(2), ...sample(3)].map(b => ' ' + b.right + ' ')
    for (const w of ['그런데', '그래서', '그리고']) assert.ok(all.some(s => s.includes(` ${w} `)), `${w} не встречается`)
  })
})

describe('три союза в словаре', () => {
  test('слова есть на сайте (словарь, пул игры) и у примеров есть перевод', () => {
    for (const w of ['그런데', '그래서', '그리고']) {
      const row = RAW.find(r => r.k === w)
      assert.ok(row, `${w} нет в словаре`)
      assert.ok(TRANSLATIONS[row.s], `нет перевода примера: ${row.s}`)
      assert.ok(D.D.some(x => x[0] === w), `${w} нет в пуле игры`)
    }
    assert.equal(new Set(RAW.map(r => r.k)).size, RAW.length, 'в словаре повторы')
  })
})
