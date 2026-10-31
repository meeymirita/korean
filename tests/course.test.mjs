import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { videoOf } = await load('/src/data/korean/course.ts')
const { G } = await load('/src/data/korean/grammar.ts')
after(close)

describe('видеоуроки', () => {
  test('адрес по номеру урока, с нулём и с суффиксом -1/-2', () => {
    assert.equal(videoOf('Урок 5'), '/video/lesson-05.mp4')
    assert.equal(videoOf('Урок 16-2'), '/video/lesson-16-2.mp4')
    assert.equal(videoOf('Урок 30'), '/video/lesson-30.mp4')
    assert.equal(videoOf('Часть 2 · Урок 3'), '/video/part2-03.mp4')
    assert.equal(videoOf('Часть 2 · Урок 13'), '/video/part2-13.mp4')
    assert.equal(videoOf(''), undefined)
    assert.equal(videoOf(undefined), undefined)
  })

  test('у каждой карточки с уроком подпись понятна, а номер в пределах 1–30', () => {
    for (const g of G.filter(x => x.l)) {
      const v = videoOf(g.l)
      assert.ok(v, `${g.id}: «${g.l}» не распознан`)
      const n = Number(/(?:lesson|part2)-(\d+)/.exec(v)[1])
      assert.ok(n >= 1 && n <= ((g.part ?? 1) === 2 ? 13 : 30), g.id)
    }
  })
})
