<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { mistakeWords } from '@/data/mistakes'
import { isCorrect, syllableTasks, type SyllableTask } from '@/data/korean/syllables'
import { useProgressStore } from '@/stores/progress'

const ROUND = 10
const progress = useProgressStore()
const weak = () => mistakeWords(progress.data, 30).map(m => m.word.k)
const tasks = ref<SyllableTask[]>(syllableTasks(ROUND, weak()))
const idx = ref(0)
/** индексы выбранных плиток по порядку (плитка не пропадает, а затемняется, пока выбрана) */
const picked = ref<number[]>([])
const result = ref<'ok' | 'bad' | null>(null)
const right = ref(0)
const missed = ref<SyllableTask[]>([])

const current = computed(() => tasks.value[idx.value])
const finished = computed(() => idx.value >= tasks.value.length)
const letters = computed(() => picked.value.map(i => current.value!.tiles[i]!))

function tap(i: number) {
  const t = current.value
  if (!t || result.value || picked.value.includes(i)) return
  picked.value = [...picked.value, i]
  if (picked.value.length === t.answer.length) {
    const ok = isCorrect(t, letters.value)
    result.value = ok ? 'ok' : 'bad'
    if (ok) right.value++
    else missed.value.push(t)
    progress.record({ word: t.word.k, ok, source: 'trainer', mode: 'syllables' })
  }
}
const back = () => {
  if (!result.value) picked.value = picked.value.slice(0, -1)
}
function next() {
  idx.value++
  picked.value = []
  result.value = null
}
function again() {
  tasks.value = syllableTasks(ROUND, weak())
  idx.value = 0
  picked.value = []
  result.value = null
  right.value = 0
  missed.value = []
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="syllables" />
    <div class="rs">
      <template v-if="!finished && current">
        <div class="rs-bar"><span>{{ idx + 1 }} из {{ tasks.length }}</span><span>верно: {{ right }}</span></div>
        <div class="qk-prog"><i :style="{ width: (idx / tasks.length) * 100 + '%' }"></i></div>
        <div class="rs-sub">Собери слово по слогам</div>
        <div class="rs-q ru">{{ current.prompt }}</div>
        <div class="rs-sub">чтение: {{ current.word.r }}</div>

        <div class="sy-slots" :class="result" aria-live="polite">
          <span v-for="n in current.answer.length" :key="n" class="sy-slot ko">{{ letters[n - 1] ?? '' }}</span>
        </div>
        <div class="sy-tiles">
          <button v-for="(s, i) in current.tiles" :key="i" class="sy-tile ko" :disabled="picked.includes(i) || !!result" @click="tap(i)">{{ s }}</button>
          <button class="sy-back" :disabled="!picked.length || !!result" title="Убрать последний слог" aria-label="Убрать последний слог" @click="back">⌫</button>
        </div>
        <div v-if="result === 'bad'" class="xb" role="note">Верно: <b class="ko">{{ current.word.k }}</b> ({{ current.word.r }})</div>
        <button v-if="result" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
      </template>
      <div v-else class="rs-end">
        <div class="pg-v">{{ right }} <small>из {{ tasks.length }}</small></div>
        <p>{{ right === tasks.length ? '🌸 Всё верно!' : 'Вот что не получилось:' }}</p>
        <ul v-if="missed.length" class="qk-miss"><li v-for="t in missed" :key="t.word.n"><span class="ko">{{ t.word.k }}</span> ({{ t.word.r }}) — {{ t.prompt }}</li></ul>
        <div class="pg-btns"><button class="rs-start" @click="again">Ещё раз</button></div>
      </div>
    </div>
  </div>
</template>
