import { describe, expect, it } from 'vitest'
import { cleanCategory, cleanTitle, cleanUrl, downloadArgs, fixUploadName, infoArgs, parseProgress, signPath, titleFromName, verifySigned, ytdlpError } from '../src/music/music.util'

// Музыкальный плеер: чистые функции (без базы и сети).
describe('музыка: подпись ссылок', () => {
  const path = '/api/music/0123456789abcdef/stream'
  it('своя подпись проходит, чужой путь, срок и подделка нет', () => {
    const url = signPath(path, 'secret', 1000, 5000)
    const q = new URLSearchParams(url.split('?')[1])
    expect(verifySigned(path, q.get('e'), q.get('s'), 'secret', 2000)).toBe(true)
    expect(verifySigned(path, q.get('e'), q.get('s'), 'secret', 7000), 'срок вышел').toBe(false)
    expect(verifySigned(path.replace('stream', 'cover'), q.get('e'), q.get('s'), 'secret', 2000), 'другой путь').toBe(false)
    expect(verifySigned(path, q.get('e'), q.get('s'), 'other', 2000), 'другой секрет').toBe(false)
    expect(verifySigned(path, q.get('e'), 'x'.repeat(32), 'secret', 2000)).toBe(false)
    expect(verifySigned(path, undefined, undefined, 'secret', 2000)).toBe(false)
  })
})

describe('музыка: yt-dlp', () => {
  it('процент из строки вывода', () => {
    expect(parseProgress('  5.0%'), 'так печатает настоящий yt-dlp').toBe(5)
    expect(parseProgress('\u001b[0;94m 42.5%\u001b[0m')).toBe(42.5)
    expect(parseProgress('download:  12.3%')).toBe(12.3)
    expect(parseProgress('[download]  45.0% of 3.2MiB')).toBe(45)
    expect(parseProgress('download: 100.0%')).toBe(100)
    expect(parseProgress('что-то другое')).toBeNull()
  })

  it('ссылка передаётся после «--», чтобы её нельзя было принять за параметр; cookies только если заданы', () => {
    const a = downloadArgs('https://youtu.be/x', { outDir: '/tmp/o' })
    expect(a.slice(-2)).toEqual(['--', 'https://youtu.be/x'])
    expect(a).not.toContain('--cookies')
    expect(a).toContain('--no-playlist')
    expect(infoArgs('https://youtu.be/x', { cookies: '/c.txt' })).toEqual(expect.arrayContaining(['--cookies', '/c.txt', '--dump-single-json']))
  })

  it('ошибки объясняются по-русски', () => {
    expect(ytdlpError("ERROR: [youtube] x: Sign in to confirm you're not a bot")).toMatch(/не бот/)
    expect(ytdlpError('ERROR: [youtube] x: Private video')).toMatch(/недоступно/)
    expect(ytdlpError('ERROR: Unsupported URL: https://a.b')).toMatch(/не поддерживается/)
    expect(ytdlpError('')).toBe('неизвестная ошибка')
  })
})

describe('музыка: проверка ввода', () => {
  it('ссылка: только http(s) без пробелов', () => {
    expect(cleanUrl(' https://youtu.be/abc ')).toBe('https://youtu.be/abc')
    for (const bad of ['file:///x', 'javascript:1', 'ftp://a.b', 'https://a.b/c d', '', 5, null]) expect(cleanUrl(bad)).toBeNull()
  })

  it('название и имя файла', () => {
    expect(cleanTitle('  Моя   песня ')).toBe('Моя песня')
    expect(cleanTitle('   ')).toBeNull()
    expect(cleanTitle('я'.repeat(151))).toBeNull()
    expect(titleFromName('Моя_песня__тихая.mp3')).toBe('Моя песня тихая')
    expect(titleFromName('')).toBe('Без названия')
  })

  it('вкладка: не указана: тихая музыка, известные принимаются, чужая отклоняется', () => {
    expect(cleanCategory(undefined)).toBe('quiet')
    expect(cleanCategory('')).toBe('quiet')
    expect(cleanCategory('nightcore')).toBe('nightcore')
    expect(cleanCategory('quiet')).toBe('quiet')
    for (const bad of ['jazz', 'QUIET', 5, {}, 'quiet ']) expect(cleanCategory(bad)).toBeNull()
  })

  it('кириллица в имени загруженного файла: латиница-кракозябры исправляются, нормальное имя не трогается', () => {
    const garbled = Buffer.from('Моя песня.mp3', 'utf8').toString('latin1')
    expect(fixUploadName(garbled)).toBe('Моя песня.mp3')
    expect(fixUploadName('Моя песня.mp3')).toBe('Моя песня.mp3')
    expect(fixUploadName('plain.mp3')).toBe('plain.mp3')
  })
})
