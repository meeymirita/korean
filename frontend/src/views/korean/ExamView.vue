<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AskAi from '@/components/korean/AskAi.vue'
import ExamRun from '@/components/korean/ExamRun.vue'
import ExamUnits from '@/components/korean/ExamUnits.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { askConfirm } from '@/composables/useConfirm'
import {
  BLITZ_POINTS, BLITZ_SECONDS, EXAM_ID, EXAM_PARTS, EXAM_PASS, EXAM_POINTS_APPROX, MIN_RULE, OWN_RULE, RECHECK_DAYS,
  blitzBlocks, examParts, examPassed, examNeed, examState, examTotal, examWeakCards, partPoints, ruleLabel, summarize,
  type ExamAttempt, type ExamBlock, type ExamDraft, type ExamMistake, type PartAnswers, type ExamResultRow, type PointResult, type RuleScores,
} from '@/data/korean/exam'
import { withSeed } from '@/lib/seeded'
import TopikView from '@/views/korean/TopikView.vue'
import { useExamStore } from '@/stores/exam'
import { dayKey } from '@/stores/progress'
import { useToastStore } from '@/stores/toast'

/**
 * «Итоговая оценка»: один большой экзамен по всему пройденному, три части (в каждой можно остановиться: ответы сохраняются на сервере).
 * Сдан, если верных не меньше 85% и не меньше 70% по каждому правилу. Результаты и разбор показываются после последней части.
 * Пересдача через сутки, через 30 дней напоминание подтвердить.
 */
const route = useRoute()
const router = useRouter()
const exams = useExamStore()
const toast = useToastStore()

const draft = ref<ExamDraft | null>(null)
const ready = ref(false)
const busy = ref(false)
const run = ref<InstanceType<typeof ExamRun> | null>(null)
const now = ref(Date.now())
/** Итог только что законченной попытки (показывается сразу, потом доступен в разборе попыток). */
const finished = ref<{ attempt: ExamAttempt; row?: ExamResultRow } | null>(null)
const attempts = ref<ExamAttempt[]>([])

let clock: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  now.value = Date.now()
  void exams.loadBlitz()
  clock = setInterval(() => (now.value = Date.now()), 60_000)
  await Promise.all([exams.load(), exams.loadDraft().then(d => (draft.value = d))])
  if (view.value === 'log') await loadLog()
  ready.value = true
})
onBeforeUnmount(() => {
  clearInterval(clock)
  clearInterval(blitzTimer)
})

/** Вкладки страницы: блиц дня, экзамен единицы, большой экзамен, пробник TOPIK I (`?tab=`). По умолчанию блиц; если есть начатый экзамен или свежий итог, то большой. */
const TABS = [
  { id: 'blitz', label: 'Блиц дня', sub: '5 минут каждый день' },
  { id: 'units', label: 'Экзамен единицы', sub: 'по одной единице книги' },
  { id: 'big', label: 'Большой экзамен', sub: 'всё пройденное' },
  { id: 'topik', label: 'Пробник TOPIK I', sub: 'прогноз баллов' },
] as const
type TabId = (typeof TABS)[number]['id']
const tab = computed<TabId>(() => {
  const q = String(route.query.tab ?? '')
  return (TABS.find(t => t.id === q)?.id ?? (finished.value || draft.value ? 'big' : 'blitz')) as TabId
})
const setTab = (id: TabId) => void router.push({ query: { tab: id } })

const view = computed(() => (route.query.view === 'log' ? 'log' : route.query.blitz && blitz.value ? 'blitz' : route.query.part ? 'run' : 'home'))
const partNo = computed(() => Math.min(Math.max(Number(route.query.part) || 1, 1), EXAM_PARTS))
const row = computed(() => exams.results[EXAM_ID])
const state = computed(() => examState(row.value, now.value))
const STATE_LABEL = { new: 'ещё не сдавал', failed: 'не сдано', passed: 'сдано', due: 'пора подтвердить' } as const
/** Только при локальном запуске (`nuxt dev`): ожидание пересдачи не мешает, а в любую часть можно зайти кнопкой. На сайте этого нет. */
const dev = import.meta.dev
const waitMs = computed(() => (!dev && row.value && now.value < row.value.retryAt ? row.value.retryAt - now.value : 0))
const waitText = computed(() => {
  const m = Math.ceil(waitMs.value / 60_000)
  return m >= 60 ? `Через ${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}` : `Через ${m} мин`
})
const date = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const when = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** Сколько частей уже сохранено в черновике и с какой продолжать. */
const savedParts = computed(() => draft.value?.results.filter(Boolean).length ?? 0)
const nextPart = computed(() => (draft.value ? Math.min(savedParts.value + 1, draft.value.parts.length) : 1))
const total = computed(() => (draft.value ? examTotal(draft.value.parts) : 0))
const blocks = computed(() => draft.value?.parts[partNo.value - 1] ?? [])

