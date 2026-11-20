<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TopikQuiz from '@/components/korean/TopikQuiz.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G, type Gram } from '@/data/korean/grammar'
import { FORMAT, LISTENING, SOURCES, levelOf, neededShare, readingRange, totalRange, vocabMargin, vocabShare, type ListeningMode, type Measures } from '@/data/korean/topik'
import { buildMock, vocabQuestions, type Q } from '@/data/korean/topik-mock'
import { fetchT } from '@/lib/http'
import { KNOWN_STREAK, useProgressStore } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/** Лежит во вкладке «Пробник TOPIK I» на странице «Экзамены» (2026-11-20): заголовок у страницы общий. */
const progress = useProgressStore()
const { open } = useGrammarModal()
const toast = useToastStore()

/* ---------- результаты теста слов и пробников: на сервере (у владельца), кэш в браузере на случай, если сети нет ---------- */
interface Test { at: number; n: number; correct: number; wrong: number }
interface Mock { at: number; l: number | null; r: number; src: 'site' | 'real'; n: number }
interface Store { tests: Test[]; mocks: Mock[] }
const KEY = 'topik_v1'
const store = ref<Store>({ tests: [], mocks: [] })
/** Гость ничего не сохраняет (правило сайта), владелец хранит на сервере. */
const canSave = computed(() => progress.unlocked && !progress.isGuest)
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${progress.bearer}` })
/** Старый вид записи (до переезда на сервер) был `{ known }` без неверных: читаем его как «верно». */
function normalize(raw: unknown): Store | null {
  const r = raw as { tests?: Record<string, unknown>[]; mocks?: Record<string, unknown>[] } | null
  if (!r || !Array.isArray(r.tests) || !Array.isArray(r.mocks)) return null
  return {
    tests: r.tests.filter(t => typeof t.n === 'number').map(t => ({ at: Number(t.at), n: Number(t.n), correct: Number(t.correct ?? t.known ?? 0), wrong: Number(t.wrong ?? 0) })),
    mocks: r.mocks.filter(m => typeof m.r === 'number').map(m => ({ at: Number(m.at), l: m.l === null || m.l === undefined ? null : Number(m.l), r: Number(m.r), src: m.src === 'site' ? 'site' : 'real', n: Number(m.n ?? 0) })),
  }
}
const cacheWrite = () => {
  try {
    if (!progress.isGuest) localStorage.setItem(KEY, JSON.stringify(store.value))
  } catch {
    /* хранилище недоступно: результаты живут до закрытия страницы */
  }
}
async function save() {
  cacheWrite()
  if (!canSave.value) return
  try {
    const res = await fetchT('/api/topik', { method: 'PUT', headers: headers(), body: JSON.stringify(store.value) })
    if (!res.ok) throw new Error(String(res.status))
  } catch {
    toast.error('Результат сохранён только в этом браузере: сервер не ответил')
  }
}
type Entry = [number, string, string, string]
const pool = ref<Entry[]>([])
onMounted(async () => {
  try {
    const local = normalize(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    if (local && !progress.isGuest) store.value = local
  } catch {
    /* повреждённая запись: начинаем с чистого листа */
  }
  pool.value = (await import('@/data/korean/topik-pool')).TOPIK_POOL
  if (!canSave.value) return
  try {
    const res = await fetchT('/api/topik', { headers: headers() })
    if (!res.ok) return
    const remote = normalize(await res.json())
    if (remote && (remote.tests.length || remote.mocks.length)) {
      store.value = remote
      cacheWrite()
    } else if (store.value.tests.length || store.value.mocks.length) void save() // то, что копилось в браузере до переезда, уходит на сервер
  } catch {
    /* сервер не ответил: работаем с тем, что в браузере */
  }
})

/* ---------- измерения ---------- */
const lastTest = computed(() => store.value.tests.at(-1) ?? null)
const vocabPart = computed(() => (lastTest.value && lastTest.value.n >= 20 ? vocabShare(lastTest.value) : null))
const books = computed(() => G.filter(g => !!g.bk))
const passed = computed(() => books.value.filter(g => g.st === 'ok').length)
const grammarShare = computed(() => (books.value.length ? passed.value / books.value.length : 0))
/** Верные ответы за 30 дней по журналу игр: без 50 ответов точность не берём. */
const acc = computed(() => {
  const since = Date.now() - 30 * 86_400_000
  const log = progress.data.log.filter(e => e.t >= since)
  return log.length >= 50 ? { share: log.filter(e => e.ok).length / log.length, n: log.length } : null
})
const siteKnown = computed(() => Object.values(progress.data.words).filter(w => w.streak >= KNOWN_STREAK).length)
const measures = computed<Measures>(() => ({ vocab: vocabPart.value, vocabN: lastTest.value?.n ?? 0, grammar: grammarShare.value, accuracy: acc.value?.share ?? null }))

const mode = ref<ListeningMode>('same')
const reading = computed(() => readingRange(measures.value))
const total = computed(() => (reading.value ? totalRange(reading.value, mode.value) : null))
const lvl = computed(() => (total.value ? levelOf(total.value.mid) : 0))
const need1 = computed(() => neededShare(FORMAT.level1, mode.value))
const need2 = computed(() => neededShare(FORMAT.level2, mode.value))
const pct = (v: number | null) => (v === null ? '—' : Math.round(v * 100) + '%')

/** Чего не хватает: непройденные темы книг по порядку. */
const key = (g: Gram) => {
  const m = /^(?:(1B) )?(\d+)-(\d+) ([①②③④])$/.exec(g.bk ?? '')
  return m ? (m[1] ? 10000 : 0) + Number(m[2]) * 100 + Number(m[3]) * 10 + '①②③④'.indexOf(m[4]!) + 1 : 0
}
const missing = computed(() => books.value.filter(g => g.st !== 'ok').sort((a, b) => key(a) - key(b)).slice(0, 10))
const label = (g: Gram) => g.ko.split(':')[0]!.trim()

/* ---------- шкала: 0–200 баллов ---------- */
const X0 = 30
const X1 = 690
const px = (s: number) => X0 + (Math.min(200, Math.max(0, s)) / 200) * (X1 - X0)

/* ---------- тест слов и пробник: вопросы с выбором ответа ---------- */
const TEST_N = 40
const run = ref<'vocab' | 'mock' | null>(null)
const qs = ref<Q[]>([])
interface Done { kind: 'vocab' | 'mock'; correct: number; wrong: number; skipped: number; total: number; missed: Q[] }
const done = ref<Done | null>(null)
function start(kind: 'vocab' | 'mock') {
  qs.value = kind === 'vocab' ? vocabQuestions(pool.value, TEST_N) : buildMock(pool.value)
  done.value = null
  run.value = kind
}
function finish(r: { correct: number; wrong: number; skipped: number; missed: Q[] }) {
  const kind = run.value!
  const total = qs.value.length
  if (kind === 'vocab') store.value.tests = [...store.value.tests, { at: Date.now(), n: total, correct: r.correct, wrong: r.wrong }].slice(-50)
  else store.value.mocks = [...store.value.mocks, { at: Date.now(), l: null, r: Math.round((r.correct / total) * 100), src: 'site' as const, n: total }].slice(-50)
  done.value = { kind, ...r, total }
  run.value = null
  void save()
}

/* ---------- настоящий пробник, введённый вручную ---------- */
const mockL = ref<number | null>(null)
const mockR = ref<number | null>(null)
const okScore = (v: number | null) => v !== null && Number.isFinite(v) && v >= 0 && v <= 100
function addMock() {
  if (!okScore(mockL.value) || !okScore(mockR.value)) return
  store.value.mocks = [...store.value.mocks, { at: Date.now(), l: Math.round(mockL.value!), r: Math.round(mockR.value!), src: 'real' as const, n: 0 }].slice(-50)
  mockL.value = mockR.value = null
  void save()
}
const lastMock = computed(() => store.value.mocks.at(-1) ?? null)
/** Сравнение последнего пробника с прогнозом: пробник с сайта сравнивается по чтению, настоящий по сумме. */
const cmp = computed(() => {
  const m = lastMock.value
  if (!m || !reading.value) return ''
  const side = m.src === 'real' && m.l !== null ? { v: m.l + m.r, lo: total.value?.lo ?? 0, hi: total.value?.hi ?? 0 } : { v: m.r, lo: Math.round(reading.value.lo), hi: Math.round(reading.value.hi) }
  return side.v > side.hi ? 'Реальный результат выше прогноза: формула занижает.' : side.v < side.lo ? 'Реальный результат ниже прогноза: формула завышает.' : 'Результат внутри прогноза.'
})
const fmtDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const clearAll = () => {
  store.value = { tests: [], mocks: [] }
  done.value = null
  void save()
}
</script>

<template>
  <div class="wrap tp">
    <p class="intro">
      Ориентир, сколько баллов TOPIK I вы бы набрали сейчас. Это моя оценка по тому, что можно измерить на сайте (словарь, пройденные темы книг, точность в играх), а не официальный расчёт. Аудирование сайт не измеряет: звука нет, поэтому для него два допущения.
    </p>

    <!-- шкала -->
    <section class="card gauge">
      <svg viewBox="0 0 720 170" role="img" :aria-label="total ? `Прогноз: ${total.lo}–${total.hi} баллов из 200` : 'Шкала баллов TOPIK I'">
        <path class="track" :d="`M${X0} 100 L${X1} 100`" />
        <path class="seg s0" :d="`M${X0} 100 L${px(80)} 100`" />
        <path class="seg s1" :d="`M${px(80)} 100 L${px(140)} 100`" />
        <path class="seg s2" :d="`M${px(140)} 100 L${X1} 100`" />
        <g v-for="f in [{ s: 80, t: '1-й уровень', c: 'f1' }, { s: 140, t: '2-й уровень', c: 'f2' }]" :key="f.s" :transform="`translate(${px(f.s)} 100)`" :class="['flag', f.c]">
          <path d="M0 0 V-46" />
          <path class="cl" d="M0 -46 L26 -38 L0 -30Z" />
          <text y="30" text-anchor="middle">{{ f.t }} · {{ f.s }}</text>
        </g>
        <text :x="X0" y="130" font-size="12">0</text>
        <text :x="X1" y="130" font-size="12" text-anchor="end">200</text>
        <template v-if="total">
          <rect class="range" :x="px(total.lo)" y="88" :width="Math.max(10, px(total.hi) - px(total.lo))" height="24" rx="12" />
          <g :transform="`translate(${px(total.mid)} 100)`" class="me">
            <path v-for="k in 5" :key="k" class="petal" d="M0 0 C-7 -8 -6 -20 0 -26 C6 -20 7 -8 0 0Z" :transform="`rotate(${(k - 1) * 72}) scale(1.05)`" />
            <circle r="5.5" class="core" />
            <text y="-40" text-anchor="middle" class="val">{{ total.lo }}–{{ total.hi }}</text>
          </g>
        </template>
      </svg>
      <div class="verdict" :class="`v${lvl}`">
        <template v-if="!total">Пройди тест слов ниже, и появится прогноз.</template>
        <template v-else-if="lvl === 0">Сейчас около {{ total.mid }} из 200: до 1-го уровня (80) не хватает примерно {{ Math.max(1, FORMAT.level1 - total.mid) }} баллов.</template>
        <template v-else-if="lvl === 1">Сейчас около {{ total.mid }} из 200: это 1-й уровень; до 2-го (140) около {{ FORMAT.level2 - total.mid }} баллов.</template>
        <template v-else>Сейчас около {{ total.mid }} из 200: это уровень 2 (от 140).</template>
      </div>
      <div class="modes" role="group" aria-label="Допущение про аудирование">
        <button v-for="(m, id) in LISTENING" :key="id" type="button" class="chip" :class="{ on: mode === id }" @click="mode = id as ListeningMode">{{ m.label }}</button>
      </div>
    </section>

    <!-- три измерения -->
    <div class="meas">
      <section class="card m">
        <h2>Слова</h2>
        <div class="big">{{ pct(vocabPart) }}</div>
        <div class="bar"><i :style="{ width: (vocabPart ?? 0) * 100 + '%' }" /></div>
        <p v-if="lastTest">Тест от {{ fmtDate(lastTest.at) }}: из {{ lastTest.n }} слов верно {{ lastTest.correct }}, неверно {{ lastTest.wrong }}; запас по списку около {{ Math.round(vocabShare(lastTest) * 100) }}% (±{{ vocabMargin(vocabShare(lastTest), lastTest.n) }}%).</p>
        <p v-else>Теста ещё не было.</p>
        <p class="note">По игре «выучено» {{ siteKnown }} слов, но игра не знает слов, которые вы знали раньше: поэтому слова измеряет тест, а не очки.</p>
      </section>
      <section class="card m">
        <h2>Грамматика</h2>
        <div class="big">{{ pct(grammarShare) }}</div>
        <div class="bar"><i :style="{ width: grammarShare * 100 + '%' }" /></div>
        <p>Пройдено {{ passed }} из {{ books.length }} тем книг 1A и 1B (по ним идёт Лера; они примерно соответствуют уровням TOPIK I).</p>
        <NuxtLink to="/korean/map" class="lnk">Открыть карту обучения →</NuxtLink>
      </section>
      <section class="card m">
        <h2>Точность</h2>
        <div class="big">{{ acc ? pct(acc.share) : '—' }}</div>
        <div class="bar"><i :style="{ width: (acc?.share ?? 0) * 100 + '%' }" /></div>
        <p v-if="acc">Верных ответов в играх за 30 дней: {{ acc.n }} ответов.</p>
        <p v-else>За 30 дней меньше 50 ответов: точность в расчёт не берётся.</p>
      </section>
    </div>

    <!-- тест слов -->
    <section class="card test">
      <h2>Тест словарного запаса</h2>
      <TopikQuiz v-if="run === 'vocab'" :questions="qs" allow-skip label="Слова" @done="finish" />
      <template v-else-if="run !== 'mock'">
        <p>{{ TEST_N }} случайных слов начального уровня «한국어 학습용 어휘 목록» ({{ pool.length }} слов в списке): к каждому слову четыре перевода, выбираешь верный. Если слова не знаешь, жми «не знаю» (это не штрафуется, а угадывание наугад учитывается поправкой). Так честнее, чем «знаю / не знаю». Чем чаще проходишь, тем точнее.</p>
        <div v-if="done && done.kind === 'vocab'" class="res">
          Верно {{ done.correct }}, неверно {{ done.wrong }}, не знаю {{ done.skipped }} из {{ done.total }}: запас по списку около {{ Math.round(vocabShare({ n: done.total, correct: done.correct, wrong: done.wrong }) * 100) }}%.
          <details v-if="done.missed.length">
            <summary>Слова, в которых промах ({{ done.missed.length }})</summary>
            <ul><li v-for="m in done.missed" :key="m.id"><b class="ko">{{ m.prompt }}</b> — {{ m.answer }}</li></ul>
          </details>
        </div>
        <button type="button" class="go" :disabled="!pool.length" @click="start('vocab')">{{ lastTest ? 'Пройти ещё раз' : 'Начать тест слов' }}</button>
      </template>
    </section>

    <!-- пробник с сайта -->
    <section class="card test">
      <h2>Пробник «чтение» с сайта</h2>
      <TopikQuiz v-if="run === 'mock'" :questions="qs" :allow-skip="false" label="Пробник" @done="finish" />
      <template v-else-if="run !== 'vocab'">
        <p>30 вопросов в духе блока «чтение» TOPIK I: 12 слов, 12 вопросов по грамматике и 6 коротких текстов. Только то, что вы уже проходили; это не настоящие задания экзамена. Время не ограничено, подсказок нет, итог идёт в «Свои пробники» и подстраивает сравнение с прогнозом.</p>
        <div v-if="done && done.kind === 'mock'" class="res">
          Правильно {{ done.correct }} из {{ done.total }}: около {{ Math.round((done.correct / done.total) * 100) }} из 100 за чтение (по сайту).
          <details v-if="done.missed.length">
            <summary>Ошибки ({{ done.missed.length }})</summary>
            <ul class="one"><li v-for="m in done.missed" :key="m.id">{{ m.prompt }} → <b class="ko">{{ m.answer }}</b></li></ul>
          </details>
        </div>
        <button type="button" class="go" :disabled="!pool.length" @click="start('mock')">{{ store.mocks.some(m => m.src === 'site') ? 'Пройти пробник ещё раз' : 'Начать пробник' }}</button>
      </template>
    </section>

    <!-- что нужно -->
    <section class="card need">
      <h2>Чего не хватает до 1-го уровня</h2>
      <p>По моей формуле для {{ FORMAT.level1 }} баллов нужно знать около <b>{{ need1 }}%</b> слов и тем (для {{ FORMAT.level2 }} — около <b>{{ need2 }}%</b>), при допущении «{{ LISTENING[mode].label }}».</p>
      <h3>Следующие темы из книг</h3>
      <div v-if="!missing.length" class="note">Все темы книг пройдены.</div>
      <div class="chips">
        <button v-for="g in missing" :key="g.id" type="button" class="chip" @click="open(g.id, true)">{{ label(g) }} <small>{{ g.bk!.replace('1B ', '1B · ') }}</small></button>
      </div>
    </section>

    <!-- пробный тест -->
    <section class="card mock">
      <h2>Свои пробники</h2>
      <p>Если решали настоящий пробный TOPIK I, впиши баллы блоков (0–100): страница покажет, насколько прогноз близок. Своих пробников у вас может не быть: прошлые экзамены лежат в архивах ниже (аудирование требует звука, поэтому его вы решаете вне сайта).</p>
      <form class="mf" @submit.prevent="addMock">
        <label>Аудирование <input v-model.number="mockL" type="number" min="0" max="100" inputmode="numeric" /></label>
        <label>Чтение <input v-model.number="mockR" type="number" min="0" max="100" inputmode="numeric" /></label>
        <button type="submit" :disabled="!okScore(mockL) || !okScore(mockR)">Записать</button>
      </form>
      <ul v-if="store.mocks.length" class="ml">
        <li v-for="m in [...store.mocks].reverse()" :key="m.at">
          {{ fmtDate(m.at) }}: <template v-if="m.src === 'real'">аудирование {{ m.l }} + чтение {{ m.r }} = <b>{{ (m.l ?? 0) + m.r }}</b> из 200 (уровень {{ levelOf((m.l ?? 0) + m.r) || 'ниже 1-го' }})</template>
          <template v-else>пробник с сайта: чтение <b>{{ m.r }}</b> из 100 ({{ m.n }} вопросов)</template>
        </li>
      </ul>
      <p v-if="lastMock && reading" class="note">
        Последний пробник: {{ lastMock.src === 'site' || lastMock.l === null ? `чтение ${lastMock.r}, прогноз чтения ${Math.round(reading.lo)}–${Math.round(reading.hi)}` : `${lastMock.l + lastMock.r}, прогноз ${total?.lo}–${total?.hi}` }}.
        {{ cmp }}
      </p>
      <p class="note">Где взять настоящие: <a href="https://www.topikguide.com/previous-papers/" target="_blank" rel="noopener">архив прошлых экзаменов TOPIK Guide</a> (сторонний, проверьте, что набор настоящий) или раздел «기출문제» на сайте <a href="https://www.topik.go.kr/" target="_blank" rel="noopener">topik.go.kr</a> (он иногда не работает).</p>
    </section>

    <!-- факты -->
    <section class="card facts">
      <h2>Что известно про экзамен</h2>
      <table>
        <thead><tr><th /><th>Вопросов</th><th>Время</th><th>Баллов</th></tr></thead>
        <tbody>
          <tr><th>Аудирование</th><td>{{ FORMAT.listening.questions }}</td><td>{{ FORMAT.listening.minutes }} мин</td><td>{{ FORMAT.perPart }}</td></tr>
          <tr><th>Чтение</th><td>{{ FORMAT.reading.questions }}</td><td>{{ FORMAT.reading.minutes }} мин</td><td>{{ FORMAT.perPart }}</td></tr>
        </tbody>
      </table>
      <p>Максимум {{ FORMAT.max }} баллов. 1-й уровень: от {{ FORMAT.level1 }}, 2-й: от {{ FORMAT.level2 }}. Письма в TOPIK I нет. Словарь начального уровня оценивают примерно в 800–1 500 слов (разные издатели считают по-разному).</p>
      <p class="note">Как считается прогноз: чтение ≈ 95 × (0,5 · слова + 0,35 · грамматика + 0,15 · точность), аудирование по выбранному допущению; разброс от погрешности теста слов и ещё ±7. Источники:</p>
      <ul class="src"><li v-for="s in SOURCES" :key="s.url"><a :href="s.url" target="_blank" rel="noopener">{{ s.title }}</a></li></ul>
      <button v-if="store.tests.length || store.mocks.length" type="button" class="reset" @click="clearAll">Стереть мои результаты на этом устройстве</button>
    </section>
  </div>
</template>

<style scoped>
.tp { --vine: #e0559f; --petal: #ffb3da; --petal-line: #e0559f; --core: #fff6c8; --gold: #f3b93d; }
html[data-theme='dark'] .tp { --vine: #ff9cc6; --petal: #ffd1e3; --petal-line: #ff6fae; --core: #ff4f9a; --gold: #ffcf6e; }
.intro { margin: 8px 0 18px; max-width: 780px; color: var(--muted); font-size: 14px; line-height: 1.55; }
.card { margin: 0 0 18px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 26px; background: var(--surface); }
.card h2 { margin: 0 0 8px; font-size: 19px; }
.card h3 { margin: 14px 0 6px; font-size: 14px; color: var(--muted); }
.card p { margin: 6px 0; font-size: 14px; line-height: 1.5; }
.note { color: var(--muted); font-size: 12.5px !important; }
.gauge svg { width: 100%; height: auto; max-height: 190px; overflow: visible; }
.track { fill: none; stroke: var(--line); stroke-width: 14; stroke-linecap: round; }
.seg { fill: none; stroke-width: 14; stroke-linecap: round; opacity: .9; }
.s0 { stroke: rgba(150, 140, 210, .35); }
.s1 { stroke: var(--petal); }
.s2 { stroke: var(--gold); }
.flag path:first-child { stroke: var(--ink); stroke-width: 2; fill: none; }
.flag .cl { fill: var(--petal-line); stroke: none; }
.flag.f2 .cl { fill: var(--gold); }
.flag text { font-size: 12px; fill: var(--muted); stroke: none; }
.range { fill: rgba(224, 85, 159, .28); stroke: var(--petal-line); stroke-width: 2; transform-origin: left center; animation: grow 1.1s cubic-bezier(.3, .6, .2, 1) backwards; }
.petal { fill: var(--petal); stroke: var(--petal-line); stroke-width: 1.5; }
.core { fill: var(--core); }
.me { animation: pop .8s cubic-bezier(.2, 1.4, .4, 1) .5s backwards; }
.val { font-size: 17px; font-weight: 800; fill: var(--ink); }
.verdict { margin: 4px 0 10px; font-size: 15px; font-weight: 600; }
.modes { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 14px; border: 1px solid var(--line); border-radius: 99px; background: rgba(255, 255, 255, .5); color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.chip small { margin-left: 4px; color: var(--muted); }
.meas { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.m .big { font-size: 40px; font-weight: 800; line-height: 1; color: var(--pink, #d64da9); }
.bar, .prog { height: 8px; margin: 10px 0; border-radius: 99px; background: var(--line); overflow: hidden; }
.bar i, .prog i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--petal), var(--petal-line)); transition: width .8s cubic-bezier(.3, .6, .2, 1); }
.lnk { font-size: 13px; color: var(--accent); }
.test .w { margin: 18px 0 2px; font-size: 56px; font-weight: 700; text-align: center; }
.test .pos { text-align: center; color: var(--muted); font-size: 13px; }
.acts { display: flex; justify-content: center; gap: 14px; margin: 18px 0 8px; }
.acts button, .go, .mf button { padding: 12px 28px; border: 0; border-radius: 99px; font: inherit; font-weight: 700; cursor: pointer; }
.acts .yes, .go, .mf button { background: var(--accent); color: #fff; }
.acts .no { background: rgba(150, 140, 210, .25); color: inherit; }
.acts small { opacity: .7; }
.go:disabled, .mf button:disabled { opacity: .5; cursor: default; }
.res { margin: 10px 0; padding: 10px 14px; border-radius: 16px; background: rgba(224, 85, 159, .1); font-size: 14px; }
.res ul { margin: 8px 0 0; padding-left: 18px; columns: 2; font-size: 13px; }
.res ul.one { columns: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.mf { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin: 8px 0; }
.mf label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
.mf input { width: 110px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: inherit; font: inherit; }
.ml { margin: 8px 0; padding-left: 18px; font-size: 14px; }
.facts table { border-collapse: collapse; margin: 6px 0; font-size: 14px; }
.facts th, .facts td { padding: 5px 16px 5px 0; text-align: left; font-weight: 500; }
.facts thead th { color: var(--muted); font-size: 12px; }
.src { margin: 4px 0 10px; padding-left: 18px; font-size: 13px; }
.src a { color: var(--accent); }
.reset { padding: 6px 14px; border: 1px solid var(--line); border-radius: 99px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; cursor: pointer; }
@keyframes grow { from { transform: scaleX(0); } }
@keyframes pop { from { transform: translate(var(--tx, 0), 100px) scale(0); } }
@media (prefers-reduced-motion: reduce) { .range, .me, .bar i, .prog i { animation: none; transition: none; } }
@media (max-width: 640px) { .facts table { width: 100%; font-size: 13px; } .facts th, .facts td { padding: 4px 6px 4px 0; } .card { padding: 14px 14px; border-radius: 20px; } .test .w { font-size: 44px; } .res ul { columns: 1; } }
</style>
