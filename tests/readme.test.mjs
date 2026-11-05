import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { close, load } from './_load.mjs'

const { D } = await load('/src/data/korean/words.ts')
const { G } = await load('/src/data/korean/grammar.ts')
after(close)

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')

describe('README', () => {
  test('в начале README описана платформа, а цифры совпадают с данными сайта', () => {
    const top = readme.slice(0, 2500)
    assert.ok(top.includes('https://korean.meeymirita.ru'))
    assert.ok(top.includes('우리말'))
    assert.ok(readme.includes(`**${D.length} слов**`), 'число слов устарело')
    assert.ok(readme.includes(`**${G.length} правил грамматики**`), 'число правил устарело')
  })
})
