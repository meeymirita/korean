/**
 * Демо-данные для демо-сервера: «месяц занятий» через обычный API (ответы в играх и тренажёрах, время, настроение, профиль,
 * заметки, записи календаря, картинки с тегами). Нужен для скриншотов «О платформе» и чтобы показать сайт без личных данных.
 * Запуск (демо-сервер, НЕ сервер владельца: данные добавляются к тому, что уже есть):
 *   API=http://127.0.0.1:3002 TOKEN=токен-демо-сервера node scripts/demo-seed.mjs
 * Переменные: API (адрес сервера, по умолчанию http://127.0.0.1:3002), TOKEN, DAYS (сколько дней назад, 30), IMAGES=0 (без картинок).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { close, load } from '../tests/_load.mjs'

const API = (process.env.API || 'http://127.0.0.1:3002').replace(/\/$/, '')
const TOKEN = process.env.TOKEN
const DAYS = Number(process.env.DAYS || 30)
if (!TOKEN) {
  console.error('Задайте TOKEN=токен демо-сервера (не токен владельца)')
  process.exit(2)
}
const root = fileURLToPath(new URL('..', import.meta.url))
const auth = { Authorization: `Bearer ${TOKEN}` }

async function call(method, url, body) {
  const res = await fetch(API + url, { method, headers: { ...auth, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`)
  return res.json()
}

// повторяемый «случайный» генератор: при каждом запуске одни и те же данные
let seed = 20261102
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = a => a[Math.floor(rnd() * a.length)]
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const { D } = await load('/src/data/korean/words.ts')
await close()
const pool = D.filter(d => /^[가-힣]+$/.test(d.k)).slice(0, 160)
const SOURCES = [
  ['today', ''], ['game', 'translate'], ['game', 'build'], ['game', 'pairs'], ['trainer', 'match'], ['trainer', 'quick'], ['trainer', 'type'], ['review', ''],
]

/* ---------- ответы, время и настроение за DAYS дней ---------- */
const ops = []
const now = new Date()
for (let back = DAYS; back >= 0; back--) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 19, 0)
  if (back > 7 && rnd() < 0.25) continue // пропуски в начале месяца, последняя неделя без пропусков (серия)
  const day = dayKey(d)
  const skill = 0.6 + 0.3 * (1 - back / DAYS) // к концу месяца ошибок меньше
  const n = 15 + Math.floor(rnd() * 35)
  for (let i = 0; i < n; i++) {
    const w = pick(pool)
    const [source, mode] = pick(SOURCES)
    const ok = rnd() < skill
    const y = ok ? w.t : pick(pool).t
    ops.push({ type: 'answer', t: d.getTime() + i * 40_000, day, word: w.k, ok, source, ...(mode ? { mode } : {}), detail: { q: w.k, a: w.t, y } })
  }
  ops.push({ type: 'time', day, seconds: 600 + Math.floor(rnd() * 2400) })
  ops.push({ type: 'mood', day, mood: pick(['easy', 'ok', 'ok', 'hard']) })
}
ops.push({ type: 'profile', name: 'Демо', avatar: '🌸' })
for (let i = 0; i < ops.length; i += 500) await call('POST', '/api/ops', { ops: ops.slice(i, i + 500) })
console.log(`ответов: ${ops.filter(o => o.type === 'answer').length}, дней: ${ops.filter(o => o.type === 'time').length}`)

/* ---------- картинки с тегами (из картинок самого сайта) ---------- */
const imageIds = []
if (process.env.IMAGES !== '0') {
  const sharp = createRequire(path.join(root, 'server/package.json'))('sharp')
  const pics = [
    ['src/assets/upload/bg.webp', 'Сакура ночью', ['сакура', 'фон']],
    ['src/assets/home/yuna.webp', 'Юна у окна', ['юна']],
    ['src/assets/icons/shop-yuna.webp', 'Юна в магазине', ['юна', 'магазин']],
    ['src/assets/home/dash/bg-yuna.webp', 'Юна с флагом', ['юна', 'корея']],
  ]
  for (const [file, caption, tags] of pics) {
    const jpg = await sharp(path.join(root, file)).flatten({ background: '#f6eefc' }).jpeg({ quality: 80 }).toBuffer()
    const form = new FormData()
    form.append('file', new Blob([jpg], { type: 'image/jpeg' }), path.basename(file, '.webp') + '.jpg')
    form.append('caption', caption)
    form.append('tags', JSON.stringify(tags))
    const res = await fetch(API + '/api/images', { method: 'POST', headers: auth, body: form })
    if (!res.ok) throw new Error(`картинка ${file}: ${res.status}`)
    imageIds.push((await res.json()).id)
  }
  console.log(`картинок: ${imageIds.length}`)
}

/* ---------- заметки ---------- */
const t = Date.now()
const notes = [
  { title: 'Частицы 이 / 가 и 은 / 는', text: '이 / 가 — кто именно (новая информация), 은 / 는 — что касается (тема).\n저는 학생이에요. 누가 왔어요? 친구가 왔어요.', tags: ['грамматика', 'частицы'] },
  { title: 'Слова с урока у Леры', text: '영화관 — кинотеатр\n도서관 — библиотека\n편의점 — магазин у дома', tags: ['слова', 'лера'], images: imageIds.slice(0, 1) },
  { title: 'Прошедшее время', text: '가요 → 갔어요, 먹어요 → 먹었어요, 해요 → 했어요.', tags: ['грамматика'] },
]
await call('PUT', '/api/notes', { v: 1, updated: t, notes: notes.map((n, i) => ({ id: 'demo' + i, images: [], ...n, created: t - i * 86_400_000, updated: t - i * 86_400_000 })) })
console.log(`заметок: ${notes.length}`)

/* ---------- календарь: созвоны с учителем по субботам и свои занятия ---------- */
let plans = 0
for (let back = -7; back <= 21; back++) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back)
  if (d.getDay() === 6) {
    await call('POST', '/api/plans', { day: dayKey(d), time: '11:00', title: 'Созвон с Лерой', text: 'Повторить частицы и прошедшее время', kind: 'tutor', tags: ['лера'] })
    plans++
  } else if (d.getDay() === 3) {
    await call('POST', '/api/plans', { day: dayKey(d), time: '20:00', title: 'Видеоурок', text: 'Урок ' + (11 + Math.floor(back / 7)), kind: 'own', tags: ['видео'] })
    plans++
  }
}
console.log(`записей календаря: ${plans}`)
console.log('Готово')
