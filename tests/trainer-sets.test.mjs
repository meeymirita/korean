import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { PAIR_SETS, isPairSet, pool, pickRound, shown, statKey, dirsFor } = await load('/src/data/korean/trainer.ts')
after(close)

describe('«Найди пару»: наборы «Предложение ↔ перевод» и «Слово ↔ пример»', () => {
  test('оба набора объявлены и распознаются', () => {
    assert.deepEqual(PAIR_SETS.map(s => s.id), ['sent', 'example'])
    assert.ok(isPairSet('sent') && isPairSet('example'))
    assert.ok(!isPairSet('') && !isPairSet('verbs'))
  })

  test('предложения: слева корейское предложение, справа русский перевод, пар достаточно', () => {
    const words = pool('sent')
    assert.ok(words.length >= 100, 'пар: ' + words.length)
    for (const w of words) {
      assert.match(w.k, /[가-힣]/)
      assert.match(shown(w), /[а-яё]/i)
    }
  })

  test('слово и пример: справа корейское предложение, почти всегда с первым слогом слова (у неправильных глаголов слог меняется: 덥다 → 더워요)', () => {
    const words = pool('example')
    assert.ok(words.length >= 300, 'пар: ' + words.length)
    let without = 0
    for (const w of words) {
      assert.match(shown(w), /[가-힣]/)
      assert.notEqual(shown(w), w.k)
      if (!shown(w).includes(w.k[0])) without++
    }
    assert.ok(without / words.length < 0.08, 'без первого слога: ' + without + ' из ' + words.length)
  })

  test('раунд без повторов, предложения не идут в общий прогресс слов, в «Напиши перевод» их нет', () => {
    for (const id of ['sent', 'example']) {
      const round = pickRound(pool(id), 10)
      assert.equal(round.length, 10)
      assert.equal(new Set(round.map(w => shown(w).toLowerCase())).size, 10, 'переводы не повторяются: ' + id)
      assert.equal(new Set(round.map(w => w.n)).size, 10, 'номера разные')
      for (const w of round) assert.equal(statKey(w), null, 'как слово не считается')
      assert.deepEqual(dirsFor(id), ['ko-ru', 'ru-ko'])
    }
  })
})
