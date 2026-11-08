import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BATCH, buildBody, chunk, findKey, sitemapUrls } from '../scripts/indexnow.mjs'

describe('IndexNow', () => {
  test('адреса режутся порциями не больше 10 000', () => {
    const urls = Array.from({ length: 25_000 }, (_, i) => `https://x.ru/${i}`)
    assert.deepEqual(chunk(urls).map(c => c.length), [BATCH, BATCH, 5000])
    assert.deepEqual(chunk([]), [])
  })

  test('тело запроса: хост, ключ, адрес файла-ключа и список', () => {
    assert.deepEqual(buildBody('https://korean.meeymirita.ru', 'abc', ['https://korean.meeymirita.ru/dict']), {
      host: 'korean.meeymirita.ru', key: 'abc', keyLocation: 'https://korean.meeymirita.ru/abc.txt', urlList: ['https://korean.meeymirita.ru/dict'],
    })
  })

  test('ключ это единственный файл из 32 шестнадцатеричных знаков', () => {
    const dir = mkdtempSync(join(tmpdir(), 'indexnow-'))
    writeFileSync(join(dir, 'favicon.svg'), '')
    assert.throws(() => findKey(dir), /ровно один/)
    writeFileSync(join(dir, 'a'.repeat(32) + '.txt'), 'a'.repeat(32))
    assert.equal(findKey(dir), 'a'.repeat(32))
    writeFileSync(join(dir, 'b'.repeat(32) + '.txt'), 'b')
    assert.throws(() => findKey(dir), /ровно один/)
  })

  test('в репозитории лежит ровно один ключ и в файле тот же ключ', async () => {
    const { readFileSync } = await import('node:fs')
    const key = findKey()
    assert.equal(readFileSync(new URL(`../frontend/public/${key}.txt`, import.meta.url), 'utf8').trim(), key)
  })

  test('адреса собираются из индекса карты сайта по всем кускам', async () => {
    const pages = {
      'https://s.ru/sitemap_index.xml': '<sitemapindex><sitemap><loc>https://s.ru/__sitemap__/0.xml</loc></sitemap><sitemap><loc>https://s.ru/__sitemap__/1.xml</loc></sitemap></sitemapindex>',
      'https://s.ru/__sitemap__/0.xml': '<urlset><url><loc>https://s.ru/</loc></url><url><loc>https://s.ru/dict</loc></url></urlset>',
      'https://s.ru/__sitemap__/1.xml': '<urlset><url><loc>https://s.ru/dict/%ED%95%99</loc></url></urlset>',
    }
    const urls = await sitemapUrls('https://s.ru', async u => pages[u] ?? Promise.reject(new Error(u)))
    assert.deepEqual(urls, ['https://s.ru/', 'https://s.ru/dict', 'https://s.ru/dict/%ED%95%99'])
  })
})
