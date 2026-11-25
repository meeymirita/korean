<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import AskAi from '@/components/korean/AskAi.vue'
import { clipText, pickDictHit, type ClipWord } from '@/data/korean/clip'
import { VLOGS, lineAt, type Vlog } from '@/data/korean/vlogs'
import { STUDY_VLOGS } from '@/data/korean/vlog-study'
import VlogGrammarList from '@/components/korean/VlogGrammarList.vue'
import VlogCoreWords from '@/components/korean/VlogCoreWords.vue'
import VlogPhrasebook from '@/components/korean/VlogPhrasebook.vue'
import VlogMap from '@/components/korean/VlogMap.vue'
import { coverageOf } from '@/data/korean/vlog-lang'
import { VLOG_TOPICS, VLOG_TOPIC, VLOG_LENGTHS } from '@/data/korean/vlog-topics'
import { VLOG_ORDER_IDS, VLOG_STAGES, stageOf } from '@/data/korean/vlog-order'
import { VLOG_PLAN, VLOG_AUTHORS, DEFAULT_AUTHOR, type VlogPlanItem } from '@/data/korean/vlog-plan'
import { useToastStore } from '@/stores/toast'
import { gramCard, grammarHints } from '@/data/korean/vlog-grammar'
import { usePersisted } from '@/composables/usePersisted'
import { VLOG_ABOUT } from '@/data/korean/vlog-about'
import { searchDict, type DictHit } from '@/lib/dictApi'
import { fetchT } from '@/lib/http'
import { useQueryParam } from '@/composables/useQueryParam'
import { useProgressStore } from '@/stores/progress'
import { useVlogWatched } from '@/composables/useVlogWatched'
import { useRoute } from 'vue-router'
import WordInVlogs from '@/components/korean/WordInVlogs.vue'
import VlogNote from '@/components/korean/VlogNote.vue'
import { ASK_QUICK, clock, noteTitle, useVlogPhrases } from '@/composables/useVlogPhrases'

/**
 * «Влог»: видео и текст по фразам. Идущая фраза подсвечена, нажатие на фразу перематывает, перевод открывается нажатием,
 * слова подсвечены как во «Вырезке». Если видео скачано (`vlog.own`), играет своё `<video>` по подписанной ссылке сервера;
 * иначе встроен плеер ютуба (youtube-nocookie), им управляем сообщениями (postMessage), скрипт ютуба не подключаем.
 */
const progress = useProgressStore()
const toast = useToastStore()
const ids = VLOGS.map(v => v.id)
const cur = useQueryParam('v', '', ids)
const vlog = computed(() => VLOGS.find(v => v.id === cur.value))

