/** Проверка карты сайта после выкладки.
 * Запуск: BASE=https://korean.meeymirita.ru node scripts/check-sitemap.mjs
 * CHECK_SITEMAP_SAMPLE — сколько адресов случайно проверить (по умолчанию 50).
 */

const BASE = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '')
const SAMPLE = Number(process.env.CHECK_SITEMAP_SAMPLE || 50)

function locations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => m[1].replaceAll('&amp;', '&'))
}

function sample(items, count, random = Math.random) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, count)
}

export async function checkSitemap({ base = BASE, sampleSize = SAMPLE, get = url => fetch(url), random = Math.random } = {}) {
  const errors = []
  const baseUrl = new URL(base)
  const indexUrl = new URL('/sitemap_index.xml', baseUrl).href
  const indexResponse = await get(indexUrl)
  if (!indexResponse.ok) throw new Error(`${indexUrl}: ${indexResponse.status}`)
  const indexXml = await indexResponse.text()
  if (!/<sitemapindex\b/i.test(indexXml)) throw new Error('Ответ sitemap_index.xml не является индексом карты сайта')
  const chunks = locations(indexXml)
  if (!chunks.length) throw new Error('В sitemap_index.xml нет частей карты сайта')

  const urls = []
  for (const chunk of chunks) {
    const url = new URL(chunk, baseUrl)
    if (url.origin !== baseUrl.origin) throw new Error(`Часть карты сайта находится на другом домене: ${url.href}`)
    const response = await get(url.href)
    if (!response.ok) throw new Error(`${url.href}: ${response.status}`)
    const xml = await response.text()
    if (!/<urlset\b/i.test(xml)) throw new Error(`${url.href}: ответ не является списком адресов`)
    urls.push(...locations(xml))
  }
  if (!urls.length) throw new Error('В частях карты сайта нет адресов')

  const seen = new Set()
  for (const loc of urls) {
    if (/%25/i.test(loc)) errors.push(`Двойное кодирование (%25): ${loc}`)
    if (seen.has(loc)) errors.push(`Повтор адреса: ${loc}`)
    seen.add(loc)
  }

  const candidates = urls.filter(loc => {
    try { return new URL(loc, baseUrl).origin === baseUrl.origin }
    catch { return false }
  })
  const chosen = sample(candidates, Math.max(0, sampleSize), random)
  for (const loc of chosen) {
    const url = new URL(loc, baseUrl).href
    const response = await get(url)
    if (response.status !== 200) errors.push(`${url}: ожидался 200, получен ${response.status}`)
  }
  return { total: urls.length, sampled: chosen.length, errors }
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  try {
    const result = await checkSitemap()
    for (const error of result.errors) console.error(error)
    console.log(`Проверено адресов карты: ${result.total}; выборочно проверено страниц: ${result.sampled}`)
    if (result.errors.length) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
