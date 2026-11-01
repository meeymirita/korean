import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { load, close } from './_load.mjs'

after(close)
const { cutoutBackground } = await load('/src/lib/cutout.ts')

/** Картинка 60×60: фон-шахматка из клеток 4×4 (белый и светло-серый), в центре цветной квадрат с белой «шерстью» внутри. */
function sample() {
  const w = 60, h = 60
  const px = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let c = ((x >> 2) + (y >> 2)) % 2 ? [255, 255, 255] : [243, 243, 244]
      if (x >= 15 && x < 45 && y >= 15 && y < 45) c = [150, 80, 200] // рисунок
      if (x >= 24 && x < 36 && y >= 24 && y < 36) c = [253, 253, 253] // белая заливка внутри рисунка
      px.set([...c, 255], i)
    }
  }
  return { px, w, h }
}
const alpha = (s, x, y) => s.px[(y * s.w + x) * 4 + 3]

test('шахматка по краям становится прозрачной, рисунок и белая заливка внутри остаются', () => {
  const s = sample()
  const removed = cutoutBackground(s.px, s.w, s.h)
  assert.ok(removed > 0.5 && removed < 0.8, 'доля: ' + removed)
  assert.equal(alpha(s, 0, 0), 0)
  assert.equal(alpha(s, 6, 52), 0)
  assert.equal(alpha(s, 20, 20), 255)
  assert.equal(alpha(s, 30, 30), 255)
})

test('замкнутый островок шахматки внутри рисунка тоже вырезается', () => {
  const s = sample()
  for (let y = 16; y < 20; y++) for (let x = 16; x < 24; x++) s.px.set(((x >> 2) + (y >> 2)) % 2 ? [255, 255, 255, 255] : [243, 243, 244, 255], (y * s.w + x) * 4)
  cutoutBackground(s.px, s.w, s.h)
  assert.equal(alpha(s, 17, 17), 0)
})

test('цветная картинка без белого фона не меняется', () => {
  const w = 20, h = 20
  const px = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) px.set([90, 120, 200, 255], i * 4)
  assert.equal(cutoutBackground(px, w, h), 0)
  assert.equal(px[3], 255)
})
