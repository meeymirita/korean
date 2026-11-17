import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'

// «Пройдено» одно для всего сайта: `st` в grammar.ts. Личных отметок «пройдено» (метки u и d) больше нет, и этот тест не даёт ей вернуться.
const root = new URL('../frontend/src/', import.meta.url)
function files(dir) {
  return readdirSync(dir).flatMap(f => {
    const p = new URL(f + (statSync(new URL(f, dir)).isDirectory() ? '/' : ''), dir)
    return statSync(p).isDirectory() ? files(p) : /\.(vue|ts)$/.test(f) ? [p] : []
  })
}

describe('единый статус «пройдено»', () => {
  test('сайт не читает и не ставит личные метки «пройдено» (u и d), кнопок отметки нет', () => {
    const bad = []
    for (const p of files(root)) {
      if (p.pathname.endsWith('/data/history.ts')) continue
      const src = readFileSync(p, 'utf8')
      if (/(isMarked|toggleMark)\(\s*'[ud]'/.test(src) || /Снять отметку «пройдено»|Отметить пройденным/.test(src)) bad.push(p.pathname.split('/frontend/')[1])
    }
    assert.deepEqual(bad, [], 'личная отметка u или d вернулась: пройдено определяется только st в grammar.ts')
  })

  test('страницы грамматики и «Что я уже знаю» берут пройденное только из данных', () => {
    for (const f of ['views/korean/KnowView.vue', 'views/korean/GrammarView.vue', 'components/korean/GrammarModal.vue']) {
      assert.ok(/st === 'ok'/.test(readFileSync(new URL(f, root), 'utf8')), f)
    }
  })
})
