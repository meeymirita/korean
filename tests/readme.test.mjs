import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { ABOUT_SLIDES } = await load('/src/data/about.ts')
const { D } = await load('/src/data/korean/words.ts')
const { G } = await load('/src/data/korean/grammar.ts')
after(close)

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

describe('README', () => {
  test('галерея повторяет страницу «О платформе»: все слайды, их названия, описания, адреса и картинки', () => {
    for (const s of ABOUT_SLIDES) {
      assert.ok(readme.includes(`. ${s.title}\n`), `нет заголовка «${s.title}»`)
      assert.ok(readme.includes(s.text), `нет описания слайда «${s.title}»`)
      assert.ok(readme.includes(`src/assets/about/${s.img}.webp`), `нет картинки ${s.img}`)
      assert.ok(readme.includes(`Адрес: \`${s.to}\``), `нет адреса ${s.to}`)
      assert.ok(existsSync(new URL(`../src/assets/about/${s.img}.webp`, import.meta.url)), `нет файла ${s.img}.webp`)
    }
  })

  test('в начале README описана платформа, а цифры совпадают с данными сайта', () => {
    const top = readme.slice(0, 2500)
    assert.ok(top.includes('https://korean.meeymirita.ru'))
    assert.ok(top.includes('우리말'))
    assert.ok(readme.includes(`**${D.length} слов**`), 'число слов устарело')
    assert.ok(readme.includes(`**${G.length} правил грамматики**`), 'число правил устарело')
    assert.ok(readme.indexOf('## Как выглядит платформа') < readme.indexOf('## Техническая часть'), 'галерея должна идти раньше технической части')
  })
})
