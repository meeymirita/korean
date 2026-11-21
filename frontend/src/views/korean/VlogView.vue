<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { clipText, pickDictHit, type ClipWord } from '@/data/korean/clip'
import { VLOGS, lineAt } from '@/data/korean/vlogs'
import { searchDict, type DictHit } from '@/lib/dictApi'
import { fetchT } from '@/lib/http'
import { useQueryParam } from '@/composables/useQueryParam'
import { useProgressStore } from '@/stores/progress'

/**
 * «Влог»: видео и текст по фразам. Идущая фраза подсвечена, нажатие на фразу перематывает, перевод открывается нажатием,
 * слова подсвечены как во «Вырезке». Если видео скачано (`vlog.file`), играет своё `<video>` по подписанной ссылке сервера;
 * иначе встроен плеер ютуба (youtube-nocookie), им управляем сообщениями (postMessage), скрипт ютуба не подключаем.
 */
const progress = useProgressStore()
const ids = VLOGS.map(v => v.id)
const cur = useQueryParam('v', '', ids)
const vlog = computed(() => VLOGS.find(v => v.id === cur.value))

/** Свой файл видео: 'none' (нет в данных), 'loading', 'ok' (есть ссылка), 'failed' (нет на сервере: играет ютуб). */
const fileState = ref<'none' | 'loading' | 'ok' | 'failed'>('none')
const fileUrl = ref('')
const useFile = computed(() => fileState.value === 'ok')
/** Подписанная ссылка на свой файл видео; нет файла или сервер не ответил: остаётся плеер ютуба. */
async function loadFile() {
  const name = vlog.value?.file
  fileUrl.value = ''
  fileState.value = name ? 'loading' : 'none'
  if (!name) return
  try {
    const res = await fetchT(`/api/video/vlog/${name}/url`, { headers: { Authorization: `Bearer ${progress.bearer}` } })
    if (vlog.value?.file !== name) return
    if (res.ok) {
      fileUrl.value = ((await res.json()) as { url: string }).url
      fileState.value = 'ok'
    } else fileState.value = 'failed'
  } catch {
    fileState.value = 'failed'
  }
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
onMounted(() => {
  origin.value = window.location.origin
  window.addEventListener('message', onMessage)
  void loadFile()
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  clearInterval(hello)
})

function play(i: number) {
  const l = vlog.value?.lines[i]
  if (!l) return
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
  } catch {
    if (picked.value?.key === w.key) hit.value = 'error'
  }
}

const list = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
watch(active, async i => {
  if (!follow.value || i < 0) return
  await nextTick()
  const el = list.value
  if (!el) return
  const wide = window.matchMedia('(min-width: 1100px)').matches
  el.style.setProperty('--vl-off', wide ? '90px' : `${(stage.value?.offsetHeight ?? 200) + 12}px`)
  el.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
})
watch(cur, () => {
  void loadFile()
  time.value = 0
  shown.value = new Set()
  picked.value = null
  speed.value = 1
})
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
</script>

