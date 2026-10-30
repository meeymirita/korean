import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load, stubLocalStorage } from './_load.mjs'

const ls = stubLocalStorage()
ls.set('theme_mode', 'dark')
const { resolveTheme, isMode, setTheme, themeMode, MODES, THEME_KEY } = await load('/src/lib/theme.ts')
after(close)

describe('тема оформления', () => {
  test('«авто» следует за системой, явный выбор важнее системы', () => {
    assert.equal(resolveTheme('auto', true), 'dark')
    assert.equal(resolveTheme('auto', false), 'light')
    assert.equal(resolveTheme('light', true), 'light')
    assert.equal(resolveTheme('dark', false), 'dark')
  })

  test('допустимы только три режима', () => {
    assert.deepEqual(MODES.map(m => m.id), ['auto', 'light', 'dark'])
    for (const ok of ['auto', 'light', 'dark']) assert.ok(isMode(ok))
    for (const bad of ['', 'Dark', null, undefined, 5, 'sepia']) assert.ok(!isMode(bad))
  })

  test('сохранённый выбор читается при запуске, новый выбор записывается', () => {
    assert.equal(themeMode.value, 'dark')
    setTheme('light')
    assert.equal(themeMode.value, 'light')
    assert.equal(ls.get(THEME_KEY), 'light')
  })
})
