<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { dragDrop } from '@/lib/dragdrop'
import { useProgressStore } from '@/stores/progress'
import { shuffle } from '@/game/util'
import type { VlogLine } from '@/data/korean/vlogs'
import {
  VLOG_TEST,
  isPassed,
  orderScore,
  pickPairs,
  pickQuiz,
  shuffledOrder,
  storyLines,
  PASS,
  type ShownQ,
} from '@/data/korean/vlog-test'

/**
 * Тест по влогу: четыре блока одним заходом (вопросы, слова-пары, рассказ с пропусками, порядок событий), в конце общий балл и разбор ошибок.
 * Проверка в конце каждого блока; перетаскивание только через `lib/dragdrop.ts`, у всего, что тянут, `touch-action: none`.
 */
const props = defineProps<{ vlogId: string; lines: VlogLine[]; words: { k: string; t: string }[] }>()
const emit = defineEmits<{ finish: [r: { score: number; total: number; passed: boolean; blocks: { id: string; score: number; total: number }[] }] }>()

type Phase = 'intro' | 'quiz' | 'words' | 'story' | 'order' | 'result'
const phase = ref<Phase>('intro')
const data = computed(() => VLOG_TEST[props.vlogId])
const progress = useProgressStore()

// ——— вопросы ———
const quiz = ref<ShownQ[]>([])
const answers = ref<number[]>([])

// ——— слова ———
const pairs = ref<{ k: string; t: string }[]>([])
const colL = ref<string[]>([])
const colR = ref<string[]>([])
const selL = ref('')
const selR = ref('')
const matched = ref<Set<string>>(new Set())
const wrongPairs = ref<Set<string>>(new Set())
const flash = ref('')

// ——— рассказ ———
const gapWords = computed(() => data.value?.story.gaps ?? [])
const story = computed(() => (data.value ? storyLines(props.lines, data.value.story) : []))
const bank = ref<string[]>([])
/** что стоит в пропуске: номер пропуска → слово из банка (или '') */
const placed = ref<string[]>([])
const tileSel = ref('')

// ——— порядок ———
const order = ref<number[]>([])

function start() {
  const d = data.value
  if (!d) return
  quiz.value = pickQuiz(d.quiz)
  answers.value = quiz.value.map(() => -1)
  pairs.value = pickPairs(props.words)
  colL.value = shuffle(pairs.value.map(p => p.k))
  colR.value = shuffle(pairs.value.map(p => p.k))
  selL.value = selR.value = ''
  matched.value = new Set()
  wrongPairs.value = new Set()
  bank.value = shuffle(d.story.gaps)
  placed.value = d.story.gaps.map(() => '')
  tileSel.value = ''
  order.value = shuffledOrder(d.events.length)
  phase.value = 'quiz'
}

function next() {
  const flow: Phase[] = ['quiz', ...(pairs.value.length ? (['words'] as Phase[]) : []), 'story', 'order', 'result']
  phase.value = flow[flow.indexOf(phase.value) + 1]!
  if (phase.value === 'result') finish()
}

// ——— пары: нажать русское и корейское слово ———
const ruOf = (k: string) => pairs.value.find(p => p.k === k)?.t ?? ''
function tapPair() {
  if (!selL.value || !selR.value) return
  const l = selL.value
  const r = selR.value
  if (l === r) {
    // слово засчитывается в общий прогресс (+1), если в этом блоке в нём не ошибались; режим как у «Найди пару»
    if (!wrongPairs.value.has(l)) progress.record({ word: l, ok: true, source: 'trainer', mode: 'match' })
    matched.value = new Set([...matched.value, l])
  } else {
    progress.record({ word: l, ok: false, source: 'trainer', mode: 'match' })
    wrongPairs.value = new Set([...wrongPairs.value, l, r])
    flash.value = `${l}|${r}`
    setTimeout(() => (flash.value = ''), 600)
  }
  selL.value = selR.value = ''
}
function pickL(k: string) {
  if (matched.value.has(k)) return
  selL.value = selL.value === k ? '' : k
  tapPair()
}
function pickR(k: string) {
  if (matched.value.has(k)) return
  selR.value = selR.value === k ? '' : k
  tapPair()
}
const wordsDone = computed(() => pairs.value.length > 0 && matched.value.size === pairs.value.length)

