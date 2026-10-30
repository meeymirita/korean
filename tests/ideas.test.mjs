import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const dir = new URL('../ideas/', import.meta.url)
const read = f => readFileSync(new URL(f, dir), 'utf8')
const FILES = { 'learning.md': 'L', 'personal-space.md': 'P', 'gamification.md': 'G', 'tools.md': 'T', 'content.md': 'C', 'teacher-and-social.md': 'S', 'ai.md': 'A', 'design-ux.md': 'D', 'platform-tech.md': 'X' }
const HEADING = /^### ([A-Z])(\d+)\. (.+) · \[(Новое|Улучшение)\] · (S|M|L|XL) · (★{1,5})$/

const ideas = {}
for (const [file, prefix] of Object.entries(FILES)) {
  ideas[file] = read(file).split('\n').filter(l => l.startsWith('### ')).map(l => ({ line: l, m: l.match(HEADING), prefix }))
}

describe('папка идей', () => {
  test('у каждой идеи заголовок по шаблону: номер, название, «Новое/Улучшение», размер, ценность', () => {
    for (const [file, list] of Object.entries(ideas)) {
      assert.ok(list.length > 0, file)
      for (const i of list) assert.ok(i.m, `заголовок не по шаблону в ${file}: ${i.line}`)
    }
  })

  test('номера идут подряд без пропусков и повторов, буква соответствует файлу', () => {
    for (const [file, list] of Object.entries(ideas)) {
      list.forEach((i, n) => {
        assert.equal(i.m[1], FILES[file], `${file}: неверная буква у ${i.line}`)
        assert.equal(Number(i.m[2]), n + 1, `${file}: ожидалась ${FILES[file]}${n + 1}, а тут ${i.line}`)
      })
    }
  })

  test('цифры в README папки совпадают с числом идей в файлах', () => {
    const readme = read('README.md')
    for (const file of Object.keys(FILES)) {
      const row = readme.split('\n').find(l => l.includes(`[\`${file}\`]`))
      assert.ok(row, `нет строки ${file} в README`)
      assert.equal(Number(row.split('|')[3].trim()), ideas[file].length, `число идей в README для ${file}`)
    }
  })

  test('все номера из README и дорожной карты существуют', () => {
    const known = new Set(Object.values(ideas).flat().map(i => i.m[1] + i.m[2]))
    for (const f of ['README.md', 'ROADMAP.md']) {
      for (const m of read(f).matchAll(/`([A-Z]\d{1,2})`/g)) assert.ok(known.has(m[1]), `${f}: идеи ${m[1]} нет`)
      for (const m of read(f).matchAll(/`([A-Z]\d{1,2}) \/ ([A-Z]\d{1,2})(?: \/ ([A-Z]\d{1,2}))?`/g)) {
        for (const id of m.slice(1).filter(Boolean)) assert.ok(known.has(id), `${f}: идеи ${id} нет`)
      }
    }
  })

  test('в идеях нет японских и китайских знаков и звука (решения владельца)', () => {
    for (const f of readdirSync(dir)) {
      const text = read(f)
      assert.ok(!/[぀-ヿ一-鿿]/.test(text), `иероглифы в ${f}`)
    }
  })

  test('у каждой идеи есть строки «Сейчас», «Предлагаю» и «Как» (кроме отсылок «См. …»)', () => {
    for (const [file] of Object.entries(FILES)) {
      const blocks = read(file).split(/^### /m).slice(1)
      for (const b of blocks) {
        if (/^[^\n]*\n\*\*Сейчас:\*\*/.test(b)) assert.ok(b.includes('**Предлагаю:**') && b.includes('**Как:**'), `${file}: неполная идея «${b.split('\n')[0]}»`)
        else assert.ok(/\nСм\. `|\nСм\./.test(b), `${file}: у идеи «${b.split('\n')[0]}» нет описания`)
      }
    }
  })
})
