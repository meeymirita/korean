<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import { LEVELS, searchDict, type DictHit, type DictSearch } from '@/lib/dictApi'
import { useDictRecent, type DictRecent } from '@/composables/useDictRecent'
import { useProgressStore } from '@/stores/progress'
import { useNewWordsStore } from '@/stores/newWords'
import { useToastStore } from '@/stores/toast'
import { errText } from '@/lib/http'

const route = useRoute()
const router = useRouter()
const progress = useProgressStore()
const newWords = useNewWordsStore()
const toast = useToastStore()

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const q = ref(str(route.query.q))
const level = ref(str(route.query.level))
const pos = ref(str(route.query.pos))
const focused = ref(false)
const input = ref<HTMLInputElement | null>(null)

const data = ref<DictSearch | null>(null)
const loading = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

const active = computed(() => focused.value || q.value.trim() !== '')
const hasQuery = computed(() => q.value.trim() !== '')

function syncUrl() {
  const query: Record<string, string> = {}
  if (q.value.trim()) query.q = q.value.trim()
  if (level.value) query.level = level.value
  if (pos.value) query.pos = pos.value
  void router.replace({ query })
}

async function run(more = false) {
  const my = ++seq
  const text = q.value.trim()
  if (!text) { data.value = null; error.value = ''; loading.value = false; return }
  loading.value = true
  try {
    const offset = more && data.value ? data.value.hits.length : 0
    const r = await searchDict(text, level.value, pos.value, offset)
    if (my !== seq) return // пришёл ответ на старый запрос
    data.value = more && data.value ? { ...r, hits: [...data.value.hits, ...r.hits] } : r
    error.value = ''
    clearTimeout(rememberTimer)
    if (!more) rememberTimer = setTimeout(remember, 1500) // не пишем на каждой букве: только запрос, на котором человек остановился
  } catch (e) {
    if (my !== seq) return
    error.value = errText(e)
  } finally {
    if (my === seq) loading.value = false
  }
}

function submit() {
  schedule()
  clearTimeout(rememberTimer)
  rememberTimer = setTimeout(remember, 700)
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => { syncUrl(); void run() }, 260)
}

watch(q, schedule)
function setLevel(l: string) { level.value = level.value === l ? '' : l; syncUrl(); void run() }
function setPos(p: string) { pos.value = pos.value === p ? '' : p; syncUrl(); void run() }

/** Клик по пустому месту (по бокам, где нет поиска, карточек, шапки и подписи): поиск закрывается, остаётся заставка. */
function closeOnOutside(e: MouseEvent) {
  if (!hasQuery.value) return
  const t = e.target as HTMLElement | null
  if (!t || t.closest('.search, .res, .top, .src, .hero, .recent')) return
  if (window.getSelection()?.toString()) return // человек выделял текст и отпустил кнопку снаружи
  remember()
  clearTimeout(timer)
  clearTimeout(rememberTimer)
  seq++
  q.value = ''
  level.value = ''
  pos.value = ''
  data.value = null
  error.value = ''
  loading.value = false
  input.value?.blur()
  syncUrl()
}

onMounted(() => {
  history.load()
  if (hasQuery.value) void run()
  document.addEventListener('click', closeOnOutside)
})
onBeforeUnmount(() => { remember(); clearTimeout(timer); clearTimeout(rememberTimer); seq++; if (import.meta.client) document.removeEventListener('click', closeOnOutside) })

const posChips = computed(() => Object.entries(data.value?.facets.pos ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8))
const canMore = computed(() => !!data.value && data.value.hits.length < data.value.total && data.value.hits.length < 2000)
/** Перевод: слова. Если у значения только описание без перевода, описание идёт в «Значение», а «Перевод» не показываем. */
const ruList = (s: { ru: { t: string; d: string }[] }) => s.ru.map(r => r.t).filter(Boolean).join('; ')
const defOf = (s: { ru: { t: string; d: string }[] }) => (ruList(s) ? s.ru[0]?.d ?? '' : s.ru.map(r => r.d).filter(Boolean).join(' '))

/* ---------- «Недавно искал»: в этом браузере (у каждого посетителя своё), см. composables/useDictRecent.ts ---------- */
const history = useDictRecent()
const recent = history.items
let rememberTimer: ReturnType<typeof setTimeout> | undefined