const pct = (a: { ok: number; total: number }) => Math.round((a.ok / a.total) * 100)
/** Правила по возрастанию доли верных: слабые сверху. */
const ruleRows = (rules: RuleScores) =>
  Object.entries(rules)
    .map(([id, v]) => ({ id, label: ruleLabel(id), ...v, share: v.ok / v.total }))
    .sort((a, b) => a.share - b.share)
const tone = (share: number) => (share >= OWN_RULE ? 'own' : share >= MIN_RULE ? 'mid' : 'weak')

async function startNew() {
  if (waitMs.value) return
  if (draft.value && savedParts.value > 0 && !(await askConfirm({ title: 'Начать экзамен заново?', text: 'Сохранённые части этой попытки будут удалены.', ok: 'Начать заново', danger: true }))) return
  busy.value = true
  const d: ExamDraft = { v: 1, startedAt: Date.now(), parts: examParts(EXAM_PARTS), results: Array.from({ length: EXAM_PARTS }, () => null) }
  const err = await exams.saveDraft(d)
  busy.value = false
  if (err) return void toast.error(err)
  draft.value = d
  finished.value = null
  void router.push({ query: { part: '1' } })
}
function continueExam() {
  finished.value = null
  void router.push({ query: { part: String(nextPart.value) } })
}
/** Возврат на страницу: после блица на вкладку блица, после экзамена на большой. */
function goTab(to: TabId) {
  void router.push({ query: { tab: to } })
}
const home = () => goTab('big')
/* ---------- пробный блиц: около 20 пунктов, 5 минут, результат нигде не записывается ---------- */
const blitz = ref<{ blocks: ExamBlock[]; endsAt: number } | null>(null)
const blitzDone = ref<ExamAttempt | null>(null)
const left = ref(0)
let blitzTimer: ReturnType<typeof setInterval> | undefined
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
function startBlitz() {
  clearInterval(blitzTimer)
  blitz.value = { blocks: withSeed(`blitz:${dayKey()}`, () => blitzBlocks(examParts(EXAM_PARTS), BLITZ_POINTS, weakSet())), endsAt: Date.now() + BLITZ_SECONDS * 1000 }
  blitzDone.value = null
  finished.value = null
  left.value = BLITZ_SECONDS
  blitzTimer = setInterval(() => {
    left.value = Math.max(0, Math.round(((blitz.value?.endsAt ?? 0) - Date.now()) / 1000))
    // время вышло: что не отвечено, считается неверным
    if (left.value === 0) {
      clearInterval(blitzTimer)
      run.value?.check()
    }
  }, 1000)
  void router.push({ query: { blitz: '1' } })
}
/** Блиц дня один на сутки (как «Сегодня»); итоги по дням и слабые правила лежат на сервере (`stores/exam.ts`). */
const blitzLog = computed(() => exams.blitzDays)
const blitzToday = computed(() => blitzLog.value.find(x => x.day === dayKey()))
/** Серия дней подряд: считается назад от сегодня (если сегодня ещё не решали, от вчера, чтобы серия не обнулялась до конца дня). */
const streak = computed(() => {
  const days = new Set(blitzLog.value.map(b => b.day))
  const d = new Date()
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(dayKey(d))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
})
/** Слабые правила блица: накапливаются по итогам блицов (на сервере, старое затухает); к ним добавляются слабые по последнему большому экзамену. Блиц чаще берёт блоки с ними. */
function weakSet(): Set<string> {
  const out = new Set<string>()
  const all: RuleScores = { ...exams.blitzWeak }
  for (const [id, r] of Object.entries(row.value?.rules ?? {})) all[id] = { ok: (all[id]?.ok ?? 0) + r.ok, total: (all[id]?.total ?? 0) + r.total }
  for (const [id, r] of Object.entries(all)) if (r.total >= 3 && r.ok / r.total < MIN_RULE) out.add(id)
  return out
}
function blitzSaved(points: PointResult[]) {
  clearInterval(blitzTimer)
  const sum = summarize([points])
  void exams.saveBlitz(dayKey(), sum.right, sum.total, sum.rules).then(ok => ok || toast.error('Итог блица не сохранился на сервере'))
  blitzDone.value = { at: Date.now(), right: sum.right, total: sum.total, passed: examPassed(sum.right, sum.total, sum.rules), rules: sum.rules, mistakes: sum.mistakes }
  blitz.value = null
  goTab('blitz')
}
function exitBlitz() {
  clearInterval(blitzTimer)
  blitz.value = null
  goTab('blitz')
}

