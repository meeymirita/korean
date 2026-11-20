<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Q } from '@/data/korean/topik-mock'

/**
 * Серия вопросов «Прогноза TOPIK I»: как на экзамене, без подсказок после ответа. Ответ выбирается из вариантов (клавиши 1–5), в тесте слов есть «не знаю» (не штрафуется, в отличие от неверного ответа).
 * Результат уходит событием `done` один раз в конце.
 */
const props = defineProps<{ questions: Q[]; allowSkip: boolean; label: string }>()
const emit = defineEmits<{ done: [r: { correct: number; wrong: number; skipped: number; missed: Q[] }] }>()

const idx = ref(0)
const correct = ref(0)
const wrong = ref(0)
const skipped = ref(0)
const missed = ref<Q[]>([])
const cur = computed(() => props.questions[idx.value])
const hangul = (s: string) => /[가-힣]/.test(s)

function pick(option: string | null) {
  const q = cur.value
  if (!q) return
  if (option === null) {
    skipped.value++
    missed.value.push(q)
  } else if (option === q.answer) correct.value++
  else {
    wrong.value++
    missed.value.push(q)
  }
  if (idx.value + 1 >= props.questions.length) emit('done', { correct: correct.value, wrong: wrong.value, skipped: skipped.value, missed: missed.value })
  else idx.value++
}
const onKey = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey || e.altKey || !cur.value) return
  const n = Number(e.key)
  if (n >= 1 && n <= cur.value.options.length) pick(cur.value.options[n - 1]!)
  else if (e.key === '0' && props.allowSkip) pick(null)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="cur" class="quiz">
    <div class="top"><span>{{ label }}</span><span>{{ idx + 1 }} / {{ questions.length }}</span></div>
    <div class="prog"><i :style="{ width: (idx / questions.length) * 100 + '%' }" /></div>
    <div class="kind">{{ cur.title }}</div>
    <div class="q" :class="{ ko: hangul(cur.prompt), long: cur.prompt.length > 24 }">{{ cur.prompt }}</div>
    <div v-if="cur.hint" class="hint">{{ cur.hint }}</div>
    <div class="opts">
      <button v-for="(o, i) in cur.options" :key="o" type="button" class="opt" @click="pick(o)">
        <span class="n">{{ i + 1 }}</span><span class="t" :class="{ ko: hangul(o) }">{{ o }}</span>
      </button>
    </div>
    <button v-if="allowSkip" type="button" class="skip" @click="pick(null)">Не знаю <small>0</small></button>
  </div>
</template>

<style scoped>
.top { display: flex; justify-content: space-between; color: var(--muted); font-size: 13px; }
.prog { height: 8px; margin: 8px 0 18px; border-radius: 99px; background: var(--line); overflow: hidden; }
.prog i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--petal, #ffb3da), var(--petal-line, #e0559f)); transition: width .3s; }
.kind { text-align: center; color: var(--muted); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }
.q { margin: 8px 0 4px; text-align: center; font-size: 48px; font-weight: 700; line-height: 1.15; overflow-wrap: anywhere; }
.q.long { font-size: 24px; line-height: 1.4; font-weight: 600; }
.hint { text-align: center; color: var(--muted); font-size: 14px; margin-bottom: 4px; }
.opts { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin: 16px 0 8px; }
.opt { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255, 255, 255, .55); color: inherit; font: inherit; text-align: left; cursor: pointer; transition: transform .12s, border-color .12s; }
.opt:hover, .opt:focus-visible { transform: translateY(-2px); border-color: var(--petal-line, #e0559f); }
.n { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 8px; background: rgba(214, 77, 169, .14); color: var(--accent); font-size: 12px; font-weight: 700; }
.t { font-size: 16px; overflow-wrap: anywhere; }
.skip { display: block; margin: 8px auto 0; padding: 8px 22px; border: 1px dashed var(--line); border-radius: 99px; background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
.skip small { opacity: .7; margin-left: 4px; }
@media (max-width: 640px) { .q { font-size: 38px; } .q.long { font-size: 20px; } }
</style>