/** Свой файл видео: 'none' (нет в данных), 'loading', 'ok' (есть ссылка), 'failed' (нет на сервере: играет ютуб). */
const fileState = ref<'none' | 'loading' | 'ok' | 'failed'>('none')
const fileUrl = ref('')
const useFile = computed(() => fileState.value === 'ok')
/** Подписанная ссылка на свой файл видео; нет файла или сервер не ответил: остаётся плеер ютуба. */
async function loadFile() {
  const name = vlog.value?.own ? vlog.value.yt : ''
  const folder = VLOG_AUTHORS.find(a => a.name === vlog.value?.channel)?.slug ?? ''
  fileUrl.value = ''
  fileState.value = name ? 'loading' : 'none'
  if (!name || !folder) return void (fileState.value = 'none')
  try {
    const res = await fetchT(`/api/video/vlog/${folder}/${name}/url`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (vlog.value?.yt !== name) return
    if (res.ok) {
      fileUrl.value = ((await res.json()) as { url: string }).url
      fileState.value = 'ok'
    } else fileState.value = 'failed'
  } catch {
    fileState.value = 'failed'
  }
}
/** Список: все влоги плейлиста по порядку; готовые открываются, остальные пока заглушки «скоро». */
interface Item { yt: string; title: string; dur: number; author: string; rank: number; vlog?: Vlog; plan?: VlogPlanItem }
const items = computed<Item[]>(() => {
  const out: Item[] = VLOG_PLAN.map(p => {
    const v = VLOGS.find(x => x.yt === p.yt)
    return { yt: p.yt, title: v?.title ?? p.title, dur: v?.lines.length ? Math.round(v.lines[v.lines.length - 1]!.e) : p.dur, author: p.author ?? v?.channel ?? DEFAULT_AUTHOR, rank: 999, vlog: v, plan: p }
  })
  for (const v of VLOGS) if (!VLOG_PLAN.some(p => p.yt === v.yt)) out.push({ yt: v.yt, title: v.title, dur: Math.round(v.lines.at(-1)?.e ?? 0), author: v.channel, rank: 999, vlog: v })
  // номер в общем порядке просмотра (от лёгкого к сложному); видео без текста идут в конце
  const rankOf = new Map(VLOG_ORDER_IDS.map((id, i) => [id, i + 1]))
  for (const it of out) it.rank = (it.vlog && rankOf.get(it.vlog.id)) || 999
  return out.sort((a, b) => a.rank - b.rank)
})
/** Вкладки: «Порядок» (все влоги по рекомендуемому порядку просмотра) и по одному автору; вкладка в адресе (`?a=`), чтобы после обновления остаться на ней. */
const authorSlugs = ['order', ...VLOG_AUTHORS.map(a => a.slug), 'grammar', 'words', 'phrases', 'map']
const tab = useQueryParam('a', 'order', authorSlugs)
const tabs = computed(() => [{ slug: 'order', tab: 'Порядок', count: items.value.length }, ...VLOG_AUTHORS.map(a => ({ slug: a.slug, tab: a.tab, count: items.value.filter(i => i.author === a.name).length })), { slug: 'grammar', tab: 'Грамматика из влогов', count: 0 }, { slug: 'words', tab: 'Слова влогов', count: 0 }, { slug: 'phrases', tab: 'Разговорник', count: 0 }, { slug: 'map', tab: 'Карта мест', count: 0 }])
const ofAuthor = computed(() => {
  if (tab.value === 'order') return items.value
  const name = VLOG_AUTHORS.find(a => a.slug === tab.value)?.name
  return items.value.filter(i => i.author === name)
})
const stageHeads = computed(() => {
  if (tab.value !== 'order') return new Map<number, (typeof VLOG_STAGES)[number]>()
  // заголовок этапа перед первым показанным влогом этапа
  const heads = new Map<number, (typeof VLOG_STAGES)[number]>()
  let last = 0
  for (const it of shownItems.value) {
    const n = stageOf(it.rank, VLOG_ORDER_IDS.length)
    if (n !== last) heads.set(it.rank, VLOG_STAGES[n - 1]!)
    last = n
  }
  return heads
})
/** Фильтры под вкладками: тема (`?t=`) и длина (`?l=`); показываются только те темы и длины, которые есть у этого автора. */
const topic = useQueryParam('t', '', ['', ...VLOG_TOPICS.map(t => t.id)])
const length = useQueryParam('l', '', ['', ...VLOG_LENGTHS.map(l => l.id)])
const topicChips = computed(() => VLOG_TOPICS.map(t => ({ ...t, count: ofAuthor.value.filter(i => VLOG_TOPIC[i.yt] === t.id).length })).filter(t => t.count))
const lengthChips = computed(() => VLOG_LENGTHS.map(l => ({ ...l, count: ofAuthor.value.filter(i => l.test(i.dur)).length })).filter(l => l.count))
const shownItems = computed(() => {
  const t = topicChips.value.some(c => c.id === topic.value) ? topic.value : ''
  const len = VLOG_LENGTHS.find(l => l.id === length.value && lengthChips.value.some(c => c.id === l.id))
  const list = ofAuthor.value.filter(i => (!t || VLOG_TOPIC[i.yt] === t) && (!len || len.test(i.dur)) && (!status.value || statusKey(i) === status.value))
  return sortBy.value === 'known' && import.meta.client ? [...list].sort((a, b) => knownPct(b) - knownPct(a)) : list
})
const readyCount = computed(() => shownItems.value.filter(i => i.vlog).length)

/** Отметки «просмотрено»: общий код со страницей «Разбор влога» (`composables/useVlogWatched.ts`). */
const { watched, canSave, toggleWatched, loadWatched } = useVlogWatched()

/**
 * Результаты теста (`GET /api/vlog-tests`, только владелец) на карточках, фильтр по статусу и пометка «следующий» (первый непросмотренный по порядку).
 * Статус: «не смотрел», «смотрел, не сдал» (отмечен просмотренным, но теста не сдано), «сдано» (есть попытка не ниже проходного).
 */
interface Attempt { yt: string; score: number; total: number; passed: boolean }
const attempts = ref<Attempt[]>([])
async function loadAttempts() {
  if (!canSave.value) return
  try {
    const res = await fetchT('/api/vlog-tests', { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (res.ok) attempts.value = ((await res.json()) as { attempts?: Attempt[] }).attempts ?? []
  } catch {
    /* без результатов карточки просто без значков */
  }
}
const bestBy = computed(() => {
  const m = new Map<string, Attempt>()
  for (const a of attempts.value) {
    const b = m.get(a.yt)
    if (!b || a.score / a.total > b.score / b.total) m.set(a.yt, a)
  }
  return m
})
const passedSet = computed(() => new Set(attempts.value.filter(a => a.passed).map(a => a.yt)))
const pctOf = (a: Attempt) => Math.round((a.score / a.total) * 100)
const statusKey = (i: Item) => (!i.vlog ? 'soon' : passedSet.value.has(i.yt) ? 'passed' : watched.value.includes(i.yt) ? 'seen' : 'todo')
const STATUSES = [{ id: 'todo', label: 'Не смотрел' }, { id: 'seen', label: 'Смотрел, не сдал' }, { id: 'passed', label: 'Сдано' }] as const
const status = useQueryParam('s', '', ['', 'todo', 'seen', 'passed'])
/** Порядок карточек: по номеру или по доле знакомых слов (охват считается только в браузере). */
const sortBy = useQueryParam('o', '', ['', 'known'])
const knownPct = (i: Item) => (import.meta.client && i.vlog ? coverageOf(i.vlog).pct : -1)
const avgKnown = computed(() => {
  if (!import.meta.client || sortBy.value !== 'known') return 0
  const cs = shownItems.value.flatMap(i => (i.vlog ? [coverageOf(i.vlog)] : []))
  const t = cs.reduce((a, c) => a + c.total, 0)
  return t ? Math.round((cs.reduce((a, c) => a + c.known, 0) / t) * 100) : 0
})
const statusChips = computed(() => (canSave.value ? STATUSES.map(s => ({ ...s, count: ofAuthor.value.filter(i => statusKey(i) === s.id).length })).filter(s => s.count) : []))
const nextYt = computed(() => (canSave.value && tab.value === 'order' ? (shownItems.value.find(i => i.vlog && !watched.value.includes(i.yt))?.yt ?? '') : ''))

/** `?t=<секунды>`: открыть влог и перемотать на фразу (ссылки «в видео» со страницы «Разбор» и «звучит во влогах»). */
const route = useRoute()
let startAt: number | null = null
function takeStart() {
  const t = Number(route.query.t)
  startAt = vlog.value && route.query.t !== undefined && Number.isFinite(t) && t >= 0 ? t : null
}
function applyStart() {
  const v = vlog.value
  if (startAt == null || !v) return
  const i = Math.max(0, lineAt(v.lines, startAt))
  startAt = null
  play(i)
}
/** Окошко при наведении на карточку: описание, цифры по тексту и главные темы грамматики (считается один раз, когда навели). */
const hoverYt = ref('')
/** С какой стороны от карточки показать окошко: справа, если там хватает места, иначе слева. */
const popSide = ref<'right' | 'left'>('right')
function hover(yt: string, e: Event) {
  hoverYt.value = yt
  const el = e.currentTarget as HTMLElement | null
  if (el) popSide.value = el.getBoundingClientRect().right + 330 < window.innerWidth ? 'right' : 'left'
}
interface Info { about: string; phrases: number; words: number; known: number; topics: { id: string; ko: string; n: number; state: string }[]; sample: { ko: string; ru: string } | null }
const infoCache = new Map<string, Info>()
function infoOf(v: Vlog): Info {
  const hit = infoCache.get(v.id)
  if (hit) return hit
  const parsed = v.lines.map(l => clipText(l.ko, k => progress.data.words[k]?.streak ?? 0))
  let known = 0
  let total = 0
  const uniq = new Set<string>()
  for (const r of parsed) {
    known += r.known
    total += r.total
    for (const w of r.words) uniq.add(w.key)
  }
  const counts = new Map<string, number>()
  for (const l of v.lines) for (const g of grammarHints(l.ko)) counts.set(g.id, (counts.get(g.id) ?? 0) + 1)
  const topics = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .flatMap(([id, n]) => {
      const c = gramCard(id)
      return c ? [{ id, ko: c.ko, n, state: c.state }] : []
    })
  const mid = v.lines.slice(Math.floor(v.lines.length * 0.3)).find(l => l.ko.length >= 10 && l.ko.length <= 34)
  const info: Info = { about: VLOG_ABOUT[v.id] ?? '', phrases: v.lines.length, words: uniq.size, known: total ? Math.round((known / total) * 100) : 0, topics, sample: mid ? { ko: mid.ko, ru: mid.ru } : null }
  infoCache.set(v.id, info)
  return info
}
const dur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
/**
 * Обложки: сначала с нашего хранилища (`/api/video/vlog-cover/<номер>`, лежат на Диске в `korean_vlog/covers`, на планшете открываются), потом с ютуба,
 * если и это не вышло (нет файла, сеть не пускает на i.ytimg.com), плашка вместо белого фона. Шаг 0 наша, 1 ютуб, 2 плашка.
 */
const thumbStep = ref<Record<string, number>>({})
const coverSrc = (yt: string, step: number) => (step === 0 ? `/api/video/vlog-cover/${yt}` : `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`)
function failThumb(yt: string) {
  thumbStep.value = { ...thumbStep.value, [yt]: (thumbStep.value[yt] ?? 0) + 1 }
}
/** Ошибка могла случиться до оживления страницы (картинки пришли в HTML с сервера): проверяем уже брошенные. */
function sweepThumbs() {
  document.querySelectorAll<HTMLImageElement>('.vl-card img').forEach(img => {
    const m = /\/vlog-cover\/([^/?]+)|\/vi\/([^/]+)\//.exec(img.src)
    const yt = m?.[1] ?? m?.[2]
    if (yt && img.complete && img.naturalWidth === 0) failThumb(yt)
  })
}

const frame = ref<HTMLIFrameElement | null>(null)
const vid = ref<HTMLVideoElement | null>(null)
const origin = ref('')
const time = ref(0)
const active = computed(() => (vlog.value ? lineAt(vlog.value.lines, time.value) : -1))
const speed = ref(1)
const loop = ref(false)
const follow = ref(true)
const shown = ref<Set<number>>(new Set())
const picked = ref<ClipWord | null>(null)
const hit = ref<DictHit | null | 'busy' | 'error'>(null)
/** Почему не ответил большой словарь (текст ошибки сервера). */
const hitErr = ref('')
/** Открытая тема грамматики (по нажатию на чип под фразой). */
const gramOpen = ref('')
const gram = computed(() => (gramOpen.value ? gramCard(gramOpen.value) : null))
const GRAM_STATE: Record<string, string> = { ok: 'пройдено', ahead: 'ещё впереди', other: 'в курсе, но не отмечено пройденным' }
function pickGram(id: string) {
  picked.value = null
  gramOpen.value = gramOpen.value === id ? '' : id
}
/** Размер левой колонки (видео) на широком экране, % ширины: ползунок над видео. */
const VSIZE_DEFAULT = 46
/** ширина левой половины (видео) в процентах; тянется разделителем между половинами, как в карточке грамматики */
const vsize = usePersisted<number>('vlog_w', VSIZE_DEFAULT, v => typeof v === 'number' && v >= 25 && v <= 75)
const cols = ref<HTMLElement>()
const dragging = ref(false)
function splitDown(e: PointerEvent) {
  if (e.button !== 0) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
}
function splitMove(e: PointerEvent) {
  if (!dragging.value || !cols.value) return
  const r = cols.value.getBoundingClientRect()
  vsize.value = Math.round(Math.min(75, Math.max(25, ((e.clientX - r.left) / r.width) * 100)))
}
const splitUp = () => void (dragging.value = false)
function splitReset() {
  vsize.value = VSIZE_DEFAULT
  dragging.value = false
}
const hints = computed(() => (vlog.value ? vlog.value.lines.map(l => grammarHints(l.ko)) : []))

const SPEEDS = [0.5, 0.75, 1]
const src = computed(() => (vlog.value && origin.value && (fileState.value === 'none' || fileState.value === 'failed') ? `https://www.youtube-nocookie.com/embed/${vlog.value.yt}?enablejsapi=1&rel=0&playsinline=1&origin=${encodeURIComponent(origin.value)}` : ''))
function onTime() {
  const v = vid.value
  if (!v) return
  time.value = v.currentTime
  const l = vlog.value?.lines[active.value]
  if (loop.value && l && v.currentTime >= l.e) v.currentTime = l.s
}

function send(func: string, args: unknown[] = []) {
  frame.value?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), 'https://www.youtube-nocookie.com')
}
function listen() {
  frame.value?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), 'https://www.youtube-nocookie.com')
}
function onMessage(e: MessageEvent) {
  if (e.origin !== 'https://www.youtube-nocookie.com' || e.source !== frame.value?.contentWindow || typeof e.data !== 'string') return
  let d: { event?: string; info?: { currentTime?: number } }
  try {
    d = JSON.parse(e.data)
  } catch {
    return
  }
  const t = d.info?.currentTime
  if (d.event !== 'infoDelivery' || typeof t !== 'number') return
  heard = true
  applyStart()
  time.value = t
  const l = vlog.value?.lines[active.value]
  if (loop.value && l && t >= l.e) send('seekTo', [l.s, true])
}
/** Плеер ютуба может быть ещё не готов в момент загрузки окна: просим слать время, пока не пришёл первый ответ. */
let hello: ReturnType<typeof setInterval> | undefined
function startListening() {
  clearInterval(hello)
  heard = false
  listen()
  hello = setInterval(() => (heard ? clearInterval(hello) : listen()), 500)
}
let heard = false
/**
 * Пока ученик сам листает страницу (колесо, палец, клавиши), «следовать за видео» молчит 10 секунд: иначе при каждой смене фразы страница
 * уезжала обратно к звучащей, и листать вверх было нельзя. Нажатие на фразу снимает паузу.
 */
