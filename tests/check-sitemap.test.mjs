import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSitemap } from '../scripts/check-sitemap.mjs'

const response = (body, status = 200) => new Response(body, { status })

describe('проверка карты сайта', () => {
  test('собирает адреса из частей и проверяет выборку страниц', async () => {
    const pages = new Map([
      ['https://site.test/sitemap_index.xml', '<sitemapindex><sitemap><loc>/part.xml</loc></sitemap></sitemapindex>'],
      ['https://site.test/part.xml', '<urlset><url><loc>https://site.test/dict/학생</loc></url><url><loc>https://site.test/dict/가다</loc></url></urlset>'],
      ['https://site.test/dict/%ED%95%99%EC%83%9D', 'ok'],
      ['https://site.test/dict/%EA%B0%80%EB%8B%A4', 'ok'],
    ])
    const result = await checkSitemap({ base: 'https://site.test', sampleSize: 50, get: async url => response(pages.get(url) ?? '', pages.has(url) ? 200 : 404) })
    assert.deepEqual(result, { total: 2, sampled: 2, errors: [] })
  })

  test('находит двойное кодирование, повторы и страницу с кодом не 200', async () => {
    const pages = new Map([
      ['https://site.test/sitemap_index.xml', '<sitemapindex><sitemap><loc>/part.xml</loc></sitemap></sitemapindex>'],
      ['https://site.test/part.xml', '<urlset><url><loc>/dict/%25ED%2595%2599</loc></url><url><loc>/dict/%25ED%2595%2599</loc></url></urlset>'],
      ['https://site.test/dict/%25ED%2595%2599', 'missing'],
    ])
    const result = await checkSitemap({ base: 'https://site.test', get: async url => response(pages.get(url) ?? '', pages.has(url) ? (url.includes('/dict/') ? 404 : 200) : 404) })
    assert.equal(result.errors.filter(e => e.includes('Двойное кодирование')).length, 2)
    assert.equal(result.errors.filter(e => e.includes('Повтор адреса')).length, 1)
    assert.ok(result.errors.some(e => e.includes('ожидался 200, получен 404')))
  })

  test('ошибочно отвечающая карта сайта завершает проверку с ошибкой', async () => {
    await assert.rejects(checkSitemap({ base: 'https://site.test', get: async () => response('', 503) }), /503/)
  })
})
