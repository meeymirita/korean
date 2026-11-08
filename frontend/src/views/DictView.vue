<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import DictCard from '@/components/dict/DictCard.vue'
import DictWordList from '@/components/dict/DictWordList.vue'
import { LEVELS, loadCards, searchDict, type DictHit, type DictSearch } from '@/lib/dictApi'
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
/** слово, выбранное в меню слева: его карточка показывается в центре */
const pickedWord = ref(str(route.query.w))
const picked = ref<DictHit[] | null>(null)
const menuOpen = ref(false)
const input = ref<HTMLInputElement | null>(null)

const data = ref<DictSearch | null>(null)
const loading = ref(false)
const error = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

/* ---------- SEO: страницы поиска с ?q=, ?w= и фильтрами не индексируем (у слов есть свои адреса), сама /dict индексируется ---------- */
const hasParams = computed(() => Object.keys(route.query).length > 0)
useSeoMeta({ robots: () => (hasParams.value ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1') })

/** Популярные слова рисуются на сервере (ссылки в готовом HTML): так поисковик заходит в слова с главной страницы словаря. */
const config = useRuntimeConfig()
const { data: popular } = await useFetch<{ items: { id: string; word: string; ru: string }[] }>('/api/dict/list', {
  baseURL: import.meta.server ? config.apiBase : undefined,
  query: { order: 'pop', limit: 48 },
  timeout: 8_000,
  key: 'dict-popular',
  default: () => ({ items: [] }),
})

const active = computed(() => focused.value || q.value.trim() !== '' || !!pickedWord.value)
const hasQuery = computed(() => q.value.trim() !== '')

function syncUrl() {
  const query: Record<string, string> = {}
  if (q.value.trim()) query.q = q.value.trim()
  if (level.value) query.level = level.value
  if (pos.value) query.pos = pos.value
  if (pickedWord.value && !q.value.trim()) query.w = pickedWord.value
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

watch(q, v => {
  if (v.trim()) { pickedWord.value = ''; picked.value = null } // начал печатать: выбранная в меню карточка уходит
  schedule()
})

/** Нажали слово в меню слева: карточка этого слова в центре, дальше с неё на страницу слова. */
async function pickWord(word: string) {
  menuOpen.value = false
  clearTimeout(timer)
  seq++
  q.value = ''
  level.value = ''
  pos.value = ''
  data.value = null
  error.value = ''
  loading.value = false
  pickedWord.value = word
  syncUrl()
  try {
    const cards = await loadCards(word)
    if (pickedWord.value !== word) return
    picked.value = cards
    if (cards[0]) openWord(cards[0])
  } catch (e) {
    if (pickedWord.value === word) { picked.value = null; error.value = errText(e) }
  }
}
function setLevel(l: string) { level.value = level.value === l ? '' : l; syncUrl(); void run() }
function setPos(p: string) { pos.value = pos.value === p ? '' : p; syncUrl(); void run() }

/** Клик по пустому месту (по бокам, где нет поиска, карточек, шапки и подписи): поиск закрывается, остаётся заставка. */
function closeOnOutside(e: MouseEvent) {
  if (!hasQuery.value && !pickedWord.value) return
  const t = e.target as HTMLElement | null
  if (!t || t.closest('.search, .res, .top, .src, .hero, .recent, .picked, .menubtn, .dict-side')) return
  if (window.getSelection()?.toString()) return // человек выделял текст и отпустил кнопку снаружи
  remember()
  clearTimeout(timer)
  clearTimeout(rememberTimer)
  seq++
  q.value = ''
  level.value = ''
  pos.value = ''
  data.value = null
  pickedWord.value = ''
  picked.value = null
  error.value = ''
  loading.value = false
  input.value?.blur()
  syncUrl()
}

onMounted(() => {
  history.load()
  if (hasQuery.value) void run()
  else if (pickedWord.value) void pickWord(pickedWord.value)
  document.addEventListener('click', closeOnOutside)
})
onBeforeUnmount(() => { remember(); clearTimeout(timer); clearTimeout(rememberTimer); seq++; if (import.meta.client) document.removeEventListener('click', closeOnOutside) })

const posChips = computed(() => Object.entries(data.value?.facets.pos ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8))
const canMore = computed(() => !!data.value && data.value.hits.length < data.value.total && data.value.hits.length < 2000)

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
  <DictShell side :side-open="menuOpen" :lock="!hasQuery && !pickedWord">
    <template #side>
      <DictWordList :selected="pickedWord" @pick="pickWord" @close="menuOpen = false" />
    </template>
    <div class="dict" :class="{ on: active }">
      <div class="hero">
        <h1>Большой корейско-русский словарь</h1>
        <p class="lead">Больше 50 тысяч корейских слов с переводом на русский: значения, примеры, словосочетания и формы. Ищи по-корейски, по-русски или по спряжённой форме: 먹었어요.</p>
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

      <button type="button" class="menubtn" @click="menuOpen = true">Все слова</button>

      <section v-if="pickedWord && !hasQuery" class="picked" aria-live="polite">
        <p v-if="!picked && !error" class="count">Открываю…</p>
        <p v-if="error && !picked" class="none">{{ error }}</p>
        <DictCard v-for="e in picked ?? []" :key="e.id" :hit="e" :can-save="progress.unlocked" :saved="saved.has(e.id)" @open="openWord" @save="save" />
      </section>

      <section v-show="!active" class="popular" aria-label="Популярные слова">
        <h2>Популярные слова</h2>
        <div class="plist">
          <RouterLink v-for="it in popular?.items ?? []" :key="it.id" :to="`/dict/${encodeURIComponent(it.word)}`" class="pw"><b lang="ko">{{ it.word }}</b><span>{{ it.ru.split(';')[0] }}</span></RouterLink>
        </div>
      </section>

      <section v-if="!hasQuery && !pickedWord && recent.length" class="recent" aria-label="Недавно искал">
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
          <p class="count">Найдено: {{ data.total.toLocaleString('ru-RU') }}<span v-if="loading"> · обновляю…</span></p>
          <p v-if="data.via" class="via">
            Это спряжённая форма. Показываю начальную форму: <b lang="ko">{{ data.via.forms.join(', ') }}</b>
          </p>
          <DictCard v-for="e in data.hits" :key="e.id" :hit="e" :can-save="progress.unlocked" :saved="saved.has(e.id)" @open="openWord" @save="save" />
          <button v-if="canMore" type="button" class="morebtn" :disabled="loading" @click="run(true)">Показать ещё</button>
        </template>
      </section>
    </div>
  </DictShell>
</template>

<style scoped>
.dict { display: flex; flex-direction: column; align-items: center; padding-top: clamp(20px, 5vh, 56px); transition: padding-top .5s cubic-bezier(.2, .8, .2, 1); }
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

.popular { width: 100%; max-width: 860px; margin-top: 26px; text-align: center; }
.popular h2 { margin: 0 0 10px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #3b3f7a; text-shadow: 0 1px 10px rgba(255, 255, 255, .9); }
.plist { display: flex; flex-wrap: wrap; justify-content: center; gap: 7px; max-height: max(0px, calc(100dvh - 590px)); overflow: hidden; }
.pw { display: inline-flex; align-items: baseline; gap: 6px; padding: 6px 13px; border: 1px solid rgba(255, 255, 255, .85); border-radius: 999px; background: rgba(255, 255, 255, .72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: var(--ink); text-decoration: none; transition: transform .15s, background .15s; }
.pw:hover { transform: translateY(-2px); background: rgba(255, 255, 255, .95); }
.pw b { font-size: 16px; } .pw span { font-size: 12px; color: var(--muted); max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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

.picked { width: 100%; max-width: 1040px; margin-top: 18px; display: flex; flex-direction: column; gap: 16px; animation: rise .35s ease both; }
.menubtn { display: none; margin-top: 12px; padding: 9px 20px; border: 1px solid rgba(255, 255, 255, .85); border-radius: 999px; background: rgba(255, 255, 255, .78); color: #43308c; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
@media (max-width: 959px) { .menubtn { display: inline-block; } }
.morebtn { align-self: center; padding: 11px 28px; border: 1px solid #cbbcff; border-radius: 999px; background: #fff; color: #43308c; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.morebtn:disabled { opacity: .6; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .dict, .hero, .res, .search { transition: none; animation: none; } }
</style>