// ——— рассказ: плитка в пропуск перетаскиванием или нажатием ———
const bankLeft = computed(() => bank.value.filter(w => !placed.value.includes(w)))
function putTile(word: string, gap: number) {
  const next = placed.value.map(p => (p === word ? '' : p))
  next[gap] = word
  placed.value = next
  tileSel.value = ''
}
function tapGap(gap: number) {
  if (placed.value[gap]) {
    const next = [...placed.value]
    next[gap] = ''
    placed.value = next
  } else if (tileSel.value) putTile(tileSel.value, gap)
}
const tapTile = (w: string) => (tileSel.value = tileSel.value === w ? '' : w)

// ——— порядок событий: перетаскивание строки на другую строку или кнопки «выше/ниже» ———
function move(from: number, to: number) {
  if (to < 0 || to >= order.value.length || from === to) return
  const next = [...order.value]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item!)
  order.value = next
}

let stopDrag = () => {}
const root = ref<HTMLElement>()
async function setupDrag() {
  stopDrag()
  stopDrag = () => {}
  await nextTick()
  const el = root.value
  if (!el) return
  if (phase.value === 'story') {
    stopDrag = dragDrop({
      tiles: el.querySelectorAll('.vt-tile'),
      targets: () => el.querySelectorAll('.vt-gap'),
      onDrop: (tile, target) => putTile(tile.dataset.w ?? '', Number(target.dataset.g)),
    })
  } else if (phase.value === 'order') {
    stopDrag = dragDrop({
      tiles: el.querySelectorAll('.vt-ev'),
      targets: () => el.querySelectorAll('.vt-ev'),
      handle: '.vt-grip',
      onDrop: (tile, target) => move(Number(tile.dataset.pos), Number(target.dataset.pos)),
    })
  }
}
watch([phase, bankLeft, order], () => void setupDrag(), { flush: 'post' })
onBeforeUnmount(() => stopDrag())

// ——— итог ———
const quizScore = computed(() => quiz.value.filter((q, i) => answers.value[i] === q.correct).length)
const wordsScore = computed(() => pairs.value.filter(p => !wrongPairs.value.has(p.k)).length)
const storyScore = computed(() => gapWords.value.filter((w, i) => placed.value[i] === w).length)
const orderPoints = computed(() => orderScore(order.value))
const blocks = computed(() => [
  { id: 'quiz', name: 'Понимание', score: quizScore.value, total: quiz.value.length },
  ...(pairs.value.length ? [{ id: 'words', name: 'Слова', score: wordsScore.value, total: pairs.value.length }] : []),
  { id: 'story', name: 'Рассказ', score: storyScore.value, total: gapWords.value.length },
  { id: 'order', name: 'Порядок', score: orderPoints.value, total: order.value.length },
])
const score = computed(() => blocks.value.reduce((a, b) => a + b.score, 0))
const total = computed(() => blocks.value.reduce((a, b) => a + b.total, 0))
const passed = computed(() => isPassed(score.value, total.value))
const percent = computed(() => (total.value ? Math.round((score.value / total.value) * 100) : 0))
function finish() {
  emit('finish', { score: score.value, total: total.value, passed: passed.value, blocks: blocks.value.map(b => ({ id: b.id, score: b.score, total: b.total })) })
}
const lineOf = (i: number) => props.lines[i]
const wrongQuiz = computed(() => quiz.value.map((q, i) => ({ q, a: answers.value[i]! })).filter(x => x.a !== x.q.correct))
const wrongGaps = computed(() => gapWords.value.map((w, i) => ({ w, got: placed.value[i] ?? '' })).filter(x => x.got !== x.w))
const correctOrder = computed(() => data.value?.events ?? [])
</script>