function remember() {
  const d = data.value
  const text = q.value.trim()
  if (!d || !d.hits.length || !text || d.query !== text) return
  const h = d.hits[0]!
  const ru = h.senses[0]?.ru.map(r => r.t).filter(Boolean).join('; ') || h.ru
  history.add({ q: text, word: h.word, ru: ru.split('; ').slice(0, 2).join('; ').slice(0, 60), pos: h.pos })
}
/** Открыли слово из результатов: запоминаем именно его, а не первое найденное. */
function openWord(h: DictHit) {
  const ru = h.senses[0]?.ru.map(r => r.t).filter(Boolean).join('; ') || h.ru
  history.add({ q: h.word, word: h.word, ru: ru.split('; ').slice(0, 2).join('; ').slice(0, 60), pos: h.pos })
}
const clearRecent = () => history.clear()
function useRecent(r: DictRecent) {
  q.value = r.q
  input.value?.focus()
}

const saved = ref(new Set<string>())
async function save(h: { id: string; word: string; pron: string; ru: string }) {
  try {
    await newWords.add({ ko: h.word.slice(0, 60), reading: h.pron.slice(0, 80), ru: h.ru.split('; ').slice(0, 3).join('; ').slice(0, 120), example: '', note: 'Из большого словаря' })
    saved.value = new Set([...saved.value, h.id])
    toast.ok(`«${h.word}» записано во входящие`)
  } catch (e) {
    toast.error(errText(e))
  }
}
</script>

<template>
  <DictShell>
    <div class="dict" :class="{ on: active }">
      <div class="hero">
        <h1>Большой словарь</h1>
        <p class="lead">Больше пятидесяти тысяч слов с русским переводом. Ищи по-корейски или по-русски, можно и в спряжённой форме: 먹었어요.</p>
      </div>

      <form class="search" :class="{ wide: active }" role="search" @submit.prevent="submit">
        <input
          ref="input"
          v-model="q"
          type="search"
          lang="ko"
          autocomplete="off"
          spellcheck="false"
          placeholder="Найти слово: 학교, школа, 먹었어요…"
          aria-label="Поиск по большому словарю"
          @focus="focused = true"
          @blur="focused = false"
          @keydown.esc="input?.blur()"
        >
      </form>

      <section v-if="!hasQuery && recent.length" class="recent" aria-label="Недавно искал">
        <div class="rhead"><span>Недавно искал</span><button type="button" class="rclear" @click="clearRecent">очистить</button></div>
        <div class="rlist">
          <button v-for="r in recent" :key="r.q" type="button" class="rcard" @click="useRecent(r)">
            <b lang="ko">{{ r.word }}</b>
            <span>{{ r.ru }}</span>
          </button>
        </div>
      </section>

      <section v-if="hasQuery" class="res" aria-live="polite">
        <div v-if="data" class="filters">
          <button v-for="l in LEVELS" :key="l" type="button" class="fchip" :class="{ cur: level === l }" :disabled="!data.facets.level[l] && level !== l" @click="setLevel(l)">
            {{ l === 'нет' ? 'без уровня' : l }} <b>{{ data.facets.level[l] ?? 0 }}</b>
          </button>
          <span class="sep"></span>
          <button v-for="[p, n] in posChips" :key="p" type="button" class="fchip alt" :class="{ cur: pos === p }" @click="setPos(p)">{{ p }} <b>{{ n }}</b></button>
        </div>

        <p v-if="error" class="none">{{ error }}</p>
        <p v-else-if="!data && loading" class="count">Ищу…</p>
        <p v-else-if="data && !data.hits.length" class="none">Ничего не нашлось. Попробуй начало слова, другой перевод или сними фильтры.</p>
        <template v-else-if="data">
          <p class="count">Найдено: {{ data.total >= 2000 ? 'больше 2000' : data.total }}<span v-if="loading"> · обновляю…</span></p>
          <p v-if="data.via" class="via">
            Это спряжённая форма. Показываю начальную форму: <b lang="ko">{{ data.via.forms.join(', ') }}</b>
          </p>
          <article v-for="e in data.hits" :key="e.id" class="card">
            <RouterLink :to="`/dict/${encodeURIComponent(e.word)}`" class="cardlink" :aria-label="`Открыть слово ${e.word}`" @click="openWord(e)"></RouterLink>
            <header class="ch">
              <h3 lang="ko">{{ e.word }}</h3>
              <span v-if="e.hom" class="hom">№{{ e.hom }}</span>
              <span v-if="e.pron" class="pron">[{{ e.pron }}]</span>
              <span class="chip">{{ e.pos }}</span>
              <span class="chip lvl">{{ e.level === 'нет' ? 'без уровня' : e.level }}</span>
            </header>
            <div v-for="(s, i) in e.senses" :key="i" class="sense">
              <p v-if="e.senses.length > 1 || e.moreSenses" class="sn"><span>{{ i + 1 }}</span>Значение {{ i + 1 }}</p>
              <dl class="kv">
                <template v-if="ruList(s)"><dt>Перевод</dt><dd class="ru">{{ ruList(s) }}</dd></template>
                <template v-if="defOf(s)"><dt>Значение</dt><dd>{{ defOf(s) }}</dd></template>
                <template v-if="s.ko"><dt>Определение</dt><dd lang="ko">{{ s.ko }}</dd></template>
                <template v-if="s.sent[0]"><dt>Пример</dt><dd class="exv"><span lang="ko">{{ s.sent[0] }}</span></dd></template>
              </dl>
            </div>
            <footer class="more">
              <span v-if="e.moreSenses" class="lab">ещё значений: {{ e.moreSenses }}</span>
              <template v-if="e.forms.length"><span class="lab">Формы</span><span v-for="f in e.forms.slice(0, 4)" :key="f" class="tag" lang="ko">{{ f }}</span></template>
              <button v-if="progress.unlocked" type="button" class="savebtn" :disabled="saved.has(e.id)" @click.stop.prevent="save(e)">{{ saved.has(e.id) ? 'Записано' : 'Записать слово' }}</button>
              <span class="open">Открыть слово →</span>
            </footer>
          </article>
          <button v-if="canMore" type="button" class="morebtn" :disabled="loading" @click="run(true)">Показать ещё</button>
        </template>
      </section>
    </div>
  </DictShell>