const PAUSE_MS = 10_000
let pausedUntil = 0
const userScrolled = () => void (pausedUntil = Date.now() + PAUSE_MS)
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
const onScrollKey = (e: KeyboardEvent) => {
  if (SCROLL_KEYS.has(e.key) && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) userScrolled()
}
onMounted(() => {
  origin.value = window.location.origin
  window.addEventListener('message', onMessage)
  window.addEventListener('wheel', userScrolled, { passive: true })
  window.addEventListener('touchmove', userScrolled, { passive: true })
  window.addEventListener('keydown', onScrollKey)
  takeStart()
  void loadFile()
  void loadWatched()
  void loadAttempts()
  sweepThumbs()
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  window.removeEventListener('wheel', userScrolled)
  window.removeEventListener('touchmove', userScrolled)
  window.removeEventListener('keydown', onScrollKey)
  clearInterval(hello)
})

function play(i: number) {
  const l = vlog.value?.lines[i]
  if (!l) return
  pausedUntil = 0
  if (useFile.value && vid.value) {
    vid.value.currentTime = l.s
    void vid.value.play().catch(() => undefined)
    return
  }
  send('seekTo', [l.s, true])
  send('playVideo')
}
function setSpeed(v: number) {
  speed.value = v
  if (vid.value) vid.value.playbackRate = v
  else send('setPlaybackRate', [v])
}
function toggle(i: number) {
  const s = new Set(shown.value)
  if (!s.delete(i)) s.add(i)
  shown.value = s
}
function showAll(on: boolean) {
  shown.value = new Set(on ? vlog.value?.lines.map((_, i) => i) : [])
}