function openLog() {
  void router.push({ query: { view: 'log' } })
}
async function loadLog() {
  attempts.value = await exams.log(EXAM_ID)
}
watch(view, v => v === 'log' && void loadLog())

/** «Сохранить и выйти»: ответы неоконченной части сохраняются в черновик без оценки. */
async function pause(answers: PartAnswers) {
  const d = draft.value
  if (!d) return
  d.partial = { part: partNo.value, answers }
  busy.value = true
  const err = await exams.saveDraft(d)
  busy.value = false
  if (err) return void toast.error(`Не сохранилось: ${err}`)
  toast.ok('Ответы сохранены, можно продолжить позже')
  run.value?.release()
  home()
}

/** Часть сохранена: результат уходит в черновик; после последней части считаем итог и отправляем его. */
async function saved(points: PointResult[]) {
  const d = draft.value
  if (!d) return
  const results = d.results.slice()
  results[partNo.value - 1] = points
  d.results = results
  delete d.partial
  busy.value = true
  const err = await exams.saveDraft(d)
  if (err) {
    busy.value = false
    return void toast.error(`Часть не сохранилась: ${err}`)
  }
  if (results.some(r => !r)) {
    busy.value = false
    toast.ok(`Часть ${partNo.value} сохранена`)
    run.value?.release()
    return home()
  }
  const sum = summarize(results as PointResult[][])
  const resp = await exams.submit(EXAM_ID, 'Итоговая оценка', sum.right, sum.total, sum.rules, sum.mistakes)
  busy.value = false
  if (resp.error) return void toast.error(`Итог не отправился: ${resp.error}. Сохранённые части остались, попробуй закончить ещё раз.`)
  await exams.dropDraft()
  draft.value = null
  now.value = Date.now()
  finished.value = { attempt: { at: Date.now(), right: sum.right, total: sum.total, passed: !!resp.row?.passed, rules: sum.rules, mistakes: sum.mistakes }, row: resp.row }
  home()
  if (examPassed(sum.right, sum.total, sum.rules)) toast.ok('Экзамен сдан!')
}

/** Ошибки попытки по правилам: у ошибки правила нет, поэтому группируем по блоку. */
/** «Спросить ИИ» у ошибки экзамена: вид задания, вопрос, ответ ученика и верный ответ. */
const EXAM_QUICK = ['Почему мой ответ неверный?', 'Объясни правило', 'Дай похожее задание', 'Как это запомнить?']
const mistakeContext = (block: string, m: ExamMistake) => `Ошибка в экзамене. Вид задания: ${block}\nВопрос: ${m.q}\nОтвет ученика: ${m.y}\nВерный ответ: ${m.a}`
const byBlock = (list: ExamMistake[]) => {
  const m = new Map<string, ExamMistake[]>()
  for (const x of list) m.set(x.b, [...(m.get(x.b) ?? []), x])
  return [...m]
}
const summaryText = (a: ExamAttempt) =>
  a.passed
    ? 'Сдано: верных не меньше 85% и по каждому правилу не меньше 70%.'
    : a.right / a.total < EXAM_PASS
      ? `Не сдано: верных ${Math.round((a.right / a.total) * 100)}%, нужно ${Math.round(EXAM_PASS * 100)}%.`
      : `Не сдано: по некоторым правилам меньше ${Math.round(MIN_RULE * 100)}%. Они выделены красным ниже.`
