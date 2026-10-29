<script setup lang="ts">
import { computed, ref } from 'vue'
import ReviewSession from '@/components/cabinet/ReviewSession.vue'
import { dueWords } from '@/data/review'
import type { Word } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const due = computed(() => dueWords(progress.data))
const session = ref<Word[] | null>(null)
const SESSION_SIZE = 10

const ago = (t: number) => {
  const days = Math.floor((Date.now() - t) / 86_400_000)
  return days <= 0 ? 'сегодня' : days === 1 ? 'вчера' : `${days} дн. назад`
}
const start = () => (session.value = due.value.slice(0, SESSION_SIZE).map(d => d.word))
</script>

<template>
  <div class="cb-body">
    <ReviewSession v-if="session" :words="session" @done="session = null" />
    <template v-else>
      <div class="rp-top">
        <p v-if="due.length">
          К повторению <b>{{ due.length }}</b> {{ due.length === 1 ? 'слово' : 'слов' }}: сначала те, в которых были ошибки, потом давно не повторявшиеся.
        </p>
        <p v-else>Сейчас повторять нечего.</p>
        <button v-if="due.length" class="rp-start" @click="start">Повторить {{ Math.min(SESSION_SIZE, due.length) }}</button>
      </div>
      <div v-if="due.length" class="rp-list">
        <div v-for="x in due.slice(0, 40)" :key="x.word.n" class="rp-w" :class="{ wrong: x.reason === 'wrong' }">
          <b class="ko">{{ x.word.k }}</b>
          <span>{{ x.word.t }}</span>
          <small>{{ x.reason === 'wrong' ? 'были ошибки' : 'давно не повторялось' }} · {{ ago(x.stat.last) }} · подряд верно {{ x.stat.streak }}</small>
        </div>
      </div>
      <p v-else class="cb-empty">
        Ответь на задания в «Сегодня», в тренажёрах или в игре, и слова появятся здесь, когда придёт время их повторить.
        Чем чаще слово отвечено верно подряд, тем реже оно возвращается: через 1, 3, 7, 14 и 30 дней.
      </p>
    </template>
  </div>
</template>
