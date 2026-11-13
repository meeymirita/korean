import { describe, expect, it } from 'vitest'
import { buildWordsCsv, csvField } from '../src/wordsexport/csv'
import { collectRows } from '../src/wordsexport/wordsexport.service'

describe('CSV «Мои слова»', () => {
  it('поле: кавычки удваиваются, запятая и перенос берутся в кавычки, простое остаётся как есть', () => {
    expect(csvField('человек')).toBe('человек')
    expect(csvField('друг, приятель')).toBe('"друг, приятель"')
    expect(csvField('он сказал "да"')).toBe('"он сказал ""да"""')
    expect(csvField('строка1\nстрока2')).toBe('"строка1\nстрока2"')
    expect(csvField(5)).toBe('5')
  })

  it('поле, похожее на формулу, не исполняется в Excel', () => {
    expect(csvField('=1+1')).toBe("'=1+1")
    expect(csvField('@a')).toBe("'@a")
  })

  it('файл: BOM, заголовок, строки через CRLF, выучено да/нет', () => {
    const t = buildWordsCsv([
      { ko: '사람', reading: 'сарам', ru: 'человек', score: 5, ok: 7, bad: 2, known: true },
      { ko: '이것', reading: 'иго', ru: 'это, эта вещь', score: 1, ok: 1, bad: 0, known: false },
    ])
    expect(t.charCodeAt(0)).toBe(0xfeff)
    expect(t.slice(1).split('\r\n')).toEqual([
      'Корейский,Чтение,Перевод,Очки,Верных,Ошибок,Выучено',
      '사람,сарам,человек,5,7,2,да',
      '이것,иго,"это, эта вещь",1,1,0,нет',
      '',
    ])
  })

  it('без слов остаётся только заголовок', () => {
    expect(buildWordsCsv([]).split('\r\n')[0]).toContain('Корейский')
  })

  it('строки: слова с ответами по порядку словаря, выучено с серии 5, свои записанные слова в конце без повторов', () => {
    const rows = collectRows(
      [
        { word: '친구', ok: 6, bad: 1, streak: 5 },
        { word: '사람', ok: 2, bad: 0, streak: 2 },
        { word: 'неизвестное', ok: 1, bad: 0, streak: 1 },
      ],
      [
        { ko: '사람', reading: 'x', ru: 'x' },
        { ko: '맛있다', reading: 'масида', ru: 'вкусный' },
      ],
    )
    expect(rows.map(r => r.ko)).toEqual(['사람', '친구', 'неизвестное', '맛있다'])
    expect(rows[0]).toMatchObject({ reading: 'сарам', ru: 'человек', score: 2, known: false })
    expect(rows[1]).toMatchObject({ score: 5, known: true })
    expect(rows[2]).toMatchObject({ reading: '', ru: '' })
    expect(rows[3]).toMatchObject({ ru: 'вкусный', score: 0, known: false })
  })
})
