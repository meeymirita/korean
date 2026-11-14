import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = name => readFileSync(new URL(`../frontend/src/assets/${name}`, import.meta.url), 'utf8')

// Оболочка раздела не шире 1640 px: если фон рисуется на body, на широких окнах слева и справа видны полосы цвета html.
describe('фон раздела (храм и сакура)', () => {
  test('рисуется на html (холст), а не на body: полос по краям нет', () => {
    for (const f of ['sky.css', 'dark.css', 'night.css']) {
      const src = css(f)
      assert.ok(src.includes(':has(.study-shell.sky)'), f)
      assert.ok(!/body:has\(\.study-shell\.sky\)\s*[,{]/.test(src.replace(/body:has\(\.study-shell\.sky\) \{ background: transparent; \}/, '')), `${f}: фон снова на body`)
    }
    assert.match(css('sky.css'), /html:has\(\.study-shell\.sky\)\s*\{/)
    assert.match(css('sky.css'), /body:has\(\.study-shell\.sky\) \{ background: transparent; \}/, 'body не должен закрывать фон html своим цветом')
  })
})
