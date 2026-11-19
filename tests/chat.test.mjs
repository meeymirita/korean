import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { close, load } from './_load.mjs'

const { sections } = await load('/src/data/korean/sections.ts')
const { chatErrorText, koreanParts, parseReply, richReply } = await load('/src/lib/chat.ts')
after(close)

describe('помощник-чат: тексты ошибок', () => {
  test('каждая ошибка сервера объяснена по-русски', () => {
    assert.match(chatErrorText(503), /не настроен/)
    assert.match(chatErrorText(429, 'daily limit'), /закончились/)
    assert.match(chatErrorText(429), /подожди минуту/)
    assert.match(chatErrorText(502), /не отвечает/)
    assert.match(chatErrorText(403), /токену/)
    assert.match(chatErrorText(400, 'message too long'), /2000/)
    assert.match(chatErrorText(500), /500/)
  })

  test('разметка ответа: жирное остаётся, звёздочки, решётки и таблицы убираются', () => {
    const l = parseReply('## Частицы\n**이/가** — подлежащее\n- со *звёздочкой* и **жирным**\n| a | b |\n|---|---|\n| 사과 | яблоко |')
    assert.equal(l.length, 5)
    assert.deepEqual(l[0].pieces, [{ text: 'Частицы', bold: false }])
    assert.deepEqual(l[1].pieces, [{ text: '이/가', bold: true }, { text: ' — подлежащее', bold: false }])
    assert.equal(l[2].bullet, true)
    assert.ok(!JSON.stringify(l).includes('*'))
    assert.ok(!JSON.stringify(l).includes('---'))
    assert.equal(l[4].pieces.map(p => p.text).join(''), '사과 · яблоко')
    assert.equal(parseReply('раз\n---\nдва').length, 2)
  })

  test('корейские фразы для разбора: куски хангыля, без повторов и мусора', () => {
    const t = '**저는** — тема.\n저는 학생이에요 (чонын)\nПеревод: 저는 어제 카페에서 빵을 먹었어요.\n저는 학생이에요\n은/는, 쇼, ма쇼'
    assert.deepEqual(koreanParts(t), ['저는', '저는 학생이에요', '저는 어제 카페에서 빵을 먹었어요'])
    assert.deepEqual(koreanParts('только по-русски'), [])
    assert.equal(koreanParts('가나 다라 마바 사아 자차 카타 파하 거너', 6).length, 1)
    assert.equal(koreanParts(Array.from({ length: 9 }, (_, i) => '빵' + '을'.repeat(i + 1) + ' 먹어요.').join('\n')).length, 6)
  })

  test('страница помощника только для владельца и закрыта токеном', () => {
    const s = sections.find(x => x.id === 'chat')
    assert.equal(s.private, true)
    assert.equal(s.owner, true)
  })
})

describe('помощник-чат: красивый показ ответа', () => {
  const sample = [
    '저는 빵을 먹어요. — Я ем хлеб.',
    '',
    'Правило:',
    '1. нет 받침 → ㄹ 거예요 (갈 거예요)',
    '- есть 받침 → 을 거예요',
    'Попробуй: скажи по-корейски «Я завтра пойду в магазин».',
    'Глагол 먹다 → 먹어요, обычная строка.',
  ].join('\n')
  const r = richReply(sample)

  test('корейская фраза с переводом становится карточкой', () => {
    assert.equal(r[0].kind, 'phrase')
    assert.equal(r[0].ko, '저는 빵을 먹어요.')
    assert.equal(r[0].ru, 'Я ем хлеб.')
  })
  test('подзаголовок, нумерация, пункт и задание узнаются', () => {
    assert.equal(r[1].kind, 'head')
    assert.equal(r[1].parts[0].text, 'Правило')
    assert.equal(r[2].num, '1')
    assert.ok(!r[2].parts.map(p => p.text).join('').startsWith('1.'))
    assert.equal(r[3].bullet, true)
    assert.equal(r[4].kind, 'tip')
  })
  test('хангыль внутри обычного текста выделяется отдельным куском, ничего не теряется', () => {
    const line = r[5]
    assert.equal(line.kind, 'text')
    assert.ok(line.parts.some(p => p.ko && p.text === '먹다'))
    assert.equal(line.parts.map(p => p.text).join(''), 'Глагол 먹다 → 먹어요, обычная строка.')
  })
  test('разметка и HTML не просачиваются', () => {
    const j = JSON.stringify(richReply('**жирное** и <b>тег</b> и *звёздочка*'))
    assert.ok(!j.includes('*'))
    assert.equal(richReply('').length, 0)
  })
})