const parsed = computed(() => (vlog.value ? vlog.value.lines.map(l => clipText(l.ko, k => progress.data.words[k]?.streak ?? 0)) : []))
const words = computed(() => {
  const m = new Map<string, number>()
  for (const r of parsed.value) for (const w of r.words) if (!w.own) m.set(w.key, (m.get(w.key) ?? 0) + 1)
  return m.size
})
const knownShare = computed(() => {
  let k = 0
  let n = 0
  for (const r of parsed.value) {
    k += r.known
    n += r.total
  }
  return n ? Math.round((k / n) * 100) : 0
})

/** Идущая фраза и её слова: заполняет свободное место слева на широком экране. */
const now = computed(() => {
  const l = vlog.value?.lines[active.value]
  return l ? { line: l, words: parsed.value[active.value]!.words } : null
})

const cache = new Map<string, DictHit | null>()
async function pick(w: ClipWord) {
  if (picked.value?.key === w.key) {
    picked.value = null
    return
  }
  gramOpen.value = ''
  picked.value = w
  hit.value = null
  if (w.own) return
  if (cache.has(w.key)) {
    hit.value = cache.get(w.key) ?? null
    return
  }
  hit.value = 'busy'
  try {
    let found: DictHit | null = null
    for (const q of w.queries) {
      found = pickDictHit(q, await searchDict(q, '', '', 0))
      if (found) break
    }
    cache.set(w.key, found)
    if (picked.value?.key === w.key) hit.value = found
  } catch (e) {
    if (picked.value?.key === w.key) {
      hitErr.value = e instanceof Error ? e.message : ''
      hit.value = 'error'
    }
  }
}

const list = ref<HTMLElement | null>(null)
watch(active, async i => {
  if (!follow.value || i < 0 || Date.now() < pausedUntil) return
  await nextTick()
  const el = list.value
  if (!el) return
  const line = el.querySelector<HTMLElement>(`[data-i="${i}"]`)
  if (!line) return
  // список листается сам (своя область прокрутки), страницу не трогаем: двигаем только его
  const box = el.getBoundingClientRect()
  const r = line.getBoundingClientRect()
  if (r.top >= box.top && r.bottom <= box.bottom) return
  el.scrollTo({ top: el.scrollTop + (r.top - box.top) - 8, behavior: 'smooth' })
})
watch(cur, () => {
  takeStart()
  void loadFile()
  time.value = 0
  shown.value = new Set()
  askAt.value = -1
  picked.value = null
  speed.value = 1
})
/** «записать» и «спросить» у фразы: общий код со страницей «Разбор влога» (`composables/useVlogPhrases.ts`). */
const { savedTitles, saveLine, askAt, ownerAsk, askContext } = useVlogPhrases(vlog, hints)
</script>

