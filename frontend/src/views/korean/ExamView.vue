<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import ExamRun from '@/components/korean/ExamRun.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { askConfirm } from '@/composables/useConfirm'
import {
  EXAM_ID, EXAM_PARTS, EXAM_PASS, EXAM_POINTS_APPROX, MIN_RULE, OWN_RULE, RECHECK_DAYS,
  examParts, examPassed, examNeed, examState, examTotal, examWeakCards, partPoints, ruleLabel, summarize,
  type ExamAttempt, type ExamDraft, type ExamMistake, type PartAnswers, type ExamResultRow, type PointResult, type RuleScores,
} from '@/data/korean/exam'
import { useExamStore } from '@/stores/exam'
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
const now = ref(Date.now())
/** Итог только что законченной попытки (показывается сразу, потом доступен в разборе попыток). */
const finished = ref<{ attempt: ExamAttempt; row?: ExamResultRow } | null>(null)
const attempts = ref<ExamAttempt[]>([])

let clock: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  now.value = Date.now()
  clock = setInterval(() => (now.value = Date.now()), 60_000)
  await Promise.all([exams.load(), exams.loadDraft().then(d => (draft.value = d))])
  if (view.value === 'log') await loadLog()
  ready.value = true
})
onBeforeUnmount(() => clearInterval(clock))

const view = computed(() => (route.query.view === 'log' ? 'log' : route.query.part ? 'run' : 'home'))
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
function home() {
  void router.push({ query: {} })
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

    <!-- ЧАСТЬ ЭКЗАМЕНА -->
    <template v-if="view === 'run' && ready">
      <template v-if="draft && blocks.length">
        <p class="intro">Итоговая оценка, часть {{ partNo }} из {{ EXAM_PARTS }}. Без подсказок и предметов Юны.</p>
        <ExamRun :key="'p' + partNo + ':' + draft.startedAt" :blocks="blocks" :part="partNo" :parts="draft.parts.length" :initial="draft.partial?.part === partNo ? draft.partial.answers : undefined" @saved="saved" @pause="pause" />
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
            </li>
          </ul>
        </section>
      </details>
      <p class="ex-exit"><button class="ex-link" type="button" @click="home">← Назад</button></p>
    </template>

    <!-- ГЛАВНАЯ СТРАНИЦА ЭКЗАМЕНА -->
    <template v-else>
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
    </template>
  </div>
</template>

<style scoped>
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
