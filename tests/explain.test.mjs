import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

stubLocalStorage()
const { explain } = await load('/src/data/korean/explain.ts')
const { randomTasks, makeTask } = await load('/src/data/korean/tasks.ts')
const { ruleTasks } = await load('/src/data/korean/rule-tasks.ts')
const { G } = await load('/src/data/korean/grammar.ts')
const { D } = await load('/src/data/korean/words.ts')
after(close)

const wrong = t => t.options.find(o => o !== t.answer)

describe('разбор ошибок', () => {
  test('задание на правило ссылается на его карточку и называет верный ответ', () => {
    const g = G.find(x => x.id === 'eun')
    const t = ruleTasks(g, 3)[0]
    assert.equal(t.gram, 'eun')
    const e = explain(t, wrong(t))
    assert.deepEqual(e.gram, { id: 'eun', title: g.ko })
    assert.ok(e.text.includes(`«${t.answer}»`))
    assert.ok(e.text.includes(g.d))
  })

  test('задание на форму: настоящее ведёт на карточку, прошедшее объясняет правило без ссылки', () => {
    let present, past
    for (let i = 0; i < 200 && !(present && past); i++) {
      for (const t of randomTasks(15)) {
        if (t.kind !== 'form') continue
        if (t.title.includes('прошедшее')) past ??= t
        else present ??= t
      }
    }
    assert.ok(present && past)
    assert.ok(['ayo', 'adj'].includes(present.gram))
    assert.match(explain(present, wrong(present)).text, /Вежливое настоящее/)
    assert.equal(explain(past, wrong(past)).gram, undefined)
    assert.match(explain(past, wrong(past)).text, /Прошедшее время/)
  })

  test('задания на слова: переводы, чтение и пропущенное слово объясняются без ссылки', () => {
    const w = D.find(d => d.s.split(d.k).length === 2 && d.k.length >= 2)
    for (const kind of ['tr', 'back', 'read', 'blank']) {
      const t = makeTask(kind, w, 1)
      if (!t) continue
      const e = explain(t, wrong(t))
      assert.equal(e.gram, undefined, kind)
      assert.ok(e.text.includes(wrong(t)), `${kind}: выбранный ответ назван`)
      assert.ok(e.text.includes(t.answer), `${kind}: верный ответ назван`)
    }
  })
})