<template>
  <div ref="root" class="vt">
    <template v-if="data">
      <section v-if="phase === 'intro'" class="vt-box">
        <h3>Тест по влогу</h3>
        <p>Четыре блока подряд: вопросы по содержанию, слова, рассказ с пропусками и порядок событий. В конце общий результат и разбор ошибок. Проходной балл {{ Math.round(PASS * 100) }}%.</p>
        <p class="vt-dim">Вопросы каждый раз немного другие. Текст влога здесь скрыт.</p>
        <button type="button" class="vt-btn main" @click="start">Начать</button>
      </section>

      <section v-else-if="phase === 'quiz'" class="vt-box">
        <h3>1. Проверь понимание</h3>
        <div v-for="(q, i) in quiz" :key="i" class="vt-q">
          <p class="vt-qt">{{ i + 1 }}. {{ q.q }}</p>
          <div class="vt-opts">
            <button v-for="(o, j) in q.options" :key="j" type="button" class="vt-opt" :class="{ on: answers[i] === j }" :aria-pressed="answers[i] === j" @click="answers[i] = j">{{ o }}</button>
          </div>
        </div>
        <button type="button" class="vt-btn main" @click="next">Дальше</button>
      </section>

      <section v-else-if="phase === 'words'" class="vt-box">
        <h3>2. Соедини слова</h3>
        <p class="vt-dim">Нажми русское слово, потом корейское. Верная пара остаётся, ошибка засчитывается.</p>
        <div class="vt-cols">
          <div class="vt-col">
            <button v-for="k in colL" :key="k" type="button" class="vt-w" :class="{ on: selL === k, done: matched.has(k), bad: flash.startsWith(k + '|') }" :disabled="matched.has(k)" @click="pickL(k)">{{ ruOf(k) }}</button>
          </div>
          <div class="vt-col">
            <button v-for="k in colR" :key="k" type="button" class="vt-w" lang="ko" :class="{ on: selR === k, done: matched.has(k), bad: flash.endsWith('|' + k) }" :disabled="matched.has(k)" @click="pickR(k)">{{ k }}</button>
          </div>
        </div>
        <p class="vt-dim">Соединено {{ matched.size }} из {{ pairs.length }}.</p>
        <button type="button" class="vt-btn main" :disabled="!wordsDone" @click="next">Дальше</button>
      </section>

      <section v-else-if="phase === 'story'" class="vt-box">
        <h3>3. Собери рассказ</h3>
        <p class="vt-dim">{{ data.story.summary }}</p>
        <p class="vt-dim">Перетащи слово в пропуск или нажми слово, а потом пропуск. Нажатие на заполненный пропуск возвращает слово.</p>
        <div class="vt-story" lang="ko">
          <p v-for="(ln, i) in story" :key="i">
            <template v-for="(p, j) in ln" :key="j">
              <button v-if="'gap' in p" type="button" class="vt-gap" :class="{ full: placed[p.gap] }" :data-g="p.gap" @click="tapGap(p.gap)">{{ placed[p.gap] || '＿＿＿' }}</button>
              <template v-else>{{ p.t }}</template>
            </template>
          </p>
        </div>
        <div class="vt-bank" lang="ko">
          <button v-for="w in bankLeft" :key="w" type="button" class="vt-tile" :class="{ on: tileSel === w }" :data-w="w" :aria-pressed="tileSel === w" @click="tapTile(w)">{{ w }}</button>
        </div>
        <button type="button" class="vt-btn main" @click="next">Проверить и дальше</button>
      </section>

      <section v-else-if="phase === 'order'" class="vt-box">
        <h3>4. Восстанови последовательность</h3>
        <p class="vt-dim">Расставь события в том порядке, в каком они были во влоге: тяни за ручку ⋮⋮ или нажимай «выше» и «ниже».</p>
        <ol class="vt-evs">
          <li v-for="(e, pos) in order" :key="e" class="vt-ev" :data-pos="pos">
            <span class="vt-grip" aria-hidden="true">⋮⋮</span>
            <span class="vt-et">{{ correctOrder[e]!.text }}</span>
            <button type="button" class="vt-mv" :disabled="pos === 0" aria-label="выше" @click="move(pos, pos - 1)">выше</button>
            <button type="button" class="vt-mv" :disabled="pos === order.length - 1" aria-label="ниже" @click="move(pos, pos + 1)">ниже</button>
          </li>
        </ol>
        <button type="button" class="vt-btn main" @click="next">Проверить и закончить</button>
      </section>

      <section v-else class="vt-box" aria-live="polite">
        <h3>Результат: {{ score }} из {{ total }} ({{ percent }}%)</h3>
        <p class="vt-res" :class="passed ? 'ok' : 'bad'">{{ passed ? 'Сдано' : `Не сдано: нужно ${Math.round(PASS * 100)}%` }}</p>
        <ul class="vt-blocks">
          <li v-for="b in blocks" :key="b.id"><b>{{ b.name }}</b> {{ b.score }} из {{ b.total }}</li>
        </ul>

        <template v-if="wrongQuiz.length">
          <h4>Вопросы с ошибками</h4>
          <div v-for="(x, i) in wrongQuiz" :key="i" class="vt-err">
            <p class="vt-qt">{{ x.q.q }}</p>
            <p>Твой ответ: <b>{{ x.a >= 0 ? x.q.options[x.a] : 'нет ответа' }}</b>. Верно: <b>{{ x.q.options[x.q.correct] }}</b></p>
            <p v-if="lineOf(x.q.line)" class="vt-dim"><span lang="ko">{{ lineOf(x.q.line)!.ko }}</span><br />{{ lineOf(x.q.line)!.ru }}</p>
          </div>
        </template>

        <template v-if="pairs.length && wrongPairs.size">
          <h4>Слова с ошибками</h4>
          <ul class="vt-list"><li v-for="p in pairs.filter(x => wrongPairs.has(x.k))" :key="p.k"><span lang="ko">{{ p.k }}</span> = {{ p.t }}</li></ul>
        </template>

        <template v-if="wrongGaps.length">
          <h4>Рассказ: пропуски с ошибками</h4>
          <ul class="vt-list"><li v-for="x in wrongGaps" :key="x.w">верно <b lang="ko">{{ x.w }}</b>, у тебя {{ x.got ? x.got : 'пусто' }}</li></ul>
        </template>

        <template v-if="orderPoints < order.length">
          <h4>Правильный порядок событий</h4>
          <ol class="vt-list"><li v-for="e in correctOrder" :key="e.line">{{ e.text }}</li></ol>
        </template>

        <button type="button" class="vt-btn main" @click="start">Пройти ещё раз</button>
      </section>
    </template>
    <p v-else class="vt-dim">Задания для этого влога готовятся.</p>
  </div>