<template>
  <div class="wrap">
    <SectionHead v-if="!vlog" id="vlog" />

    <p v-if="!VLOGS.length" class="vl-empty">Влогов пока нет. Они появляются по одному: видео, текст по фразам и перевод.</p>

    <template v-else-if="!vlog">
      <div class="vl-tabs" role="tablist" aria-label="Автор влога">
        <button v-for="t in tabs" :key="t.slug" type="button" role="tab" class="vl-tab" :class="{ on: tab === t.slug }" :aria-selected="tab === t.slug" @click="tab = t.slug">{{ t.tab }} <small v-if="t.count">{{ t.count }}</small></button>
      </div>
      <VlogGrammarList v-if="tab === 'grammar'" />
      <VlogCoreWords v-else-if="tab === 'words'" />
      <VlogPhrasebook v-else-if="tab === 'phrases'" />
      <ClientOnly v-else-if="tab === 'map'"><VlogMap /></ClientOnly>
      <template v-else>
      <div class="vl-filters">
        <div class="vl-chips" role="group" aria-label="Порядок">
          <button type="button" class="vl-chip" :class="{ on: !sortBy }" @click="sortBy = ''">По номеру</button>
          <button type="button" class="vl-chip" :class="{ on: sortBy === 'known' }" @click="sortBy = 'known'">По доле знакомых слов</button>
        </div>
        <p v-if="sortBy === 'known'" class="vl-intro">В среднем у показанных влогов ты знаешь <b>{{ avgKnown }}%</b> слов текста: выше в списке те, что проще понять.</p>
        <div v-if="statusChips.length" class="vl-chips" role="group" aria-label="Статус">
          <button type="button" class="vl-chip" :class="{ on: !status }" @click="status = ''">Все</button>
          <button v-for="c in statusChips" :key="c.id" type="button" class="vl-chip" :class="{ on: status === c.id }" @click="status = status === c.id ? '' : c.id">{{ c.label }} <small>{{ c.count }}</small></button>
        </div>
        <div class="vl-chips" role="group" aria-label="Тема">
          <button type="button" class="vl-chip" :class="{ on: !topic }" @click="topic = ''">Все темы</button>
          <button v-for="c in topicChips" :key="c.id" type="button" class="vl-chip" :class="{ on: topic === c.id }" @click="topic = topic === c.id ? '' : c.id">{{ c.label }} <small>{{ c.count }}</small></button>
        </div>
        <div v-if="lengthChips.length > 1" class="vl-chips" role="group" aria-label="Длина">
          <button type="button" class="vl-chip" :class="{ on: !length }" @click="length = ''">Любая длина</button>
          <button v-for="c in lengthChips" :key="c.id" type="button" class="vl-chip" :class="{ on: length === c.id }" @click="length = length === c.id ? '' : c.id">{{ c.label }} <small>{{ c.count }}</small></button>
        </div>
      </div>
      <p v-if="tab === 'order'" class="vl-howto"><b>Как смотреть:</b> иди по номерам от 1 к {{ VLOG_ORDER_IDS.length }}, они расставлены от самого лёгкого к самому сложному по числу разных слов и скорости речи. Каждый влог: первый раз без текста, второй с текстом и переводом по нажатию, через день или два ещё раз. Не торопись к следующему, пока этот не стал в основном понятным.</p>
      <p class="vl-intro">Выбери видео: медленная речь, фразы со временем и перевод по нажатию. <template v-if="readyCount < shownItems.length">Готово {{ readyCount }} из {{ shownItems.length }}, остальные появятся по очереди.</template><template v-else>Всего {{ shownItems.length }} видео, у каждого текст и перевод.</template></p>
      <p v-if="!shownItems.length" class="vl-empty">С такой темой и длиной видео нет: сними один из фильтров.</p>
      <ul class="vl-list">
        <template v-for="it in shownItems" :key="it.yt">
        <li v-if="stageHeads.get(it.rank)" class="vl-stage-h"><b>Этап {{ stageHeads.get(it.rank)!.n }} · {{ stageHeads.get(it.rank)!.title }}</b><span>{{ stageHeads.get(it.rank)!.hint }}</span></li>
        <li class="vl-item" :class="{ soon: !it.vlog, seen: watched.includes(it.yt), next: nextYt === it.yt }" @mouseenter="hover(it.yt, $event)" @mouseleave="hoverYt = ''" @focusin="hover(it.yt, $event)" @focusout="hoverYt = ''">
          <button type="button" class="vl-card" :disabled="!it.vlog" @click="it.vlog && (cur = it.vlog.id)">
            <span v-if="it.rank < 999" class="vl-no">№{{ it.rank }}</span>
            <img v-if="(thumbStep[it.yt] ?? 0) < 2" :src="coverSrc(it.yt, thumbStep[it.yt] ?? 0)" alt="" loading="lazy" referrerpolicy="no-referrer" @error="failThumb(it.yt)" />
            <span v-else class="vl-ph" aria-hidden="true">우리말</span>
            <b>{{ it.title }}</b>
            <span>{{ it.vlog ? `${it.vlog.note} · ${it.vlog.lines.length} фраз` : 'скоро' }} <template v-if="it.dur"> · {{ dur(it.dur) }}</template></span>
          </button>
          <div v-if="hoverYt === it.yt" class="vl-pop" :class="popSide" role="tooltip">
            <template v-if="it.vlog">
              <p class="vl-pop-about">{{ infoOf(it.vlog).about }}</p>
              <p class="vl-pop-facts">{{ infoOf(it.vlog).phrases }} фраз · {{ dur(it.dur) }} · {{ infoOf(it.vlog).words }} разных слов · {{ infoOf(it.vlog).known }}% знакомых</p>
              <p v-if="infoOf(it.vlog).topics.length" class="vl-pop-row"><b>Грамматика:</b>
                <span v-for="t in infoOf(it.vlog).topics" :key="t.id" class="vl-pop-tag" :class="t.state">{{ t.ko }} <small>×{{ t.n }}</small></span>
              </p>
              <p v-if="infoOf(it.vlog).sample" class="vl-pop-ex"><span lang="ko">{{ infoOf(it.vlog).sample!.ko }}</span><br />{{ infoOf(it.vlog).sample!.ru }}</p>
            </template>
            <p v-else class="vl-pop-about">Текст и перевод ещё готовятся. <template v-if="it.dur">Видео: {{ dur(it.dur) }}. </template>Оригинальное название: {{ it.title }}</p>
          </div>
          <div v-if="canSave || (it.vlog && STUDY_VLOGS.includes(it.vlog.id))" class="vl-foot">
            <label v-if="canSave" class="vl-watch"><input type="checkbox" :checked="watched.includes(it.yt)" @change="toggleWatched(it.yt)" />просмотрено</label>
            <span v-if="nextYt === it.yt" class="vl-badge next">следующий</span>
            <span v-if="sortBy === 'known' && it.vlog" class="vl-badge">{{ knownPct(it) }}% знакомых</span>
            <span v-if="bestBy.get(it.yt)" class="vl-badge" :class="{ ok: passedSet.has(it.yt) }" :title="`Лучший результат теста: ${bestBy.get(it.yt)!.score} из ${bestBy.get(it.yt)!.total}`">{{ passedSet.has(it.yt) ? 'сдано' : 'тест' }} {{ pctOf(bestBy.get(it.yt)!) }}%</span>
            <NuxtLink v-if="it.vlog && STUDY_VLOGS.includes(it.vlog.id)" class="vl-study" :to="`/korean/vlog-study?v=${it.vlog.id}`">разбор</NuxtLink>
          </div>
        </li>
        </template>
      </ul>
      </template>
    </template>

    <template v-else>
      <header class="vl-top">
        <button type="button" class="vl-back" @click="cur = ''">← Все влоги</button>
        <h2 class="vl-title">{{ vlog.title }}</h2>
        <p class="vl-by">Автор: {{ vlog.channel }}.<template v-if="!useFile"> Видео показывается плеером ютуба.</template></p>
        <VlogNote :vlog="vlog" />
      </header>

      <div ref="cols" class="vl-cols" :class="{ dragging }" :style="{ '--vl-w': `${vsize}%` }">
       <div class="vl-left">
      <div class="vl-stage">
        <div class="vl-video">
          <video v-if="useFile" ref="vid" :src="fileUrl" controls playsinline preload="metadata" @timeupdate="onTime" @loadedmetadata="applyStart" @error="fileState = 'failed'" />
          <iframe v-if="src" ref="frame" :src="src" title="Видео" allow="encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" @load="startListening" />
        </div>
        <div class="vl-bar">
          <span class="vl-time">{{ clock(time) }}</span>
          <span class="vl-grp" role="group" aria-label="Скорость">
            <button v-for="s in SPEEDS" :key="s" type="button" :class="{ on: speed === s }" :aria-pressed="speed === s" @click="setSpeed(s)">{{ s === 1 ? 'обычно' : `×${s}` }}</button>
          </span>
          <button type="button" class="vl-tog" :class="{ on: loop }" :aria-pressed="loop" @click="loop = !loop">повтор фразы</button>
          <button type="button" class="vl-tog" :class="{ on: follow }" :aria-pressed="follow" @click="follow = !follow">следовать за видео</button>
          <button type="button" class="vl-tog" @click="showAll(shown.size < vlog.lines.length)">{{ shown.size < vlog.lines.length ? 'весь перевод' : 'скрыть перевод' }}</button>
        </div>
        <p class="vl-stat">Из твоего словаря {{ knownShare }}% слов текста, ещё {{ words }} разных слов вне него.</p>
      </div>
      <div v-if="now" class="vl-now" aria-live="off">
        <div class="vl-now-h">Сейчас звучит</div>
        <p class="vl-now-k" lang="ko">{{ now.line.ko }}</p>
        <p class="vl-now-r" lang="ru">{{ now.line.ru }}</p>
        <div v-if="hints[active]?.length" class="vl-gr">
          <button v-for="g in hints[active]" :key="g.id" type="button" class="vl-gr-chip" :class="{ on: gramOpen === g.id }" @click="pickGram(g.id)">{{ g.ko }}<small>{{ g.ru }}</small></button>
        </div>
        <ul class="vl-now-w">
          <li v-for="w in now.words" :key="w.key">
            <button type="button" class="cw" :class="[w.state, { on: picked?.key === w.key }]" lang="ko" @click="pick(w)">{{ w.core }}</button>
            <span>{{ w.own?.t ?? 'нажми: найду в словаре' }}</span>
          </li>
        </ul>
      </div>
      <div v-if="gram" class="vl-card-word vl-gram" role="status">
        <div class="vl-head">
          <h3 lang="ko">{{ gram.ko }}</h3>
          <span class="vl-chip" :class="{ dict: gram.state !== 'ok' }">{{ GRAM_STATE[gram.state] }}</span>
        </div>
        <p class="vl-tr">{{ gram.ru }}<template v-if="gram.d">: {{ gram.d }}</template></p>
        <p v-if="gram.state === 'ahead'" class="vl-tr vl-dim">Эту тему ты ещё не проходил(а): здесь только название, объяснения пока нет.</p>
        <p v-if="gram.formula" class="vl-formula" lang="ko">{{ gram.formula }}</p>
        <p v-if="gram.example" class="vl-ex"><span lang="ko">{{ gram.example.ko }}</span><br />{{ gram.example.ru }}</p>
      </div>
      <div v-if="picked" class="vl-card-word" role="status">
        <div class="vl-head">
          <h3 lang="ko">{{ picked.own?.k ?? (hit && typeof hit === 'object' ? hit.word : picked.core) }}</h3>
          <span v-if="picked.own" class="vl-chip">в твоём словаре</span>
          <span v-else-if="hit && typeof hit === 'object'" class="vl-chip dict">только в большом словаре</span>
        </div>
        <p v-if="picked.own" class="vl-tr">{{ picked.own.t }}</p>
        <p v-else-if="hit === 'busy'" class="vl-tr">Ищу в словаре…</p>
        <p v-else-if="hit === 'error'" class="vl-tr">Большой словарь не ответил<template v-if="hitErr"> ({{ hitErr }})</template>. Слова из твоего словаря работают; для остальных нажми ещё раз позже.</p>
        <p v-else-if="hit" class="vl-tr">{{ hit.ru }}</p>
        <p v-else class="vl-tr">Слова нет ни в твоём словаре, ни в большом. Возможно, это имя или редкая форма.</p>
        <WordInVlogs v-if="canSave" :word-key="picked.key" :exclude="vlog.id" />
      </div>
       </div>

      <div class="gsplit vl-split" role="separator" aria-orientation="vertical" title="Потяни, чтобы изменить ширину. Двойной щелчок возвращает как было" @pointerdown="splitDown" @pointermove="splitMove" @pointerup="splitUp" @pointercancel="splitUp" @dblclick="splitReset"><i></i></div>
      <div ref="list" class="vl-lines" lang="ko">
        <div v-for="(l, i) in vlog.lines" :key="i" :data-i="i" class="vl-line" :class="{ now: i === active }">
          <button type="button" class="vl-at" :aria-label="`Включить с ${clock(l.s)}`" @click="play(i)">{{ clock(l.s) }}</button>
          <div class="vl-body">
            <div class="vl-ko">
              <template v-for="(p, j) in parsed[i]!.parts" :key="j">
                <button v-if="p.word" type="button" class="cw" :class="[p.word.state, { on: picked?.key === p.word.key }]" :aria-pressed="picked?.key === p.word.key" @click="pick(p.word)">{{ p.text }}</button>
                <template v-else>{{ p.text }}</template>
              </template>
            </div>
            <p v-if="shown.has(i)" class="vl-ru" lang="ru">{{ l.ru }}</p>
            <div v-if="hints[i]?.length" class="vl-gr" aria-label="Грамматика во фразе">
              <button v-for="g in hints[i]" :key="g.id" type="button" class="vl-gr-chip" :class="{ on: gramOpen === g.id }" :aria-pressed="gramOpen === g.id" @click="pickGram(g.id)">{{ g.ko }}</button>
            </div>
            <button type="button" class="vl-ru-btn" :aria-expanded="shown.has(i)" @click="toggle(i)">{{ shown.has(i) ? 'скрыть перевод' : 'перевод' }}</button>
            <button v-if="ownerAsk" type="button" class="vl-ru-btn" :class="{ on: askAt === i }" :aria-expanded="askAt === i" @click="askAt = askAt === i ? -1 : i">спросить</button>
            <button v-if="canSave" type="button" class="vl-ru-btn" :disabled="savedTitles.has(noteTitle(l.ko))" @click="saveLine(i)">{{ savedTitles.has(noteTitle(l.ko)) ? 'записано' : 'записать' }}</button>
            <div v-if="askAt === i" class="vl-ask"><AskAi :key="`${vlog.id}-${i}`" open :context="() => askContext(i)" mode="vlog" :quick="ASK_QUICK" placeholder="Спроси про эту фразу…" /></div>
          </div>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vl-empty, .vl-intro, .vl-by, .vl-stat { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.vl-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.vl-tab { border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); padding: 7px 14px; font: inherit; font-size: 14px; cursor: pointer; }
