<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G, type Gram } from '@/data/korean/grammar'
import { FORMAT, LISTENING, SOURCES, levelOf, neededShare, readingRange, totalRange, vocabMargin, type ListeningMode, type Measures } from '@/data/korean/topik'
import { KNOWN_STREAK, useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const { open } = useGrammarModal()

/* ---------- результаты теста слов и пробных тестов: помнятся в этом браузере ---------- */
interface Store { tests: { at: number; n: number; known: number }[]; mocks: { at: number; l: number; r: number }[] }
const KEY = 'topik_v1'
const store = ref<Store>({ tests: [], mocks: [] })
const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.value))
  } catch {
    /* хранилище недоступно: результаты живут до закрытия страницы */
  }
}
type Entry = [number, string, string, string]
const pool = ref<Entry[]>([])
onMounted(async () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Store | null
    if (raw && Array.isArray(raw.tests) && Array.isArray(raw.mocks)) store.value = raw
  } catch {
    /* повреждённая запись: начинаем с чистого листа */
  }
  pool.value = (await import('@/data/korean/topik-pool')).TOPIK_POOL
})

/* ---------- измерения ---------- */
const lastTest = computed(() => store.value.tests.at(-1) ?? null)
const vocabShare = computed(() => (lastTest.value && lastTest.value.n >= 20 ? lastTest.value.known / lastTest.value.n : null))
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
const measures = computed<Measures>(() => ({ vocab: vocabShare.value, vocabN: lastTest.value?.n ?? 0, grammar: grammarShare.value, accuracy: acc.value?.share ?? null }))

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

/* ---------- тест слов ---------- */
const TEST_N = 40
const running = ref(false)
const words = ref<Entry[]>([])
const idx = ref(0)
const knownCount = ref(0)
const missed = ref<Entry[]>([])
const justDone = ref<{ share: number; n: number } | null>(null)
function start() {
  const p = [...pool.value]
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[p[i], p[j]] = [p[j]!, p[i]!]
  }
  words.value = p.slice(0, TEST_N)
  idx.value = 0
  knownCount.value = 0
  missed.value = []
  justDone.value = null
  running.value = true
}
function answer(know: boolean) {
  if (!running.value) return
  if (know) knownCount.value++
  else missed.value.push(words.value[idx.value]!)
  if (idx.value + 1 >= words.value.length) {
    running.value = false
    store.value.tests.push({ at: Date.now(), n: words.value.length, known: knownCount.value })
    store.value.tests = store.value.tests.slice(-20)
    save()
    justDone.value = { share: knownCount.value / words.value.length, n: words.value.length }
  } else idx.value++
}
const onKey = (e: KeyboardEvent) => {
  if (!running.value || e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'ArrowRight') answer(true)
  else if (e.key === 'ArrowLeft') answer(false)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

/* ---------- пробный тест, введённый вручную ---------- */
const mockL = ref<number | null>(null)
const mockR = ref<number | null>(null)
const okScore = (v: number | null) => v !== null && Number.isFinite(v) && v >= 0 && v <= 100
function addMock() {
  if (!okScore(mockL.value) || !okScore(mockR.value)) return
  store.value.mocks.push({ at: Date.now(), l: Math.round(mockL.value!), r: Math.round(mockR.value!) })
  store.value.mocks = store.value.mocks.slice(-20)
  mockL.value = mockR.value = null
  save()
}
const lastMock = computed(() => store.value.mocks.at(-1) ?? null)
const fmtDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
const clearAll = () => {
  store.value = { tests: [], mocks: [] }
  save()
}
</script>

<template>
  <div class="wrap tp">
    <SectionHead id="topik" :big="total ? total.mid : undefined" />
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
        <div class="big">{{ pct(vocabShare) }}</div>
        <div class="bar"><i :style="{ width: (vocabShare ?? 0) * 100 + '%' }" /></div>
        <p v-if="lastTest">Из {{ lastTest.n }} слов начального уровня вы знаете {{ lastTest.known }} (±{{ vocabMargin(lastTest.known / lastTest.n, lastTest.n) }}%). Тест: {{ fmtDate(lastTest.at) }}</p>
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
      <template v-if="running && words[idx]">
        <div class="prog"><i :style="{ width: (idx / words.length) * 100 + '%' }" /></div>
        <div class="w ko">{{ words[idx]![1] }}</div>
        <div class="pos">слово {{ idx + 1 }} из {{ words.length }}</div>
        <div class="acts">
          <button type="button" class="no" @click="answer(false)">Не знаю <small>←</small></button>
          <button type="button" class="yes" @click="answer(true)">Знаю <small>→</small></button>
        </div>
        <p class="note">Отвечай честно: «знаю», если можешь сказать перевод. Стрелки ← и → тоже работают.</p>
      </template>
      <template v-else>
        <p>{{ TEST_N }} случайных слов начального уровня «한국어 학습용 어휘 목록» ({{ pool.length }} слов в списке). Отвечаешь «знаю» или «не знаю»: по доле считается словарный запас, это точнее, чем очки в играх. Чем чаще проходишь, тем точнее.</p>
        <div v-if="justDone" class="res">
          Знакомо {{ Math.round(justDone.share * justDone.n) }} из {{ justDone.n }}: примерно {{ Math.round(justDone.share * pool.length) }} слов списка.
          <details v-if="missed.length">
            <summary>Какие слова не знакомы ({{ missed.length }})</summary>
            <ul><li v-for="m in missed" :key="m[1]"><b class="ko">{{ m[1] }}</b> — {{ m[3] }} <small>{{ m[2] }}</small></li></ul>
          </details>
        </div>
        <button type="button" class="go" :disabled="!pool.length" @click="start">{{ lastTest ? 'Пройти ещё раз' : 'Начать тест' }}</button>
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
      <h2>Свои баллы пробного теста</h2>
      <p>Если решали настоящий пробный TOPIK I, впиши баллы блоков (0–100): страница покажет, насколько прогноз близок.</p>
      <form class="mf" @submit.prevent="addMock">
        <label>Аудирование <input v-model.number="mockL" type="number" min="0" max="100" inputmode="numeric" /></label>
        <label>Чтение <input v-model.number="mockR" type="number" min="0" max="100" inputmode="numeric" /></label>
        <button type="submit" :disabled="!okScore(mockL) || !okScore(mockR)">Записать</button>
      </form>
      <ul v-if="store.mocks.length" class="ml">
        <li v-for="m in [...store.mocks].reverse()" :key="m.at">{{ fmtDate(m.at) }}: {{ m.l }} + {{ m.r }} = <b>{{ m.l + m.r }}</b> из 200 (уровень {{ levelOf(m.l + m.r) || 'ниже 1-го' }})</li>
      </ul>
      <p v-if="lastMock && total" class="note">Последний пробный: {{ lastMock.l + lastMock.r }}, прогноз сейчас: {{ total.lo }}–{{ total.hi }}. {{ lastMock.l + lastMock.r > total.hi ? 'Реальный результат выше прогноза: формула занижает.' : lastMock.l + lastMock.r < total.lo ? 'Реальный результат ниже прогноза: формула завышает.' : 'Результат внутри прогноза.' }}</p>
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
