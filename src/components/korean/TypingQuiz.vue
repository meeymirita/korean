<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { answerText, isCorrect, labelOf, promptOf, shown, statKey, type Direction, type TWord } from '@/data/korean/trainer'
import { useProgressStore } from '@/stores/progress'

const props = defineProps<{ words: TWord[]; dir: Direction }>()
const emit = defineEmits<{ again: []; retry: [words: TWord[]] }>()

type Result = { w: TWord; ok: boolean; given: string }

const progress = useProgressStore()
const index = ref(0)
const input = ref('')
const state = ref<'ask' | 'right' | 'wrong'>('ask')
const hint = ref(0)
const results = ref<Result[]>([])
const field = ref<HTMLInputElement>()

const current = computed(() => props.words[index.value])
const finished = computed(() => index.value >= props.words.length)
const right = computed(() => results.value.filter(r => r.ok).length)
const wrongWords = computed(() => results.value.filter(r => !r.ok).map(r => r.w))
const prompt = computed(() => (current.value ? promptOf(current.value, props.dir) : ''))
const sub = computed(() => (current.value && ['fill', 'form', 'past'].includes(props.dir) ? shown(current.value) : ''))
const hintText = computed(() => {
  if (!current.value || !hint.value) return ''
  const a = answerText(current.value, props.dir)
  return a.slice(0, hint.value) + '…'
})

function focus() {
  nextTick(() => field.value?.focus())
}

function check(known = true) {
  const w = current.value
  if (!w) return
  const ok = known && isCorrect(input.value, w, props.dir)
  results.value.push({ w, ok, given: input.value })
  progress.record({ word: statKey(w), ok, source: 'trainer' })
  state.value = ok ? 'right' : 'wrong'
}
function next() {
  index.value++
  input.value = ''
  hint.value = 0
  state.value = 'ask'
  focus()
}
function submit() {
  if (state.value === 'ask') check()
  else next()
}

const print = () => window.print()
const showAnswer = computed(() => (current.value ? answerText(current.value, props.dir) : ''))
</script>

<template>
  <div class="tq">
    <section class="print-sheet">
      <h2>Тест: {{ labelOf(dir).toLowerCase() }}</h2>
      <table>
        <tr v-for="(w, i) in words" :key="w.n">
          <td>{{ i + 1 }}.</td>
          <td class="ko">{{ promptOf(w, dir) }}</td>
          <td class="line"></td>
        </tr>
      </table>
    </section>

    <template v-if="!finished && current">
      <div class="tq-bar">
        <span>{{ index + 1 }} из {{ words.length }}</span>
        <span>верно: {{ right }}</span>
        <button class="mg-refresh" @click="emit('again')">🔄 Обновить слова</button>
      </div>
      <div class="mg-progress"><i :style="{ width: (index / words.length) * 100 + '%' }"></i></div>

      <div class="tq-card" :class="state">
        <div class="tq-label">{{ labelOf(dir) }}</div>
        <div class="tq-q" :class="{ ko: dir !== 'ru-ko' }">
          {{ prompt }}
        </div>
        <div v-if="sub" class="tq-sub">{{ sub }}</div>
        <div v-if="hintText && state === 'ask'" class="tq-hint">подсказка: {{ hintText }}</div>

        <form class="tq-form" @submit.prevent="submit">
          <input
            ref="field"
            v-model="input"
            :disabled="state !== 'ask'"
            :placeholder="dir === 'ko-ru' ? 'перевод…' : dir === 'form' || dir === 'past' ? '가요, 갔어요…' : '한글로…'"
            :lang="dir === 'ko-ru' ? 'ru' : 'ko'"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            autofocus
          />
          <button type="submit">{{ state === 'ask' ? 'Проверить' : 'Дальше →' }}</button>
        </form>

        <div v-if="state === 'ask'" class="tq-tools">
          <button type="button" @click="hint = Math.min(hint + 1, showAnswer.length)">💡 Подсказка</button>
          <button type="button" @click="check(false)">Не знаю</button>
        </div>
        <div v-else class="tq-fb" :class="state">
          <b>{{ state === 'right' ? '✓ Верно' : '✗ Не совсем' }}</b>
          <span v-if="state === 'wrong'">правильно: <b :class="{ ko: dir !== 'ko-ru' }">{{ showAnswer }}</b></span>
          <span v-else-if="dir === 'ko-ru' && current.r">{{ current.r }}</span>
          <span v-if="dir === 'fill'" class="ko tq-s">{{ current.k }}</span>
          <span v-if="current.s" class="tq-s">{{ current.s }}</span>
        </div>
      </div>
    </template>

    <div v-else class="tq-end">
      <div class="tq-score">{{ right }} <small>из {{ words.length }}</small></div>
      <p v-if="wrongWords.length === 0">🌸 Всё верно!</p>
      <template v-else>
        <p>Повтори эти слова:</p>
        <ul>
          <li v-for="r in results.filter(x => !x.ok)" :key="r.w.n">
            <b class="ko">{{ r.w.k }}</b> — {{ shown(r.w) }}
            <small v-if="r.given">(ты написала: {{ r.given }})</small>
          </li>
        </ul>
      </template>
      <div class="mg-actions">
        <button v-if="wrongWords.length" @click="emit('retry', wrongWords)">Повторить ошибки ({{ wrongWords.length }})</button>
        <button @click="emit('again')">Новый тест</button>
        <button class="plain" @click="print()">🖨 Лист для печати</button>
      </div>
    </div>
  </div>
