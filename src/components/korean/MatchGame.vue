<script setup lang="ts">
import { computed, ref } from 'vue'
import { shuffle } from '@/data/korean/tasks'
import { shown, statKey, type TWord } from '@/data/korean/trainer'
import { useProgressStore } from '@/stores/progress'
import { formatClock, useTimerStore } from '@/stores/timer'

const props = defineProps<{ words: TWord[]; showReading: boolean }>()
const emit = defineEmits<{ again: []; retry: [words: TWord[]] }>()

const progress = useProgressStore()
const timer = useTimerStore()
const left = ref(shuffle(props.words))
const right = ref(shuffle(props.words))
const selL = ref<number | null>(null)
const selR = ref<number | null>(null)
const matched = ref(new Set<number>())
const missed = ref(new Set<number>())
const wrong = ref<{ l: number; r: number } | null>(null)
const mistakes = ref(0)
const done = computed(() => matched.value.size === props.words.length)


function pick(side: 'l' | 'r', id: number) {
  if (matched.value.has(id) || wrong.value) return
  if (side === 'l') selL.value = id
  else selR.value = id
  if (selL.value === null || selR.value === null) return

  const l = selL.value
  const r = selR.value
  selL.value = selR.value = null
  const word = props.words.find(x => x.n === l)
  if (l === r) {
    // засчитываем слово, если в этом раунде в нём не ошибались
    if (word && !missed.value.has(l)) progress.record({ word: statKey(word), ok: true, source: 'trainer', mode: 'match' })
    matched.value = new Set(matched.value).add(l)
  } else {
    mistakes.value++
    if (word) progress.record({ word: statKey(word), ok: false, source: 'trainer', mode: 'match' })
    missed.value = new Set(missed.value).add(l)
    wrong.value = { l, r }
    setTimeout(() => (wrong.value = null), 450)
  }
}

const missedWords = computed(() => props.words.filter(w => missed.value.has(w.n)))
</script>

<template>
  <div class="mg">
    <div class="mg-bar">
      <span>{{ matched.size }} из {{ words.length }}</span>
      <span :class="{ bad: mistakes }">ошибок: {{ mistakes }}</span>
      <button v-if="timer.available" class="mg-clock" :class="{ on: timer.running }" @click="timer.toggle()">
        {{ timer.running ? 'Пауза' : 'Старт' }} · {{ formatClock(timer.session) }}
      </button>
      <button class="mg-refresh" @click="emit('again')">Обновить слова</button>
    </div>
    <div class="mg-progress"><i :style="{ width: (matched.size / words.length) * 100 + '%' }"></i></div>

    <div class="mg-board">
      <div class="mg-col">
        <button
          v-for="w in left"
          :key="w.n"
          class="mg-card ko"
          :class="{
            sel: selL === w.n,
            ok: matched.has(w.n),
            bad: wrong?.l === w.n,
          }"
          :disabled="matched.has(w.n)"
          @click="pick('l', w.n)"
        >
          <b>{{ w.k }}</b>
          <small v-if="showReading && w.r">{{ w.r }}</small>
        </button>
      </div>
      <div class="mg-col">
        <button
          v-for="w in right"
          :key="w.n"
          class="mg-card"
          :class="{
            sel: selR === w.n,
            ok: matched.has(w.n),
            bad: wrong?.r === w.n,
          }"
          :disabled="matched.has(w.n)"
          @click="pick('r', w.n)"
        >
          {{ shown(w) }}
        </button>
      </div>
    </div>

    <div v-if="done" class="mg-end">
      <div>
        <b>{{ mistakes === 0 ? '🌸 Без ошибок!' : 'Готово!' }}</b>
        <span>ошибок: {{ mistakes }}</span>
      </div>
      <div class="mg-actions">
        <button v-if="missedWords.length" @click="emit('retry', missedWords)">Повторить ошибки ({{ missedWords.length }})</button>
        <button @click="emit('again')">Новый раунд</button>
      </div>
    </div>
  </div>
</template>

<style>
/* единая строка: счётчики слева, таймер и «Обновить» справа; всё по центру по высоте */
.study .mg-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; margin-top: 20px; font-family: var(--mono); font-size: 12px; letter-spacing: .08em; }
.study .mg-bar .bad { color: var(--bad); }
.study .mg-bar .muted { color: var(--muted); }
.study .mg-clock { margin-left: auto; }
.study .mg-clock + .mg-refresh { margin-left: 0; }
.study .mg-refresh { margin-left: auto; padding: 5px 14px; font-family: 'Manrope', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0;
  color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 99px; transition: border-color .2s, background .2s; }
.study .mg-refresh:hover { border-color: var(--gold); background: var(--gold-soft); }
.study .mg-progress { height: 4px; margin-top: 10px; border-radius: 99px; background: var(--line-soft); overflow: hidden; }
.study .mg-progress i { display: block; height: 100%; background: var(--gold); transition: width .3s; }
.study .mg-board { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
.study .mg-col { display: flex; flex-direction: column; gap: 8px; }
.study .mg-card { position: relative; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px;
  min-height: 56px; padding: 10px 14px; font-size: 16px; text-align: left; background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; transition: border-color .15s, background .15s, opacity .3s, transform .15s; }
.study .mg-card.ko b { font-family: var(--ko); font-size: 22px; font-weight: 700; }
.study .mg-card small { font-size: 12px; color: var(--muted); }
.study .mg-card:not(:disabled):hover { border-color: var(--gold); }
.study .mg-card.sel { border-color: var(--gold); background: var(--gold-soft); transform: scale(1.02); }
.study .mg-card.ok { background: var(--ok-bg); border-color: var(--ok); color: var(--ok); opacity: .55; cursor: default; }
.study .mg-card.bad { background: var(--bad-bg); border-color: var(--bad); animation: mg-shake .35s; }
@keyframes mg-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.study .mg-end { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 18px;
  padding: 18px 22px; border-radius: 16px; background: var(--gold-soft); border: 1px solid var(--line); }
.study .mg-end > div:first-child { display: flex; flex-direction: column; gap: 2px; }
.study .mg-end b { font-family: var(--serif); font-size: 26px; font-weight: 600; }
.study .mg-end span { font-size: 13px; color: var(--muted); }
.study .mg-clock { padding: 4px 12px; font: inherit; font-size: 13px; font-weight: 600; background: var(--surface); border: 1px solid var(--line); border-radius: 99px; cursor: pointer; }
.study .mg-clock.on { background: var(--gold-soft); border-color: var(--gold); }
.study .mg-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.study .mg-actions button { border: 1px solid var(--gold); background: var(--gold); color: #fff; border-radius: 12px; padding: 10px 18px; font-weight: 600; }
.study .mg-actions button:first-child:not(:last-child) { background: transparent; color: var(--ink); }
@media (max-width: 560px) { .study .mg-board { gap: 8px; } .study .mg-card { padding: 8px 10px; font-size: 14px; } .study .mg-card.ko b { font-size: 18px; } }
</style>
