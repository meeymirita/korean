import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { load, close } from './_load.mjs'

after(close)
const { siteImageKey, placementStyle, dragPlacement, isNeutral } = await load('/src/lib/siteImages.ts')

test('ключ картинки: имя файла без расширения и хэша сборки', () => {
  assert.equal(siteImageKey('/assets/yuna-today-DxZ3p0kQ.webp'), 'yuna-today')
  assert.equal(siteImageKey('/assets/shop-yuna-a1B2_c-d.webp'), 'shop-yuna')
  assert.equal(siteImageKey('/src/assets/home/yuna-today.webp?import'), 'yuna-today')
  assert.equal(siteImageKey('/src/assets/home/yuna-checklist.webp'), 'yuna-checklist')
  assert.equal(siteImageKey('https://korean.meeymirita.ru/assets/coin-AbCd1234.webp'), 'coin')
})

test('ключа нет у картинок вне assets, data: и blob:', () => {
  for (const s of ['', 'data:image/png;base64,AAAA', 'blob:http://x/1', '/api/images/1/file', '/icon-192.png', 'https://example.com/a.png'])
    assert.equal(siteImageKey(s), null, s)
})

test('положение: по умолчанию стили пустые, у блока object-position, у остальных сдвиг', () => {
  assert.ok(isNeutral({ x: 50, y: 50, zoom: 1 }))
  assert.equal(placementStyle('yuna-today', { x: 50, y: 50, zoom: 1 }).transform, '')
  assert.equal(placementStyle('block-hero', { x: 30, y: 60, zoom: 1.5 }).objectPosition, '30% 60%')
  assert.equal(placementStyle('yuna-today', { x: 60, y: 40, zoom: 2 }).transform, 'translate(10%, -10%) scale(2)')
})

test('перетаскивание: обычная картинка идёт за курсором, фон блока в обратную сторону; не выходит за 0–100', () => {
  const p = { x: 50, y: 50, zoom: 1 }
  assert.deepEqual(dragPlacement('yuna-today', p, 20, -10, 200, 100), { x: 60, y: 40, zoom: 1 })
  assert.deepEqual(dragPlacement('block-hero', p, 20, -10, 200, 100), { x: 40, y: 60, zoom: 1 })
  assert.equal(dragPlacement('yuna-today', p, 9999, 0, 100, 100).x, 100)
})
