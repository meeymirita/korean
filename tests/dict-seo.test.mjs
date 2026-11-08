import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { mainTranslation, translations, wordTitle, wordDescription, wordLead, wordJsonLd, collectionJsonLd } = await load('/src/lib/dictSeo.ts')
after(close)

const e = (over = {}) => ({
  word: '학교', pron: '학꾜', pos: 'существительное', level: 'начальный', cat: '',
  senses: [{ ko: 'x', ru: [{ t: 'школа; учебное заведение', d: 'Место, где учат.' }], sent: [] }, { ko: 'y', ru: [{ t: 'школа', d: '' }], sent: [] }],
  ...over,
})

describe('SEO страницы слова', () => {
  test('главный перевод и список переводов без повторов', () => {
    assert.equal(mainTranslation(e()), 'школа')
    assert.deepEqual(translations(e()), ['школа', 'учебное заведение'])
  })

  test('если перевода нет, берётся русское описание', () => {
    const x = e({ senses: [{ ko: 'k', ru: [{ t: '', d: 'Только описание значения.' }], sent: [] }] })
    assert.equal(mainTranslation(x), 'Только описание значения.')
  })

  test('заголовок: слово, перевод, «спряжение» только у глаголов и прилагательных, до 75 знаков', () => {
    assert.equal(wordTitle(e()), '학교 — школа: перевод, значение и примеры · 우리말')
    const v = wordTitle(e({ word: '가다', pos: 'глагол' }))
    assert.match(v, /спряжение/)
    assert.ok(v.length <= 75, v)
    assert.ok(wordTitle(e({ senses: [{ ko: '', ru: [{ t: 'очень длинный перевод слова который не помещается в заголовок', d: '' }], sent: [] }] })).length <= 85)
  })

  test('описание 80–175 знаков с чтением, уровнем и переводами', () => {
    const d = wordDescription(e())
    assert.ok(d.length >= 80 && d.length <= 175, `${d.length}: ${d}`)
    assert.match(d, /학교 \[학꾜\] \(существительное, начальный уровень\) — школа; учебное заведение/)
    assert.ok(wordDescription(e({ senses: [{ ko: '', ru: [{ t: 'а; б; в; г; д; е; ж; з; и; к; л; м; н; о; п; р; с; т; у; ф; х; ц; ч; ш; щ; ъ; ы; ь; э; ю; я; один; два; три; четыре; пять', d: '' }], sent: [] }] })).length <= 175)
  })

  test('уровень «нет» в описании не пишется', () => {
    assert.ok(!wordDescription(e({ level: 'нет' })).includes('уровень'))
  })

  test('лид для читателя содержит русскую фразу «как по-корейски»', () => {
    assert.match(wordLead(e()), /Так по-корейски будет «школа»/)
  })

  test('JSON-LD: определение термина и хлебные крошки с адресами', () => {
    const ld = wordJsonLd(e(), 'https://korean.meeymirita.ru/dict/%ED%95%99%EA%B5%90')
    const term = ld['@graph'][0]
    assert.equal(term['@type'], 'DefinedTerm')
    assert.equal(term.name, '학교')
    assert.equal(term.inLanguage, 'ko')
    const crumbs = ld['@graph'][1].itemListElement
    assert.deepEqual(crumbs.map(c => c.position), [1, 2, 3])
    assert.equal(crumbs[2].item, 'https://korean.meeymirita.ru/dict/%ED%95%99%EA%B5%90')
  })
})

test('JSON-LD подборки: коллекция со списком слов и крошки из четырёх шагов', () => {
  const items = Array.from({ length: 80 }, (_, i) => ({ word: `단어${i}` }))
  const ld = collectionJsonLd({ title: '100 слов', description: 'описание', items }, 'https://korean.meeymirita.ru/dict/podborki/top-100')
  const page = ld['@graph'][0]
  assert.equal(page['@type'], 'CollectionPage')
  assert.equal(page.mainEntity.numberOfItems, 80)
  assert.equal(page.mainEntity.itemListElement.length, 50)
  assert.match(page.mainEntity.itemListElement[0].url, /\/dict\/%EB%8B%A8%EC%96%B40$/)
  assert.deepEqual(ld['@graph'][1].itemListElement.map(c => c.position), [1, 2, 3, 4])
})