</template>

<style scoped>
.dict { display: flex; flex-direction: column; align-items: center; padding-top: 18vh; transition: padding-top .5s cubic-bezier(.2, .8, .2, 1); }
.dict.on { padding-top: 14px; }
.hero { text-align: center; max-height: 200px; overflow: hidden; transition: max-height .45s ease, opacity .3s ease, margin .45s ease; margin-bottom: 22px; }
.on .hero { max-height: 0; opacity: 0; margin-bottom: 0; }
.hero h1 { margin: 0; text-shadow: 0 2px 18px rgba(255, 255, 255, .85); font-size: clamp(30px, 5vw, 44px); letter-spacing: -.01em; font-weight: 800; }
.lead { margin: 10px auto 0; max-width: 520px; color: #3b3f7a; text-shadow: 0 1px 12px rgba(255, 255, 255, .9); font-size: 15px; line-height: 1.5; }

.search { width: 100%; max-width: 720px; transition: max-width .45s cubic-bezier(.2, .8, .2, 1); }
.search.wide { max-width: 1040px; }
.search input { width: 100%; box-sizing: border-box; padding: 17px 24px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 18px; outline: none; box-shadow: var(--shadow); transition: border-color .2s, box-shadow .2s; }
.search input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--pink), var(--shadow); }
.search input::placeholder { color: var(--muted); }