<template>
  <div class="wrap">
    <SectionHead id="vlog" />

    <p v-if="!VLOGS.length" class="vl-empty">Влогов пока нет. Они появляются по одному: видео, текст по фразам и перевод.</p>

    <template v-else-if="!vlog">
      <p class="vl-intro">Выбери видео: медленная речь, фразы со временем и перевод по нажатию.</p>
      <ul class="vl-list">
        <li v-for="v in VLOGS" :key="v.id">
          <button type="button" class="vl-card" @click="cur = v.id">
            <img :src="`https://i.ytimg.com/vi/${v.yt}/mqdefault.jpg`" alt="" loading="lazy" referrerpolicy="no-referrer" />
            <b>{{ v.title }}</b>
            <span>{{ v.note }} · {{ v.lines.length }} фраз</span>
          </button>
        </li>
      </ul>
    </template>

    <template v-else>
      <button type="button" class="vl-back" @click="cur = ''">← Все влоги</button>
      <h2 class="vl-title">{{ vlog.title }}</h2>
      <p class="vl-by">Автор: {{ vlog.channel }}.<template v-if="!useFile"> Видео показывается плеером ютуба.</template></p>

      <div class="vl-cols">
       <div class="vl-left">
      <div ref="stage" class="vl-stage">
        <div class="vl-video">
          <video v-if="useFile" ref="vid" :src="fileUrl" controls playsinline preload="metadata" @timeupdate="onTime" @error="fileState = 'failed'" />
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
        <ul class="vl-now-w">
          <li v-for="w in now.words" :key="w.key">
            <button type="button" class="cw" :class="[w.state, { on: picked?.key === w.key }]" lang="ko" @click="pick(w)">{{ w.core }}</button>
            <span>{{ w.own?.t ?? 'нажми: найду в словаре' }}</span>
          </li>
        </ul>
      </div>
      <div v-if="picked" class="vl-card-word" role="status">
        <div class="vl-head">
          <h3 lang="ko">{{ picked.own?.k ?? (hit && typeof hit === 'object' ? hit.word : picked.core) }}</h3>
          <span v-if="picked.own" class="vl-chip">в твоём словаре</span>
          <span v-else-if="hit && typeof hit === 'object'" class="vl-chip dict">только в большом словаре</span>
        </div>
        <p v-if="picked.own" class="vl-tr">{{ picked.own.t }}</p>
        <p v-else-if="hit === 'busy'" class="vl-tr">Ищу в словаре…</p>
        <p v-else-if="hit === 'error'" class="vl-tr">Словарь недоступен, нажми на слово ещё раз.</p>
        <p v-else-if="hit" class="vl-tr">{{ hit.ru }}</p>
        <p v-else class="vl-tr">Слова нет ни в твоём словаре, ни в большом. Возможно, это имя или редкая форма.</p>
      </div>
       </div>

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
            <button type="button" class="vl-ru-btn" :aria-expanded="shown.has(i)" @click="toggle(i)">{{ shown.has(i) ? 'скрыть перевод' : 'перевод' }}</button>
          </div>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vl-empty, .vl-intro, .vl-by, .vl-stat { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.vl-list { list-style: none; margin: 16px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.vl-card { width: 100%; text-align: left; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); padding: 10px; font: inherit; color: var(--ink); cursor: pointer; display: grid; gap: 6px; }
.vl-card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 12px; }
.vl-card span { color: var(--muted); font-size: 13px; }
.vl-back { margin-top: 14px; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 14px; cursor: pointer; padding: 0; }
.vl-title { margin: 8px 0 0; font-size: 22px; }
.vl-cols { display: block; }
.vl-now { display: none; margin-top: 14px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.vl-now-h { color: var(--muted); font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; }
.vl-now-k { margin: 6px 0 0; font-size: 20px; line-height: 1.6; }
.vl-now-r { margin: 4px 0 0; font-size: 15px; line-height: 1.5; color: var(--muted); }
.vl-now-w { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
.vl-now-w li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; font-size: 14.5px; }
.vl-now-w li span { color: var(--muted); }
.vl-left { display: contents; }
.vl-stage { position: sticky; top: 0; z-index: 5; background: var(--bg, var(--surface)); padding: 10px 0 6px; }
.vl-video { aspect-ratio: 16 / 9; width: min(100%, calc(34vh * 16 / 9)); border-radius: 16px; overflow: hidden; background: #000; margin-inline: auto; }
.vl-video iframe, .vl-video video { width: 100%; height: 100%; border: 0; display: block; background: #000; }
.vl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.vl-time { min-width: 44px; color: var(--muted); font-variant-numeric: tabular-nums; }
.vl-grp { display: inline-flex; gap: 4px; }
.vl-grp button, .vl-tog, .vl-ru-btn { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; }
.vl-grp button.on, .vl-tog.on { background: var(--gold-soft); color: var(--ink); border-color: var(--gold); }
.vl-stat { margin-top: 6px; font-size: 13px; }
.vl-lines { margin-top: 10px; display: grid; gap: 6px; }
.vl-line { scroll-margin-top: var(--vl-off, 220px); display: grid; grid-template-columns: 52px 1fr; gap: 8px; padding: 10px 12px; border: 1px solid var(--line-soft); border-radius: 16px; background: var(--surface); transition: background .2s, border-color .2s; }
.vl-line.now { border-color: var(--accent); background: rgba(150, 190, 255, .14); }
.vl-at { border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 13px; text-align: left; cursor: pointer; padding: 4px 0; font-variant-numeric: tabular-nums; }
.vl-body { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
.vl-ko { font-size: 18px; line-height: 2; overflow-wrap: anywhere; }
.vl-ru-btn { padding: 3px 12px; font-size: 12.5px; }
.vl-ru { margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--gold-soft); font-size: 15px; line-height: 1.5; }
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
  .vl-cols { display: grid; grid-template-columns: minmax(340px, 46%) 1fr; gap: 18px; align-items: start; }
  .vl-left { display: block; position: sticky; top: 8px; }
  .vl-stage { position: static; padding-top: 0; }
  .vl-video { width: 100%; }
  .vl-card-word { position: static; }
  .vl-now { display: block; }
}
@media (max-width: 520px) { .vl-line { grid-template-columns: 1fr; gap: 0; } .vl-ko { font-size: 17px; } }
</style>
