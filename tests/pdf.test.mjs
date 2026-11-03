import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { buildPdf, A4 } = await load('/src/lib/pdf.ts')
after(close)

const text = async blob => Buffer.from(await blob.arrayBuffer()).toString('latin1')

describe('сборка PDF без библиотек', () => {
  test('файл начинается с заголовка PDF, заканчивается %%EOF и имеет нужное число страниц', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const blob = buildPdf([{ jpeg, width: 10, height: 10 }, { jpeg, width: 10, height: 10 }], 'Отчёт')
    assert.equal(blob.type, 'application/pdf')
    const t = await text(blob)
    assert.ok(t.startsWith('%PDF-1.4'))
    assert.ok(t.trimEnd().endsWith('%%EOF'))
    assert.match(t, /\/Type \/Pages \/Count 2 /)
    assert.equal((t.match(/\/Type \/Page /g) || []).length, 2)
    assert.ok(t.includes(`/MediaBox [0 0 ${A4.w} ${A4.h}]`))
  })

  test('таблица xref указывает на настоящие объекты', async () => {
    const jpeg = new Uint8Array([1, 2, 3, 4, 5])
    const t = await text(buildPdf([{ jpeg, width: 4, height: 4 }]))
    const start = Number(/startxref\n(\d+)\n/.exec(t)[1])
    assert.ok(t.slice(start).startsWith('xref'))
    const lines = t.slice(start).split('\n')
    const count = Number(lines[1].split(' ')[1])
    for (let n = 1; n < count; n++) {
      const off = Number(lines[2 + n].slice(0, 10))
      assert.ok(t.slice(off).startsWith(`${n} 0 obj`), `объект ${n} не по смещению ${off}`)
    }
  })

  test('JPEG-байты страницы лежат в файле без изменений, длина указана верно', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xaa, 0xbb, 0xff, 0xd9])
    const t = await text(buildPdf([{ jpeg, width: 2, height: 2 }]))
    assert.ok(t.includes('/Filter /DCTDecode /Length 6'))
    assert.ok(t.includes('\xff\xd8\xaa\xbb\xff\xd9'))
  })
})
