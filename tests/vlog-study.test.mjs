// Разбор влога: проходы рассказа, справки по новой грамматике, изоляция файла справок (решение владельца 2026-11-22).
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { close, load } from './_load.mjs'

const { passes, NEW_GRAMMAR, VLOG_NEW_GRAMMAR, STUDY_VLOGS } = await load('/src/data/korean/vlog-study.ts')
const { VLOGS } = await load('/src/data/korean/vlogs.ts')
after(close)

test('passes: рассказ из четырёх проходов даёт один проход и число повторов', () => {
  const v = VLOGS.find(x => x.id === 'choisusu-hobby')
  const p = passes(v.lines)
  assert.equal(p.count, 4)
  assert.equal(p.first.length, 18)
  assert.equal(p.first[0].ko, v.lines[0].ko)
  assert.equal(passes(VLOGS.find(x => x.id === 'bukchon').lines).count, 1)
  assert.deepEqual(passes([]), { first: [], count: 0 })
})

test('справки: у каждой темы объяснение и формула, у влога примеры из первого прохода', () => {
  for (const [k, g] of Object.entries(NEW_GRAMMAR)) assert.ok(g.ko && g.ru && g.rule && g.formula, k)
  for (const id of STUDY_VLOGS) {
    const v = VLOGS.find(x => x.id === id)
    assert.ok(v, id)
    const first = passes(v.lines).first
    for (const t of VLOG_NEW_GRAMMAR[id] ?? []) {
      assert.ok(NEW_GRAMMAR[t.id], t.id)
      assert.ok(t.lines.length >= 1)
      assert.equal(t.marks.length, t.lines.length, `${id}: у каждого примера своя метка`)
      t.lines.forEach((i, k) => {
        assert.ok(first[i], `${id}: нет фразы ${i}`)
        assert.ok(first[i].ko.includes(t.marks[k]), `${id}: метка «${t.marks[k]}» не найдена во фразе ${i}`)
      })
    }
  }
})

test('файл справок читает только страница разбора влога (не «Сегодня», не поиск, не задания)', () => {
  const root = fileURLToPath(new URL('../frontend/src/', import.meta.url))
  const users = []
  const walk = dir => {
    for (const n of readdirSync(dir)) {
      const f = path.join(dir, n)
      if (statSync(f).isDirectory()) walk(f)
      else if (/\.(ts|vue)$/.test(n) && /from\s+['"][^'"]*vlog-study['"]/.test(readFileSync(f, 'utf8'))) users.push(path.relative(root, f))
    }
  }
  walk(root)
  assert.deepEqual(users.sort(), ['components/korean/VlogGrammarList.vue', 'components/korean/VlogMap.vue', 'data/korean/vlog-lang.ts', 'data/korean/vlog-words.ts', 'views/korean/VlogStudyView.vue', 'views/korean/VlogView.vue'])
})
