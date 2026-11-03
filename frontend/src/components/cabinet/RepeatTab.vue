<script setup lang="ts">
import { computed, ref } from 'vue'
import ReviewSession from '@/components/cabinet/ReviewSession.vue'
import { dueWords } from '@/data/review'
import type { Word } from '@/data/korean/words'
import { usePersisted } from '@/composables/usePersisted'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const due = computed(() => dueWords(progress.data))
const session = ref<Word[] | null>(null)
/** Сколько слов повторять за раз: задаётся числом в поле, запоминается до закрытия вкладки. */
const wanted = usePersisted<number>('repeat_size', 10, v => Number.isInteger(v) && (v as number) >= 1)
const size = computed(() => Math.max(1, Math.min(Number(wanted.value) || 10, due.value.length)))

const ago = (t: number) => {
  const days = Math.floor((Date.now() - t) / 86_400_000)
  return days <= 0 ? 'сегодня' : days === 1 ? 'вчера' : `${days} дн. назад`
}
const start = () => (session.value = due.value.slice(0, size.value).map(d => d.word))
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
        <div v-if="due.length" class="rp-go">
          <label class="rp-n">Слов за раз
            <input v-model.number="wanted" type="number" inputmode="numeric" min="1" :max="due.length" aria-label="Сколько слов повторить" @keydown.enter="start" />
          </label>
          <button class="rp-start" @click="start">Повторить {{ size }}</button>
        </div>
      </div>
      <div v-if="due.length" class="rp-list">
        <div v-for="x in due.slice(0, 40)" :key="x.word.n" class="rp-w" :class="{ wrong: x.reason === 'wrong' }">
          <b class="ko">{{ x.word.k }}</b>
          <span>{{ x.word.t }}</span>
          <small>{{ x.reason === 'wrong' ? 'были ошибки' : 'давно не повторялось' }} · {{ ago(x.stat.last) }} · очков {{ x.stat.streak }}</small>
        </div>
      </div>
      <p v-else class="cb-empty">
        Ответь на задания в «Сегодня», в тренажёрах или в игре, и слова появятся здесь, когда придёт время их повторить.
        Чем чаще слово отвечено верно подряд, тем реже оно возвращается: через 1, 3, 7, 14 и 30 дней.
      </p>
    </template>
  </div>
</template>
