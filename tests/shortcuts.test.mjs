import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const lib = await load('/src/lib/shortcuts.ts')
const data = await load('/src/data/shortcuts.ts')
after(close)

const ev = (code, o = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o })

describe('сочетания клавиш', () => {
  test('сочетание берётся из нажатия, нужен ⌘ или Ctrl', () => {
    assert.equal(lib.comboFromEvent(ev('KeyG', { metaKey: true })), 'mod+KeyG')
    assert.equal(lib.comboFromEvent(ev('KeyG', { ctrlKey: true })), 'mod+KeyG')
    assert.equal(lib.comboFromEvent(ev('KeyG', { ctrlKey: true, shiftKey: true, altKey: true })), 'mod+alt+shift+KeyG')
    assert.equal(lib.comboFromEvent(ev('KeyG')), null)
    assert.equal(lib.comboFromEvent(ev('KeyG', { shiftKey: true })), null)
    assert.equal(lib.comboFromEvent(ev('MetaLeft', { metaKey: true })), null)
    assert.equal(lib.comboFromEvent(ev('ShiftRight', { ctrlKey: true, shiftKey: true })), null)
  })

  test('подписи: ⌘ на Mac, Ctrl на остальных', () => {
    assert.equal(lib.comboLabel('mod+shift+KeyG', true), '⌘⇧G')
    assert.equal(lib.comboLabel('mod+shift+KeyG', false), 'Ctrl+Shift+G')
    assert.equal(lib.comboLabel('mod+alt+Digit5', true), '⌘⌥5')
    assert.equal(lib.comboLabel('mod+ArrowLeft', false), 'Ctrl+←')
  })

  test('поиск ⌘K занят и его не отдать', () => {
    const err = lib.checkCombo('mod+KeyK', 'nav:words', {}, {})
    assert.match(err, /Занято: поиск/)
  })

  test('сочетания браузера отклоняются', () => {
    for (const c of ['mod+KeyT', 'mod+shift+KeyN', 'mod+KeyW', 'mod+Digit3', 'mod+Tab']) assert.match(lib.checkCombo(c, 'nav:words', {}, {}), /браузер/, c)
  })

  test('занятое другим пунктом отклоняется с названием, своё же можно подтвердить', () => {
    const b = { 'nav:grammar': 'mod+KeyG' }
    const labels = { 'nav:grammar': 'Грамматика' }
    assert.match(lib.checkCombo('mod+KeyG', 'nav:words', b, labels), /Грамматика/)
    assert.equal(lib.checkCombo('mod+KeyG', 'nav:grammar', b, labels), null)
    assert.equal(lib.checkCombo('mod+KeyJ', 'nav:words', b, labels), null)
  })

  test('мусор из хранилища отбрасывается', () => {
    const known = ['nav:words', 'nav:grammar', 'cab:notes']
    const out = lib.cleanBindings({ 'nav:words': 'mod+KeyG', 'nav:grammar': 'mod+KeyG', 'cab:notes': 'KeyN', 'nav:zzz': 'mod+KeyJ' }, known)
    assert.deepEqual(out, { 'nav:words': 'mod+KeyG' })
    assert.deepEqual(lib.cleanBindings(null, known), {})
    assert.deepEqual(lib.cleanBindings({ 'nav:words': 'mod+KeyK' }, known), {})
  })

  test('в списке есть все пункты меню и вкладки кабинета без повторов', () => {
    const ids = data.SHORTCUT_IDS
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ['nav:home', 'nav:cabinet', 'nav:today', 'nav:game', 'nav:words', 'nav:ref', 'nav:garden', 'cab:overview', 'cab:settings', 'cab:notes']) assert.ok(ids.includes(id), id)
    assert.equal(data.SHORTCUT_ITEMS.find(i => i.id === 'nav:game').to, '/game')
    assert.equal(data.SHORTCUT_ITEMS.find(i => i.id === 'cab:notes').to, '/korean/cabinet?tab=notes')
  })
})