</script>

<template>
  <div class="wrap ex">
    <SectionHead id="exam" :big="state === 'passed' ? 'сдано' : state === 'due' ? 'повтор' : undefined" />

    <!-- ПРОБНЫЙ БЛИЦ -->
    <template v-if="view === 'blitz' && blitz">
      <p class="intro">Блиц дня: около {{ BLITZ_POINTS }} пунктов из пройденного, {{ BLITZ_SECONDS / 60 }} минут. Набор один на день и меняется в полночь. Итог попадает в «Блицы по дням» на этом устройстве и на допуск к экзамену не влияет.</p>
      <p class="ex-timer" :class="{ low: left <= 30 }" role="timer" aria-live="off">{{ mmss(left) }}</p>
      <ExamRun ref="run" :key="'b' + blitz.endsAt" :blocks="blitz.blocks" :part="1" :parts="1" blitz @saved="blitzSaved" />
      <p class="ex-exit"><button class="ex-link" type="button" @click="exitBlitz">Выйти из блица (итог не запишется)</button></p>
    </template>

    <!-- ЧАСТЬ ЭКЗАМЕНА -->
    <template v-else-if="view === 'run' && ready">
      <template v-if="draft && blocks.length">
        <p class="intro">Итоговая оценка, часть {{ partNo }} из {{ EXAM_PARTS }}. Без подсказок и предметов Юны.</p>
        <ExamRun ref="run" :key="'p' + partNo + ':' + draft.startedAt" :blocks="blocks" :part="partNo" :parts="draft.parts.length" :initial="draft.partial?.part === partNo ? draft.partial.answers : undefined" @saved="saved" @pause="pause" />
        <p class="ex-exit"><button class="ex-link" type="button" :disabled="busy" @click="home">Выйти из экзамена (ответы этой части не сохранятся)</button></p>
      </template>
      <p v-else class="empty">Черновика экзамена нет. <button class="ex-link" type="button" @click="home">Назад</button></p>
    </template>

    <!-- РАЗБОР ПОПЫТОК -->
    <template v-else-if="view === 'log'">
      <p class="intro">Разбор последних попыток итогового экзамена: сколько верных по каждому правилу и что было неверно.</p>
      <p v-if="!attempts.length" class="empty">Попыток пока нет.</p>
      <details v-for="(a, i) in attempts" :key="a.at" class="ex-att" :open="i === 0">
        <summary>
          <b>{{ when(a.at) }}</b>
          <span class="ex-att-score">{{ a.right }} из {{ a.total }} · {{ Math.round((a.right / a.total) * 100) }}%</span>
          <span class="ex-state" :class="a.passed ? 'okc' : 'badc'">{{ a.passed ? 'сдано' : 'не сдано' }}</span>
        </summary>
        <div v-if="a.rules && Object.keys(a.rules).length" class="ex-rules">
          <div v-for="r in ruleRows(a.rules)" :key="r.id" class="ex-rule" :class="tone(r.share)">
            <span>{{ r.label }}</span><b>{{ r.ok }} из {{ r.total }}</b>
            <i :style="{ width: Math.round(r.share * 100) + '%' }"></i>
          </div>
        </div>
        <p v-if="!a.mistakes.length" class="ex-none">Ошибок в этой попытке не сохранилось (или их не было).</p>
        <section v-for="[title, list] in byBlock(a.mistakes)" :key="title" class="ex-bl">
          <h3>{{ title }} <small>{{ list.length }}</small></h3>
          <p v-if="/порядк/i.test(title)" class="ex-note">Засчитывается порядок слов из предложения на сайте. В корейском возможен и другой порядок: это не правило, а проверка одного варианта.</p>
          <ul>
            <li v-for="(m, k) in list" :key="k">
              <div class="ko ex-q">{{ m.q }}</div>
              <div class="ex-ans"><span class="bad">Твой ответ: <b class="ko">{{ m.y }}</b></span><span class="ok">Верно: <b class="ko">{{ m.a }}</b></span></div>
              <AskAi :context="mistakeContext(title, m)" :quick="EXAM_QUICK" placeholder="Спроси про эту ошибку…" />
            </li>
          </ul>
        </section>
      </details>
      <p class="ex-exit"><button class="ex-link" type="button" @click="home">← Назад</button></p>
    </template>

    <!-- ГЛАВНАЯ СТРАНИЦА ЭКЗАМЕНОВ: четыре вкладки -->
    <template v-else>
      <div class="ex-tabs" role="tablist">
        <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" class="ex-tab" :class="{ on: tab === t.id }" @click="setTab(t.id)">
          <b>{{ t.label }}</b><small>{{ t.sub }}</small>
        </button>
      </div>

      <!-- ВКЛАДКА: БЛИЦ ДНЯ -->
      <div v-show="tab === 'blitz'">
        <section class="ex-card ex-blitz">
          <h2>Блиц дня на {{ BLITZ_SECONDS / 60 }} минут</h2>
          <p class="ex-sub">Около {{ BLITZ_POINTS }} пунктов из пройденного. Набор один на день и меняется в полночь; чаще попадаются темы, где вы ошибались.</p>
          <p class="ex-streak"><b>Серия: {{ streak }} {{ streak % 10 === 1 && streak !== 11 ? 'день' : [2, 3, 4].includes(streak % 10) && ![12, 13, 14].includes(streak) ? 'дня' : 'дней' }} подряд</b><template v-if="blitzToday"> · сегодня {{ blitzToday.right }} из {{ blitzToday.total }}</template></p>
          <div class="ex-btns">
            <button class="rs-start ex-btn" type="button" :disabled="!ready" @click="startBlitz">{{ blitzToday ? 'Ещё раз' : 'Начать блиц' }}</button>
          </div>
        </section>
      <!-- итог пробного блица (нигде не записан) -->
        <section v-if="blitzDone" class="ex-card" :class="blitzDone.right / blitzDone.total >= EXAM_PASS ? 'okc' : 'badc'">
          <h2>Блиц: {{ blitzDone.right }} из {{ blitzDone.total }} ({{ Math.round((blitzDone.right / blitzDone.total) * 100) }}%)</h2>
          <p class="ex-sub">Итог записан в «Блицы по дням» (в историю экзамена не идёт). Для экзамена нужно не меньше {{ Math.round(EXAM_PASS * 100) }}%.</p>
          <div class="ex-rules">
            <div v-for="r in ruleRows(blitzDone.rules)" :key="r.id" class="ex-rule" :class="tone(r.share)">
              <span>{{ r.label }}</span><b>{{ r.ok }} из {{ r.total }} · {{ pct(r) }}%</b>
              <i :style="{ width: pct(r) + '%' }"></i>
            </div>
          </div>
          <section v-for="[title, list] in byBlock(blitzDone.mistakes)" :key="title" class="ex-bl">
            <h3>{{ title }} <small>{{ list.length }}</small></h3>
            <ul>
              <li v-for="(m, k) in list" :key="k">
                <div class="ko ex-q">{{ m.q }}</div>
                <div class="ex-ans"><span class="bad">Твой ответ: <b class="ko">{{ m.y }}</b></span><span class="ok">Верно: <b class="ko">{{ m.a }}</b></span></div>
                <AskAi :context="mistakeContext(title, m)" :quick="EXAM_QUICK" placeholder="Спроси про эту ошибку…" />
              </li>
            </ul>
          </section>
        </section>

      <section v-if="blitzLog.length" class="ex-card">
          <h2>Блицы по дням</h2>
          <p v-for="b in blitzLog.slice(0, 10)" :key="b.day" class="ex-sub">{{ b.day }}: {{ b.right }} из {{ b.total }} ({{ Math.round((b.right / b.total) * 100) }}%)</p>
        </section>

      </div>

      <!-- ВКЛАДКА: ЭКЗАМЕН ЕДИНИЦЫ -->
      <ExamUnits v-if="tab === 'units'" />

      <!-- ВКЛАДКА: ПРОБНИК TOPIK I -->
      <TopikView v-if="tab === 'topik'" />

      <!-- ВКЛАДКА: БОЛЬШОЙ ЭКЗАМЕН -->
      <div v-show="tab === 'big'">
      <p class="intro">
        Один большой экзамен по всему пройденному: {{ EXAM_PARTS }} части, около {{ draft ? total : EXAM_POINTS_APPROX }} пунктов (текст с пропусками плитками, ввод частиц, перевод, порядок слов, поиск ошибок, связка и отрицание, «есть / нет» и слова положения, формы глаголов).
        Без подсказок. После каждой части можно остановиться: ответы сохраняются. Сдан, если верных не меньше {{ Math.round(EXAM_PASS * 100) }}% и по каждому правилу не меньше {{ Math.round(MIN_RULE * 100) }}%.
        Не сдал: пересдача через сутки. Сдал: через {{ RECHECK_DAYS }} дней придёт напоминание подтвердить.
      </p>

      <!-- только что законченная попытка -->
      <section v-if="finished" class="ex-card" :class="finished.attempt.passed ? 'okc' : 'badc'">
        <h2>{{ finished.attempt.passed ? 'Экзамен сдан' : 'Экзамен не сдан' }}: {{ finished.attempt.right }} из {{ finished.attempt.total }} ({{ Math.round((finished.attempt.right / finished.attempt.total) * 100) }}%)</h2>
        <p>{{ summaryText(finished.attempt) }}</p>
        <div class="ex-rules">
          <div v-for="r in ruleRows(finished.attempt.rules)" :key="r.id" class="ex-rule" :class="tone(r.share)">
            <span>{{ r.label }}</span><b>{{ r.ok }} из {{ r.total }} · {{ pct(r) }}%</b>
            <i :style="{ width: pct(r) + '%' }"></i>
          </div>
        </div>
        <p v-if="!finished.attempt.passed" class="ex-hint">Слабые правила можно потренировать: «Потренировать правило» на странице грамматики и «Тексты по правилу» в играх. Пересдача через сутки.</p>
        <section v-for="[title, list] in byBlock(finished.attempt.mistakes)" :key="title" class="ex-bl">
          <h3>{{ title }} <small>{{ list.length }}</small></h3>
          <p v-if="/порядк/i.test(title)" class="ex-note">Засчитывается порядок слов из предложения на сайте. В корейском возможен и другой порядок: это не правило, а проверка одного варианта.</p>
          <ul>
            <li v-for="(m, k) in list" :key="k">
              <div class="ko ex-q">{{ m.q }}</div>
              <div class="ex-ans"><span class="bad">Твой ответ: <b class="ko">{{ m.y }}</b></span><span class="ok">Верно: <b class="ko">{{ m.a }}</b></span></div>
              <AskAi :context="mistakeContext(title, m)" :quick="EXAM_QUICK" placeholder="Спроси про эту ошибку…" />
            </li>
          </ul>
        </section>
      </section>

      <!-- прошлый результат и разбивка по правилам -->
      <section v-else-if="row" class="ex-card" :class="row.passed ? 'okc' : 'badc'">
        <h2>Последний результат: {{ Math.round(row.last * 100) }}% <span class="ex-state" :class="row.passed ? 'okc' : 'badc'">{{ STATE_LABEL[state] }}</span></h2>
        <p class="ex-sub">Лучший {{ Math.round(row.best * 100) }}% · попыток {{ row.tries }} · {{ date(row.at) }}<template v-if="row.dueAt && state === 'passed'"> · подтвердить до {{ date(row.dueAt) }}</template></p>
        <div v-if="Object.keys(row.rules ?? {}).length" class="ex-rules">
          <div v-for="r in ruleRows(row.rules)" :key="r.id" class="ex-rule" :class="tone(r.share)">
            <span>{{ r.label }}</span><b>{{ r.ok }} из {{ r.total }} · {{ pct(r) }}%</b>
            <i :style="{ width: pct(r) + '%' }"></i>
          </div>
        </div>
        <p v-if="examWeakCards(row.rules).length" class="ex-sub"><RouterLink :to="{ path: '/game/home', query: { game: 'rule', weak: '1' } }">Потренировать слабые места →</RouterLink></p>
      </section>

      <!-- черновик -->
      <section v-if="draft" class="ex-card">
        <h2>Экзамен начат: сохранено частей {{ savedParts }} из {{ draft.parts.length }}</h2>
        <p class="ex-sub">Следующая: часть {{ nextPart }} ({{ partPoints(draft.parts[nextPart - 1] ?? []) }} пунктов). Нужно будет набрать {{ examNeed(total) }} из {{ total }}.<template v-if="draft.partial"> Ответы в части {{ draft.partial.part }} уже частично сохранены.</template></p>
      </section>

      <div v-if="dev && draft" class="ex-btns">
        <button v-for="p in draft.parts.length" :key="p" class="rs-start ex-btn soft" type="button" @click="void router.push({ query: { part: String(p) } })">Часть {{ p }}{{ draft.results[p - 1] ? ' ✓' : '' }} (локально)</button>
      </div>
      <div class="ex-btns">
        <button v-if="draft" class="rs-start ex-btn" :disabled="busy" @click="continueExam">Продолжить с части {{ nextPart }}</button>
        <button class="rs-start ex-btn" :class="{ soft: !!draft }" :disabled="busy || waitMs > 0 || !ready" @click="startNew">
          {{ waitMs > 0 ? waitText : draft ? 'Начать заново' : row ? 'Пересдать' : 'Начать экзамен' }}
        </button>
        <button v-if="row" type="button" class="ex-link" @click="openLog">Разбор попыток и ошибок</button>
      </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ex-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0 16px; }