.vl-tab small { color: var(--muted); margin-left: 4px; }
.vl-tab.on { border-color: var(--ink); font-weight: 700; }
.vl-filters { display: grid; gap: 8px; margin-top: 12px; }
.vl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vl-chip { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 4px 11px; font: inherit; font-size: 13px; cursor: pointer; }
.vl-chip small { margin-left: 3px; }
.vl-chip.on { background: var(--surface); border-color: var(--ink); color: var(--ink); font-weight: 600; }
.vl-list { list-style: none; margin: 16px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
/* колонка minmax(0, 1fr): без неё картинка с собственной шириной (320 px) растягивала первую карточку за ячейку сетки */
.vl-item { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 1fr auto; gap: 6px; }
.vl-pop { position: absolute; z-index: 30; top: 0; width: 310px; box-sizing: border-box; padding: 14px 16px; border: 1px solid rgba(143, 124, 240, .5); border-radius: 16px; background: #fff; box-shadow: 0 14px 40px rgba(60, 40, 120, .28); pointer-events: none; font-size: 13.5px; line-height: 1.5; color: #2b2250; animation: vlpop .15s ease-out; }
.vl-pop.right { left: calc(100% + 10px); }
.vl-pop.left { right: calc(100% + 10px); }
:global(html[data-theme='dark']) .vl-pop { background: #261d3f; border-color: rgba(255, 190, 220, .35); color: #f4eeff; box-shadow: 0 14px 40px rgba(0, 0, 0, .55); }
.vl-pop p { margin: 0 0 6px; }
.vl-pop p:last-child { margin-bottom: 0; }
.vl-pop-facts { color: #5d5388; }
:global(html[data-theme='dark']) .vl-pop-facts { color: #cbbfe8; }
.vl-pop-tag { display: inline-block; margin: 0 4px 4px 0; padding: 1px 8px; border: 1px dashed #8f7cf0; border-radius: 999px; }
.vl-pop-tag.ok { border-style: solid; border-color: #2e9e6b; background: rgba(46, 158, 107, .14); }
.vl-pop-tag small { color: #5d5388; }
.vl-pop-ex { color: #5d5388; font-size: 13px; }
:global(html[data-theme='dark']) .vl-pop-tag small, :global(html[data-theme='dark']) .vl-pop-ex { color: #cbbfe8; }
@media (max-width: 760px) { .vl-pop { display: none; } }
@keyframes vlpop { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .vl-pop { animation: none; } }
.vl-item.soon .vl-card { opacity: .6; cursor: default; }
.vl-item.seen .vl-card { border-color: var(--ok); }
.vl-badge { padding: 1px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; color: var(--muted); white-space: nowrap; }
.vl-badge.ok { border-color: var(--ok); background: var(--ok-bg); color: var(--ink); }
.vl-badge.next { border-color: var(--accent); color: var(--accent); font-weight: 700; }
.vl-item.next .vl-card { border-color: var(--accent); }
.vl-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.vl-study { margin-left: auto; padding: 3px 12px; border: 1px solid var(--accent); border-radius: 999px; color: var(--accent); font-size: 13px; text-decoration: none; }
.vl-watch { display: flex; align-items: center; gap: 8px; padding: 0 6px; color: var(--muted); font-size: 13.5px; cursor: pointer; }
.vl-watch input { appearance: none; -webkit-appearance: none; flex: none; width: 20px; height: 20px; margin: 0; border: 2px solid var(--line); border-radius: 6px; background: var(--surface); cursor: pointer; display: grid; place-content: center; }
.vl-watch input::after { content: ''; width: 10px; height: 6px; border: solid #fff; border-width: 0 0 2.5px 2.5px; transform: rotate(-45deg) translate(1px, -1px); opacity: 0; }
.vl-watch input:checked { background: var(--ok); border-color: var(--ok); }
.vl-watch input:checked::after { opacity: 1; }
.vl-watch input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.vl-howto { margin: 12px 0 0; padding: 10px 14px; border: 1px solid var(--line-soft); border-radius: 14px; background: var(--surface); color: var(--ink); font-size: 14.5px; line-height: 1.5; }
.vl-stage-h { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin-top: 10px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.vl-stage-h b { font-size: 16px; }
.vl-stage-h span { color: var(--muted); font-size: 13.5px; }
/* «.vl-card span» (приглушённый цвет, min-height и ограничение строк) сильнее одиночного класса: номер перебивается тем же селектором через .vl-card */
.vl-card .vl-no { position: absolute; top: 16px; left: 16px; z-index: 1; display: block; min-height: 0; overflow: visible; padding: 2px 9px; border-radius: 999px; background: rgba(0, 0, 0, .62); color: #fff; font-size: 12.5px; font-weight: 700; line-height: 1.4; }
/* картинки ютуба могут не грузиться (сеть планшета): вместо белого фона пастельная плашка */
.vl-card .vl-ph { display: grid; min-height: 0; overflow: visible; place-items: center; width: 100%; aspect-ratio: 16 / 9; border-radius: 12px; background: linear-gradient(135deg, #fbd9ea, #cfe4ff); color: rgba(255, 255, 255, .85); font-size: 28px; font-weight: 700; letter-spacing: .08em; }
:global(html[data-theme='dark']) .vl-card .vl-ph { background: linear-gradient(135deg, #4a2c55, #2c3c66); color: rgba(255, 255, 255, .5); }
.vl-card { position: relative; box-sizing: border-box; width: 100%; min-width: 0; height: 100%; align-content: start; text-align: left; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); padding: 10px; font: inherit; color: var(--ink); cursor: pointer; display: grid; gap: 6px; }
.vl-card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 12px; }
.vl-card b { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; min-height: 2.7em; line-height: 1.35; font-size: 15px; }
.vl-card span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; min-height: 2.7em; line-height: 1.35; color: var(--muted); font-size: 13px; }
.vl-top { margin-bottom: 6px; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
.vl-back { margin-top: 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 14px; cursor: pointer; padding: 0; }
.vl-title { margin: 8px 0 0; font-size: 22px; }
/* Список фраз листается отдельно от страницы: у него своя область прокрутки, чтобы до верха страницы не приходилось пролистывать весь список */
.vl-cols { display: flex; flex-direction: column; height: calc(100dvh - 210px); min-height: 360px; }
.vl-now { display: none; margin-top: 14px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.vl-now-h { color: var(--muted); font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; }
.vl-now-k { margin: 6px 0 0; font-size: 20px; line-height: 1.6; }
.vl-now-r { margin: 4px 0 0; font-size: 15px; line-height: 1.5; color: var(--muted); }
.vl-gr { order: 1; display: flex; flex-wrap: wrap; gap: 6px; }
.vl-gr-chip { display: inline-flex; align-items: baseline; gap: 6px; border: 1px dashed var(--accent); border-radius: 999px; background: transparent; color: var(--ink); padding: 3px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.vl-gr-chip small { color: var(--muted); font-size: 12px; }
.vl-gr-chip.on { background: rgba(150, 190, 255, .22); border-style: solid; }
.vl-formula { margin: 8px 0 0; padding: 8px 12px; border-radius: 12px; background: var(--gold-soft); font-size: 15px; }
.vl-ex { margin: 8px 0 0; font-size: 15px; line-height: 1.6; }
.vl-dim { color: var(--muted); font-size: 14px; }
.vl-split { display: none; }
.vl-now-w { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.vl-now-w li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 14.5px; }
.vl-now-w li span { color: var(--muted); }
.vl-left { display: contents; }
.vl-stage { position: static; flex: none; padding: 10px 0 6px; }
/* меню свёрнуто: кнопка «☰ Меню» стоит поверх страницы слева сверху, видео уезжает ниже неё */
@media (min-width: 861px) { :global(.study-shell.focus) .vl-stage { top: 56px; } }
.vl-video { aspect-ratio: 16 / 9; width: min(100%, calc(34vh * 16 / 9)); border-radius: 16px; overflow: hidden; background: #000; margin-inline: auto; }
.vl-video iframe, .vl-video video { width: 100%; height: 100%; border: 0; display: block; background: #000; }
.vl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.vl-time { min-width: 44px; color: var(--muted); font-variant-numeric: tabular-nums; }
.vl-grp { display: inline-flex; gap: 4px; }
.vl-grp button, .vl-tog, .vl-ru-btn { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; }
.vl-grp button.on, .vl-tog.on { background: var(--gold-soft); color: var(--ink); border-color: var(--gold); }
.vl-stat { margin-top: 6px; font-size: 13px; }
.vl-lines { margin-top: 10px; display: grid; gap: 6px; align-content: start; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 4px; }
.vl-line { scroll-margin-top: var(--vl-off, 220px); display: grid; grid-template-columns: 52px 1fr; gap: 8px; padding: 10px 12px; border: 1px solid var(--line-soft); border-radius: 16px; background: var(--surface); transition: background .2s, border-color .2s; }
.vl-line.now { border-color: var(--accent); background: rgba(150, 190, 255, .14); }
.vl-at { border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 13px; text-align: left; cursor: pointer; padding: 4px 0; font-variant-numeric: tabular-nums; }
.vl-body { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; }
.vl-ko { order: 0; max-width: 100%; font-size: 18px; line-height: 2; overflow-wrap: anywhere; }
.vl-ru-btn { order: 2; padding: 3px 12px; font-size: 12.5px; }
.vl-ru-btn.on { border-color: var(--ink); color: var(--ink); }
.vl-ask { order: 4; flex: 1 1 100%; min-width: 0; }
.vl-ru { order: 3; flex: 1 0 100%; box-sizing: border-box; margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--gold-soft); font-size: 15px; line-height: 1.5; }
.cw { display: inline; border: 0; border-bottom: 2px solid transparent; border-radius: 8px; background: transparent; color: var(--ink); padding: 1px 3px; font: inherit; cursor: pointer; }
.cw.learned { background: var(--ok-bg); border-bottom-color: var(--ok); }
.cw.learning, .cw.new { background: var(--gold-soft); border-bottom-color: var(--gold); }
.cw.unknown { border-bottom: 2px dashed var(--accent); }
.cw.on { outline: 2px solid var(--accent); outline-offset: 1px; }
.vl-card-word { position: sticky; bottom: 10px; margin-top: 14px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); box-shadow: 0 6px 24px rgba(0, 0, 0, .08); }
.vl-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; }
.vl-head h3 { margin: 0; font-size: 21px; }
.vl-chip { border-radius: 999px; padding: 2px 10px; font-size: 12.5px; background: var(--gold-soft); }
.vl-chip.dict { background: rgba(150, 190, 255, .22); }
.vl-tr { margin: 8px 0 0; font-size: 16px; line-height: 1.5; }
/* Широкий экран: слева видео и карточка слова не уезжают, справа список фраз */
@media (min-width: 1100px) {
  .vl-cols { display: grid; height: auto; min-height: 0; grid-template-columns: minmax(340px, var(--vl-w, 46%)) 14px minmax(0, 1fr); gap: 0; align-items: start; }
  .vl-cols.dragging { user-select: none; cursor: col-resize; }
  .vl-cols.dragging .vl-video { pointer-events: none; }
  .vl-split { display: flex; position: sticky; top: 8px; height: min(70vh, 520px); align-items: center; justify-content: center; cursor: col-resize; touch-action: none; border-left: 1px solid var(--line); }
  .vl-split i { width: 5px; height: 56px; border-radius: 3px; background: var(--line); transition: background .15s, height .15s; }
  .vl-split:hover i, .vl-cols.dragging .vl-split i { background: var(--gold, var(--accent)); height: 84px; }
  .vl-left { padding-right: 14px; }
  .vl-lines { position: sticky; top: 8px; max-height: calc(100vh - 90px); margin-top: 0; padding-left: 14px; padding-right: 6px; }
  :global(.study-shell.focus) .vl-lines { top: 62px; max-height: calc(100vh - 76px); }
  .vl-left { display: block; position: sticky; top: 8px; }
  .vl-stage { position: static; padding-top: 0; }
  :global(.study-shell.focus) .vl-left, :global(.study-shell.focus) .vl-split { top: 62px; }
  .vl-video { width: 100%; }
  .vl-card-word { position: static; }
  .vl-now { display: block; }
}
@media (max-width: 520px) { .vl-line { grid-template-columns: 1fr; gap: 0; } .vl-ko { font-size: 17px; } }
</style>