</template>

<style scoped>
.vt-box { margin-top: 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
.vt-box h3 { margin: 0 0 8px; font-size: 19px; }
.vt-box h4 { margin: 16px 0 6px; font-size: 16px; }
.vt-dim { margin: 6px 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
.vt-btn { margin-top: 14px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--ink); padding: 8px 18px; font: inherit; font-size: 14.5px; cursor: pointer; }
.vt-btn.main { background: var(--gold-soft); border-color: var(--gold); font-weight: 600; }
.vt-btn:disabled { opacity: .5; cursor: default; }
.vt-q { margin-top: 12px; }
.vt-qt { margin: 0 0 6px; font-weight: 600; }
.vt-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.vt-opt { border: 1px solid var(--line); border-radius: 12px; background: transparent; color: var(--ink); padding: 7px 14px; font: inherit; font-size: 14.5px; cursor: pointer; }
.vt-opt.on { border-color: var(--ink); background: var(--gold-soft); font-weight: 600; }
.vt-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
.vt-col { display: grid; gap: 8px; align-content: start; }
.vt-w { border: 1px solid var(--line); border-radius: 12px; background: transparent; color: var(--ink); padding: 9px 12px; font: inherit; font-size: 15px; cursor: pointer; text-align: left; }
.vt-w.on { border-color: var(--accent); background: rgba(150, 190, 255, .22); }
.vt-w.done { border-color: var(--ok); background: var(--ok-bg); opacity: .75; }
.vt-w.bad { border-color: #d6455d; }
.vt-story { margin-top: 10px; font-size: 18px; line-height: 2.2; }
.vt-story p { margin: 0 0 4px; }
.vt-gap { min-width: 74px; border: 2px dashed var(--accent); border-radius: 10px; background: transparent; color: var(--ink); padding: 1px 8px; font: inherit; cursor: pointer; }
.vt-gap.full { border-style: solid; background: rgba(150, 190, 255, .16); }
.vt-gap.drop-over { background: rgba(150, 190, 255, .35); }
.vt-bank { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; min-height: 44px; }
.vt-tile { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); color: var(--ink); padding: 7px 14px; font: inherit; font-size: 17px; cursor: grab; touch-action: none; }
.vt-tile.on { border-color: var(--ink); background: var(--gold-soft); }
.vt-tile.dragging { z-index: 20; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); }
.vt-evs { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
.vt-ev { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.vt-ev.drop-over { border-color: var(--accent); background: rgba(150, 190, 255, .2); }
.vt-ev.dragging { z-index: 20; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); }
.vt-grip { color: var(--muted); cursor: grab; touch-action: none; user-select: none; padding: 4px 6px; }
.vt-et { flex: 1; font-size: 15px; }
.vt-mv { border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); padding: 3px 10px; font: inherit; font-size: 12.5px; cursor: pointer; }
.vt-mv:disabled { opacity: .4; cursor: default; }
.vt-res { font-size: 18px; font-weight: 700; margin: 4px 0; }
.vt-res.ok { color: var(--ok); }
.vt-res.bad { color: #d6455d; }
.vt-blocks, .vt-list { margin: 6px 0 0; padding-left: 20px; display: grid; gap: 4px; font-size: 15px; }
.vt-err { margin-top: 8px; padding: 8px 12px; border: 1px solid var(--line-soft); border-radius: 12px; }
.vt-err p { margin: 2px 0; font-size: 14.5px; }
@media (max-width: 520px) { .vt-cols { gap: 8px; } .vt-ev { flex-wrap: wrap; } }
</style>