.ex-tab { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: inherit; font: inherit; text-align: left; cursor: pointer; }
.ex-tab small { color: var(--muted); font-size: 12px; }
.ex-tab.on { border-color: var(--gold); background: var(--gold-soft); }
.ex-streak { margin: 8px 0; font-size: 15px; }
.intro { max-width: 820px; margin: 14px 0 18px; color: var(--muted); line-height: 1.5; }
.empty { color: var(--muted); }
.ex-card { margin: 14px 0; padding: 18px 22px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.ex-card.okc { border-color: #3aa660; }
.ex-card.badc { border-color: #d64d6a; }
.ex-card h2 { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 0 0 6px; font-size: 19px; }
.ex-sub { margin: 0 0 12px; color: var(--muted); font-size: 14px; }
.ex-hint { margin: 12px 0 0; color: var(--muted); font-size: 14px; }
.ex-state { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 14px; border-radius: 999px; background: rgba(120, 99, 255, .12); color: #4a3fb3; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.ex-state.okc { background: #dff6e6; color: #1d6b3a; }
.ex-state.badc { background: #ffe1e6; color: #a1233c; }
.ex-rules { display: grid; gap: 10px; margin: 12px 0 4px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 760px) { .ex-rules { grid-template-columns: 1fr; } }
.ex-rule { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; overflow: hidden; border: 1px solid var(--line); border-radius: 12px; font-size: 15px; }
.ex-rule i { position: absolute; left: 0; bottom: 0; height: 4px; background: var(--pink, #d64da9); border-radius: 0 4px 0 0; }
.ex-rule.own i { background: #3aa660; }
.ex-rule.mid i { background: #e0a020; }
.ex-rule.weak { border-color: #d64d6a; background: #ffeef1; }
.ex-rule.weak i { background: #d64d6a; }
.ex-exit { margin: 8px 0 24px; }
.ex-timer { position: sticky; top: 8px; z-index: 2; width: max-content; margin: 0 0 12px; padding: 6px 18px; font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); }
.ex-timer.low { color: var(--bad); border-color: var(--bad); }
.ex-btns { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin: 18px 0; }
.ex-btn { box-sizing: border-box; height: 48px; margin: 0; padding: 0 26px; white-space: nowrap; }
.ex-link { padding: 0; border: 0; background: none; color: var(--link, #1f82ae); font-size: 14px; cursor: pointer; }
.ex-link:hover { text-decoration: underline; }
.ex-att { margin: 12px 0; padding: 14px 20px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.ex-att > summary { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; cursor: pointer; list-style-position: inside; }
.ex-att-score { color: var(--muted); }
.ex-none { color: var(--muted); }
.ex-bl h3 { margin: 16px 0 6px; font-size: 16px; }
.ex-bl h3 small { color: var(--muted); font-weight: 500; }
.ex-bl ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px 32px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 900px) { .ex-bl ul { grid-template-columns: 1fr; } }
.ex-note { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
.ex-bl li { padding: 10px 14px; border-radius: 14px; background: rgba(120, 99, 255, .06); }
.ex-q { font-size: 18px; margin-bottom: 4px; }
.ex-ans { display: grid; gap: 2px; font-size: 14px; }
.ex-ans .bad { color: #a1233c; }
.ex-ans .ok { color: #1d6b3a; }
</style>
