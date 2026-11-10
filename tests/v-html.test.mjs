import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Токен владельца лежит в localStorage, поэтому чужая разметка на странице недопустима: всё, что вставляется через v-html,
// обязано пройти экранирование (esc, hl) или быть разметкой из кода сайта (F и blk размечают данные грамматики, не ввод).
const SRC = new URL('../frontend/src/', import.meta.url).pathname
const walk = d => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

/** Выражения без esc/hl/F: каждое проверено руками, причина записана. Новое место сюда попадает только с объяснением. */
const STATIC = {
  'components/korean/GrammarModal.vue': { "current.b.map(blk).join('')": 'блоки карточки грамматики из data/korean/grammar.ts' },
  'components/cabinet/TelegramGuide.vue': { preview: 'текст экранируется, обратно разрешены только теги b, i, u, s, code и ссылки http(s)' },
  'views/korean/RichView.vue': { html: 'готовые страницы справочника из data/korean/pages.ts' },
  'views/GameHomeView.vue': { markup: 'статичный файл game/markup.html' },
}

const SAFE_CALL = /^(esc|hl|F)\(/

test('каждый v-html проходит экранирование или записан как статичная разметка', () => {
  const seen = new Set()
  for (const file of walk(SRC).filter(f => f.endsWith('.vue'))) {
    const rel = file.replace(SRC, '')
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/v-html="([^"]*)"/g)) {
      const expr = m[1].trim()
      if (SAFE_CALL.test(expr)) continue
      if (/^h\(/.test(expr)) {
        assert.match(text, /const h = \([^)]*\) =>\s*hl\(/, `${rel}: h() должна быть обёрткой над hl()`)
        continue
      }
      assert.ok(STATIC[rel]?.[expr], `${rel}: v-html="${expr}" без esc/hl/F. Экранируй ввод или допиши место в STATIC с причиной`)
      seen.add(`${rel}|${expr}`)
    }
  }
  for (const [rel, list] of Object.entries(STATIC)) for (const expr of Object.keys(list)) assert.ok(seen.has(`${rel}|${expr}`), `${rel}: в STATIC осталась запись "${expr}", которой нет в коде`)
})

test('предпросмотр сообщения Telegram: сначала экранирование, потом только разрешённые теги', () => {
  const text = readFileSync(join(SRC, 'components/cabinet/TelegramGuide.vue'), 'utf8')
  const body = text.slice(text.indexOf('const preview = computed'), text.indexOf('async function publish'))
  assert.match(body, /^const preview = computed\(\(\) =>\s*esc\(text\.value\)/)
  assert.match(body, /\(b\|i\|u\|s\|code\)/)
  assert.match(body, /href="\(https\?:/)
})

test('esc закрывает угловые скобки и амперсанд, hl экранирует текст до подсветки', async () => {
  const { load, close } = await import('./_load.mjs')
  try {
    const { esc, hl } = await load('/src/data/korean/render.ts')
    assert.equal(esc('<img src=x onerror=1>&'), '&lt;img src=x onerror=1&gt;&amp;')
    assert.equal(hl('<b>학교</b>', ['학교']), '&lt;b&gt;<mark>학교</mark>&lt;/b&gt;')
  } finally {
    await close()
  }
})