.recent { width: 100%; max-width: 720px; margin-top: 16px; animation: rise .35s ease both; }
.rhead { display: flex; align-items: center; justify-content: space-between; margin: 0 8px 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #3b3f7a; text-shadow: 0 1px 10px rgba(255, 255, 255, .9); }
.rclear { border: 0; background: none; padding: 0; font: inherit; font-size: 12px; color: #3b3f7a; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; text-transform: none; letter-spacing: 0; }
.rlist { display: flex; flex-wrap: wrap; gap: 8px; }
.rcard { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; max-width: 220px; padding: 8px 14px; border: 1px solid rgba(255, 255, 255, .85); border-radius: 16px; background: rgba(255, 255, 255, .72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); text-align: left; font: inherit; color: var(--ink); cursor: pointer; transition: transform .15s, background .15s, box-shadow .15s; }
.rcard:hover { transform: translateY(-2px); background: rgba(255, 255, 255, .95); box-shadow: 0 8px 20px rgba(70, 55, 140, .16); }
.rcard b { font-size: 17px; font-weight: 700; }
.rcard span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted); }
.res { width: 100%; max-width: 1040px; margin-top: 18px; display: flex; flex-direction: column; gap: 16px; animation: rise .35s ease both; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sep { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
.fchip { display: inline-flex; gap: 6px; align-items: baseline; padding: 6px 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s; }
.fchip b { font-size: 11px; color: var(--muted); font-weight: 600; }
.fchip:hover:not(:disabled) { background: #f4efff; }
.fchip:disabled { opacity: .4; cursor: default; }
.fchip.cur { background: #e8e0ff; border-color: #cbbcff; color: #43308c; }
.fchip.alt.cur { background: #ffe3f3; border-color: #ffc3e4; color: #b13a86; }
.count, .none { margin: 0 auto; width: fit-content; padding: 6px 16px; border-radius: 999px; background: rgba(255, 255, 255, .7); color: var(--muted); font-size: 14px; text-align: center; }
.via { margin: 0; padding: 10px 16px; border-radius: 14px; background: #fff6d8; color: #5a4417; font-size: 14px; text-align: center; }

.card { --a: #7a5ce0; --bg: #e8e0ff; --bg2: #f6f2ff; --t: #43308c; position: relative; padding: 24px 28px; border: 1px solid #fff; border-radius: 24px; background: var(--surface); box-shadow: var(--shadow); transition: transform .2s, box-shadow .2s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 22px 50px rgba(100, 87, 170, .18); }
.cardlink { position: absolute; inset: 0; border-radius: 24px; z-index: 1; }
.ch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 2px dotted var(--bg); }
.ch h3 { margin: 0; font-size: 32px; font-weight: 700; }
.hom, .pron { color: var(--muted); font-size: 14px; }
.chip { padding: 3px 12px; border-radius: 999px; background: var(--bg); color: var(--a); font-size: 12px; font-weight: 700; white-space: nowrap; }
.chip.lvl { background: transparent; border: 1px solid var(--bg); color: var(--t); }
.sense + .sense { margin-top: 20px; padding-top: 20px; border-top: 1px dotted var(--bg); }
.sn { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 12px; font-weight: 700; color: var(--a); }
.sn span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; background: var(--bg); }
.kv { margin: 0; display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 16px; }
.kv dt { padding-top: 3px; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.kv dd { margin: 0; color: #14173a; font-size: 15px; line-height: 1.55; }
.kv dd.ru { font-size: 18px; font-weight: 700; color: var(--t); line-height: 1.4; }
.exv { display: flex; flex-direction: column; gap: 4px; }
.more { position: relative; z-index: 2; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 20px; pointer-events: none; }
.more > * { pointer-events: auto; }
.lab { margin-left: 4px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.lab:first-child { margin-left: 0; }
.tag { padding: 4px 12px; border-radius: 999px; background: var(--bg); color: var(--a); font-size: 14px; font-weight: 600; }
.savebtn { margin-left: auto; padding: 5px 14px; border: 1px solid #cbbcff; border-radius: 999px; background: #fff; color: var(--t); font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; }
.savebtn:disabled { opacity: .6; cursor: default; }
.savebtn + .open { margin-left: 8px; }
.open { margin-left: auto; font-size: 13px; font-weight: 600; color: var(--a); pointer-events: none !important; }
.savebtn ~ .open { margin-left: 8px; }
.morebtn { align-self: center; padding: 11px 28px; border: 1px solid #cbbcff; border-radius: 999px; background: #fff; color: #43308c; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.morebtn:disabled { opacity: .6; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .dict, .hero, .res, .search { transition: none; animation: none; } }
@media (max-width: 600px) { .kv { grid-template-columns: 1fr; gap: 2px; } .kv dd { margin-bottom: 8px; } .card { padding: 16px; } .ch h3 { font-size: 28px; } }
</style>
