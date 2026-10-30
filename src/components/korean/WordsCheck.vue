<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TRANSLATIONS } from '@/data/korean/translations'
import { D, type Word } from '@/data/korean/words'
import { shuffle, short } from '@/data/korean/tasks'
import { useProgressStore } from '@/stores/progress'

/** Проверка слов дня тремя играми подряд: пары, перевод, собери предложение. Итог уходит наверх, чтобы попасть в сохранённый набор. */
export interface WordsCheckResult {
  pairs: { right: number; total: number }
  quiz: { right: number; total: number }
  build: { right: number; total: number }
}

const props = defineProps<{ words: Word[] }>()
const emit = defineEmits<{ done: [result: WordsCheckResult]; cancel: [] }>()
const progress = useProgressStore()

type Stage = 'pairs' | 'quiz' | 'build' | 'end'
const stage = ref<Stage>('pairs')
const rec = (word: string, ok: boolean, mode: string) => progress.record({ word, ok, source: 'today', mode })

/* ---------- 1. пары ---------- */
const left = ref(shuffle(props.words))
const right = ref(shuffle(props.words))
const selL = ref<number | null>(null)
const selR = ref<number | null>(null)
const matched = ref(new Set<number>())
const missed = ref(new Set<number>())
const wrong = ref(false)
const pairs = computed(() => ({ right: matched.value.size - [...matched.value].filter(n => missed.value.has(n)).length, total: props.words.length }))

function pick(side: 'l' | 'r', n: number) {
  if (matched.value.has(n) || wrong.value) return
  if (side === 'l') selL.value = n
  else selR.value = n
  if (selL.value === null || selR.value === null) return
  const l = selL.value
  const r = selR.value
  selL.value = selR.value = null
  const w = props.words.find(x => x.n === l)!
  if (l === r) {
    rec(w.k, !missed.value.has(l), 'check-pairs')
    matched.value = new Set(matched.value).add(l)
    if (matched.value.size === props.words.length) setTimeout(() => (stage.value = 'quiz'), 500)
  } else {
    missed.value = new Set(missed.value).add(l)
    wrong.value = true
    setTimeout(() => (wrong.value = false), 450)
  }
}

/* ---------- 2. перевод ---------- */
const SIMPLE = D.filter(d => /^[가-힣]+$/.test(d.k))
const quizItems = props.words.map(w => ({ w, options: shuffle([short(w.t), ...shuffle(SIMPLE.map(x => short(x.t)).filter(t => t !== short(w.t))).slice(0, 3)]) }))
const qi = ref(0)
const qPicked = ref<string | null>(null)
const qRight = ref(0)
const q = computed(() => quizItems[qi.value]!)

function answerQuiz(o: string) {
  if (qPicked.value !== null) return
  qPicked.value = o
  const ok = o === short(q.value.w.t)
  if (ok) qRight.value++
  rec(q.value.w.k, ok, 'check-quiz')
  setTimeout(() => {
    qPicked.value = null
    if (qi.value + 1 < quizItems.length) qi.value++
    else stage.value = buildItems.length ? 'build' : 'end'
  }, ok ? 600 : 1300)
}

/* ---------- 3. собери предложение ---------- */
const buildItems = shuffle(props.words.filter(w => TRANSLATIONS[w.s] && w.s.split(/\s+/).length >= 3 && w.s.split(/\s+/).length <= 7)).slice(0, 3).map(w => ({
  w,
  tokens: w.s.split(/\s+/),
  ru: TRANSLATIONS[w.s]!,
}))
const bi = ref(0)
const chosen = ref<number[]>([])
const bank = ref<number[]>([])
const bState = ref<'play' | 'ok' | 'bad'>('play')
const bRight = ref(0)
const b = computed(() => buildItems[bi.value]!)

function startBuild() {
  chosen.value = []
  bState.value = 'play'
  bank.value = shuffle(b.value.tokens.map((_, i) => i))
}
const built = computed(() => chosen.value.map(i => b.value.tokens[i]!))

function take(i: number) {
  if (bState.value !== 'play') return
  chosen.value = [...chosen.value, i]
  bank.value = bank.value.filter(x => x !== i)
  if (bank.value.length) return
  const ok = built.value.join(' ') === b.value.tokens.join(' ')
  bState.value = ok ? 'ok' : 'bad'
  if (ok) bRight.value++
  rec(b.value.w.k, ok, 'check-build')
}
function back(i: number) {
  if (bState.value !== 'play') return
  chosen.value = chosen.value.filter(x => x !== i)
  bank.value = [...bank.value, i]
}
function nextBuild() {
  if (bi.value + 1 < buildItems.length) {
    bi.value++
    startBuild()
  } else stage.value = 'end'
}

const result = computed<WordsCheckResult>(() => ({ pairs: pairs.value, quiz: { right: qRight.value, total: quizItems.length }, build: { right: bRight.value, total: buildItems.length } }))
function finish() {
  emit('done', result.value)
}
// первая сборка предложения готовится при входе на этот этап
watch(stage, s => s === 'build' && startBuild())
</script>