</template>

<style>
.study .tq-bar { display: flex; gap: 22px; margin-top: 20px; font-family: var(--mono); font-size: 12px; letter-spacing: .08em; }
.study .tq-card { margin-top: 18px; padding: 28px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px;
  box-shadow: var(--shadow); transition: border-color .2s; }
.study .tq-card.right { border-color: var(--ok); }
.study .tq-card.wrong { border-color: var(--bad); animation: mg-shake .35s; }
.study .tq-label { font-family: var(--mono); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); }
.study .tq-q { display: flex; align-items: center; gap: 12px; margin-top: 10px; font-size: 34px; font-weight: 700; line-height: 1.2; }
.study .tq-q.ko { font-family: var(--ko); font-size: 44px; }
.study .tq-sub { margin-top: 4px; font-size: 15px; color: var(--muted); }
.study .tq-hint { margin-top: 6px; font-size: 14px; color: var(--muted); }
.study .tq-form { display: flex; gap: 8px; margin-top: 18px; }
.study .tq-form input { flex: 1; min-width: 0; padding: 13px 16px; font: inherit; font-size: 18px; color: var(--ink); background: var(--bg);
  border: 1px solid var(--line); border-radius: 12px; outline: none; }
.study .tq-form input:focus { border-color: var(--gold); }
.study .tq-form button { padding: 0 22px; font-weight: 600; color: #fff; background: var(--gold); border: 0; border-radius: 12px; }
.study .tq-tools { display: flex; gap: 8px; margin-top: 12px; }
.study .tq-tools button { padding: 7px 14px; font-size: 13px; background: transparent; border: 1px solid var(--line); border-radius: 99px; }
.study .tq-tools button:hover { border-color: var(--gold); }
.study .tq-fb { display: flex; flex-direction: column; gap: 2px; margin-top: 14px; font-size: 15px; }
.study .tq-fb.right b:first-child { color: var(--ok); }
.study .tq-fb.wrong b:first-child { color: var(--bad); }
.study .tq-s { font-size: 14px; color: var(--muted); }
.study .tq-end { margin-top: 20px; padding: 26px; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; }
.study .tq-score { font-family: var(--serif); font-size: 64px; font-weight: 600; color: var(--gold); line-height: 1; }
.study .tq-score small { font-family: 'Manrope', sans-serif; font-size: 16px; color: var(--muted); }
.study .tq-end ul { margin: 6px 0 16px; padding-left: 20px; }
.study .tq-end li { margin: 4px 0; }
.study .tq-end li small { color: var(--muted); }
.study .tq-end .mg-actions { margin-top: 16px; }
.study .tq-end .mg-actions button.plain { background: transparent; color: var(--ink); border-color: var(--line); }
@media (max-width: 560px) { .study .tq-q.ko { font-size: 36px; } .study .tq-card { padding: 20px; } }
.study .print-sheet { display: none; }
@media print {
  body * { visibility: hidden; }
  .study .print-sheet, .study .print-sheet * { visibility: visible; }
  .study .print-sheet { display: block; position: absolute; left: 0; top: 0; width: 100%; padding: 24px; color: #000; background: #fff; }
  .study .print-sheet table { width: 100%; border-collapse: collapse; font-size: 20px; }
  .study .print-sheet td { padding: 12px 8px; }
  .study .print-sheet td.line { width: 55%; border-bottom: 1px solid #000; }
}
</style>
