import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { crumbsFor, CABINET_TABS } = await load('/src/data/korean/crumbs.ts')
const { sections } = await load('/src/data/korean/sections.ts')
after(close)

const labels = c => c.map(x => x.label).join(' › ')

describe('хлебные крошки', () => {
  test('на главной раздела и вне раздела крошек нет', () => {
    assert.deepEqual(crumbsFor('/korean/home'), [])
    assert.deepEqual(crumbsFor('/korean'), [])
    assert.deepEqual(crumbsFor('/about'), [])
    assert.deepEqual(crumbsFor('/korean/nope'), [])
  })

  test('обычная страница: Главная › Раздел, текущая без ссылки', () => {
    const c = crumbsFor('/korean/words')
    assert.equal(labels(c), 'Главная › Слова')
    assert.equal(c[0].to, '/korean/home')
    assert.equal(c[1].to, undefined)
  })

  test('вкладка справочника: родитель «Справочник» ведёт на /korean/ref', () => {
    const c = crumbsFor('/korean/ref/numbers')
    assert.equal(labels(c), 'Главная › Справочник › Числа')
    assert.equal(c[1].to, '/korean/ref')
  })

  test('задания, открывающиеся из тренажёров, лежат под «Тренажёры»', () => {
    for (const id of ['particles', 'pairs', 'translate', 'syllables']) {
      const c = crumbsFor('/korean/' + id)
      assert.equal(c.length, 3, id)
      assert.equal(c[1].label, 'Тренажёры')
      assert.equal(c[1].to, '/korean/trainers')
    }
  })

  test('вкладка кабинета берётся из ?tab=, «Кабинет» ведёт на обзор', () => {
    assert.equal(labels(crumbsFor('/korean/cabinet')), 'Главная › Кабинет')
    const c = crumbsFor('/korean/cabinet', { tab: 'notes' })
    assert.equal(labels(c), 'Главная › Кабинет › Заметки')
    assert.equal(c[1].to, '/korean/cabinet')
    assert.equal(labels(crumbsFor('/korean/cabinet', { tab: 'мусор' })), 'Главная › Кабинет')
    assert.equal(Object.keys(CABINET_TABS).length, 8)
  })

  test('вкладки «Сегодня» и режим тренажёров берутся из адреса', () => {
    assert.equal(labels(crumbsFor('/korean/today')), 'Главная › Сегодня')
    const c = crumbsFor('/korean/today', { tab: 'list' })
    assert.equal(labels(c), 'Главная › Сегодня › Чек-лист')
    assert.equal(c[1].to, '/korean/today')
    assert.equal(labels(crumbsFor('/korean/today', { tab: 'history' })), 'Главная › Сегодня › История')
    assert.equal(labels(crumbsFor('/korean/trainers', { mode: 'type' })), 'Главная › Тренажёры › Напиши перевод')
    assert.equal(labels(crumbsFor('/korean/trainers', { mode: 'match' })), 'Главная › Тренажёры')
    assert.equal(labels(crumbsFor('/korean/words', { tab: 'list' })), 'Главная › Слова')
  })

  test('у каждой страницы раздела есть крошки, все ссылки ведут на существующие страницы', () => {
    const paths = new Set(sections.map(s => (s.group === 'ref' ? `/korean/ref/${s.id}` : `/korean/${s.id}`)))
    paths.add('/korean/ref')
    for (const s of sections) {
      if (s.id === 'home') continue
      const path = s.group === 'ref' ? `/korean/ref/${s.id}` : `/korean/${s.id}`
      const c = crumbsFor(path)
      assert.ok(c.length >= 2, path)
      for (const x of c.slice(0, -1)) assert.ok(x.to === '/korean/home' || paths.has(x.to), `${path}: ${x.to}`)
    }
  })
})