<template>
  <section class="wc" aria-label="Проверка слов дня">
    <div class="wc-top">
      <b>Закрываем слова</b>
      <span class="wc-steps">
        <i :class="{ on: stage === 'pairs', done: stage !== 'pairs' }">1 · пары</i>
        <i :class="{ on: stage === 'quiz', done: stage === 'build' || stage === 'end' }">2 · перевод</i>
        <i v-if="buildItems.length" :class="{ on: stage === 'build', done: stage === 'end' }">3 · предложение</i>
      </span>
      <button type="button" class="plain" @click="emit('cancel')">Закрыть</button>
    </div>

    <div v-if="stage === 'pairs'">
      <p class="wc-hint">Нажми слово слева, потом его перевод справа. {{ matched.size }} из {{ words.length }}</p>
      <div class="wc-cols">
        <div class="wc-col">
          <button v-for="w in left" :key="w.n" type="button" class="wc-btn ko" :class="{ sel: selL === w.n, ok: matched.has(w.n) }" :disabled="matched.has(w.n)" @click="pick('l', w.n)">{{ w.k }}</button>
        </div>
        <div class="wc-col">
          <button v-for="w in right" :key="w.n" type="button" class="wc-btn" :class="{ sel: selR === w.n, ok: matched.has(w.n) }" :disabled="matched.has(w.n)" @click="pick('r', w.n)">{{ short(w.t) }}</button>
        </div>
      </div>
      <p v-if="wrong" class="wc-bad">Не пара, попробуй ещё.</p>
    </div>

    <div v-else-if="stage === 'quiz'">
      <p class="wc-hint">Что значит слово? {{ qi + 1 }} из {{ quizItems.length }}</p>
      <div class="wc-q ko">{{ q.w.k }} <small>{{ q.w.r }}</small></div>
      <div class="opts">
        <button v-for="o in q.options" :key="o" type="button" class="opt" :class="{ ok: qPicked !== null && o === short(q.w.t), bad: qPicked === o && o !== short(q.w.t) }" :disabled="qPicked !== null" @click="answerQuiz(o)">{{ o }}</button>
      </div>
    </div>

    <div v-else-if="stage === 'build'">
      <p class="wc-hint">Собери предложение. {{ bi + 1 }} из {{ buildItems.length }}</p>
      <div class="wc-ru">{{ b.ru }}</div>
      <div class="wc-line ko" :class="{ ok: bState === 'ok', bad: bState === 'bad' }">
        <button v-for="i in chosen" :key="i" type="button" class="wc-chip" @click="back(i)">{{ b.tokens[i] }}</button>
        <span v-if="!chosen.length" class="wc-empty">нажимай слова по порядку</span>
      </div>
      <div class="wc-bank ko">
        <button v-for="i in bank" :key="i" type="button" class="wc-chip" @click="take(i)">{{ b.tokens[i] }}</button>
      </div>
      <p v-if="bState === 'ok'" class="wc-good">Верно!</p>
      <p v-else-if="bState === 'bad'" class="wc-bad">Правильно: <b class="ko">{{ b.w.s }}</b></p>
      <div v-if="bState !== 'play'" class="fcb"><button type="button" @click="nextBuild">{{ bi + 1 < buildItems.length ? 'Дальше' : 'Готово' }}</button></div>
      <div v-else-if="chosen.length" class="fcb"><button type="button" class="plain" @click="startBuild">Сначала</button></div>
    </div>

    <div v-else class="wc-end">
      <b>Слова закрыты!</b>
      <ul>
        <li>Пары: {{ result.pairs.right }} из {{ result.pairs.total }} без ошибок</li>
        <li>Перевод: {{ result.quiz.right }} из {{ result.quiz.total }}</li>
        <li v-if="result.build.total">Предложения: {{ result.build.right }} из {{ result.build.total }}</li>
      </ul>
      <div class="fcb"><button type="button" @click="finish">Готово</button></div>
    </div>
  </section>
</template>

<style>
.study .wc { margin-top: 14px; padding: 18px 20px; background: var(--surface); border: 1px solid var(--gold); border-radius: 16px; }
.study .wc-top { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.study .wc-top .plain { margin-left: auto; padding: 6px 14px; font: inherit; font-size: 13px; background: transparent; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.study .wc-steps { display: flex; gap: 6px; }
.study .wc-steps i { padding: 3px 10px; font-size: 12px; font-style: normal; color: var(--muted); border: 1px solid var(--line); border-radius: 99px; }
.study .wc-steps i.on { color: #fff; background: var(--gold); border-color: var(--gold); }
.study .wc-steps i.done { color: var(--gold); }
.study .wc-hint { margin: 12px 0; font-size: 14px; color: var(--muted); }
.study .wc-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.study .wc-col { display: flex; flex-direction: column; gap: 8px; }
.study .wc-btn { padding: 10px 14px; font: inherit; font-size: 16px; text-align: left; background: transparent; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; }
.study .wc-btn.ko { font-family: var(--ko); font-size: 20px; font-weight: 700; }
.study .wc-btn.sel { border-color: var(--gold); background: var(--gold-soft); }
.study .wc-btn.ok { opacity: .45; border-style: dashed; }
.study .wc-q { margin: 6px 0 14px; font-size: 44px; font-weight: 700; line-height: 1.1; }
.study .wc-q small { font-family: inherit; font-size: 15px; font-weight: 400; color: var(--muted); }
.study .wc-ru { margin-bottom: 10px; font-size: 17px; }
.study .wc-line { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 56px; padding: 10px; border: 1px dashed var(--line); border-radius: 12px; }
.study .wc-line.ok { border: 1px solid var(--ok, #3d8b5f); }
.study .wc-line.bad { border: 1px solid #b44634; }
.study .wc-empty { font-size: 13px; color: var(--muted); }
.study .wc-bank { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.study .wc-chip { padding: 8px 14px; font: inherit; font-family: var(--ko); font-size: 20px; font-weight: 700; background: var(--gold-soft); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
.study .wc-bad { color: #b44634; font-size: 14px; }
.study .wc-good { color: var(--ok, #3d8b5f); font-weight: 700; }
.study .wc-end b { font-size: 20px; }
.study .wc-end ul { margin: 8px 0; padding-left: 20px; line-height: 1.7; }
@media (max-width: 600px) { .study .wc-cols { gap: 8px; } .study .wc-q { font-size: 34px; } }
</style>
