<script setup lang="ts">
import { computed, ref } from 'vue'
import UiSearch from '@/components/ui/UiSearch.vue'
import { D } from '@/data/korean/words'
import { WORD_PICS } from '@/data/korean/word-pics'

/**
 * Проба «Картинки к словам»: карточка лицом показывает рисунок, нажатие переворачивает на слово, чтение, перевод и пример.
 * Слова берутся из словаря, рисунки из `data/korean/word-pics.ts`. Ничего не сохраняет и в прогресс не идёт.
 */
const flipped = ref<string[]>([])
const q = ref('')
const all = computed(() =>
  WORD_PICS.map(p => ({ ...p, word: D.find(w => w.k === p.k) })).filter((c): c is typeof c & { word: NonNullable<typeof c.word> } => !!c.word),
)
/** Поиск по слову, переводу и чтению; пока строка пуста, показаны все картинки. */
const cards = computed(() => {
  const s = q.value.trim().toLowerCase()
  return s ? all.value.filter(c => c.k.includes(s) || c.word.t.toLowerCase().includes(s) || c.word.r.toLowerCase().includes(s)) : all.value
})
const isOpen = (k: string) => flipped.value.includes(k)
const toggle = (k: string) => (flipped.value = isOpen(k) ? flipped.value.filter(x => x !== k) : [...flipped.value, k])
const flipAll = () => (flipped.value = cards.value.every(c => isOpen(c.k)) ? [] : [...new Set([...flipped.value, ...cards.value.map(c => c.k)])])
</script>

<template>
  <section class="pc" aria-label="Картинки к словам">
    <header class="pc-head">
      <p>Проба: угадай слово по картинке и нажми на карточку, чтобы проверить. Картинок: <b>{{ all.length }}</b>.</p>
      <UiSearch v-model="q" class="pc-q" size="sm" placeholder="Найти слово или перевод" aria-label="Найти картинку" autocomplete="off" />
      <button type="button" class="pc-all" @click="flipAll">{{ cards.every(c => isOpen(c.k)) ? 'Скрыть все' : 'Показать все' }}</button>
    </header>
    <p v-if="!cards.length" class="pc-none">Ничего не нашлось.</p>
    <div class="pc-grid">
      <button v-for="c in cards" :key="c.k" type="button" class="pc-card" :class="{ open: isOpen(c.k) }" :aria-pressed="isOpen(c.k)" :aria-label="isOpen(c.k) ? `${c.k}: ${c.word.t}` : 'Карточка с картинкой, нажми, чтобы увидеть слово'" @click="toggle(c.k)">
        <span class="pc-face pc-front" :aria-hidden="isOpen(c.k)">
          <svg viewBox="0 0 120 120" role="img" aria-label="Картинка к слову" v-html="c.svg"></svg>
          <small>нажми, чтобы проверить</small>
        </span>
        <span class="pc-face pc-back" :aria-hidden="!isOpen(c.k)">
          <b lang="ko">{{ c.k }}</b>
          <i>{{ c.word.r }}</i>
          <strong>{{ c.word.t }}</strong>
          <em lang="ko">{{ c.word.s }}</em>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.pc-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; margin: 4px 0 14px; }
.pc-head p { margin: 0; color: var(--muted); font-size: 14px; flex: 1 1 260px; }
.pc-q { flex: 0 1 260px; min-width: 180px; }
.pc-all { height: 34px; padding: 0 16px; border: 1.5px solid var(--ui-line, #e3d9ff); border-radius: 999px; background: #fff; color: var(--ui-ink, #2a2340); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.pc-all:hover { border-color: var(--ui-accent, #7c5cff); }
.pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.pc-card { position: relative; display: grid; aspect-ratio: 4 / 5; padding: 0; border: 0; background: none; font: inherit; color: inherit; cursor: pointer; perspective: 900px; }
.pc-face { grid-area: 1 / 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 14px; text-align: center; border-radius: 22px; background: #fff; border: 1px solid var(--ui-line, #e3d9ff); box-shadow: 0 8px 22px rgba(100, 87, 170, .14); backface-visibility: hidden; -webkit-backface-visibility: hidden; transition: transform .6s cubic-bezier(.2, .75, .25, 1); }
.pc-front { background: linear-gradient(160deg, #fff, #f6f0ff); }
.pc-front svg { width: 78%; max-height: 72%; }
.pc-front small { color: var(--muted); font-size: 12px; }
.pc-back { transform: rotateY(180deg); background: linear-gradient(160deg, #fff4fa, #eef3ff); }
.pc-card.open .pc-front { transform: rotateY(-180deg); }
.pc-card.open .pc-back { transform: rotateY(0); }
.pc-back b { font-size: 40px; font-weight: 800; line-height: 1.1; }
.pc-back i { font-style: normal; color: var(--muted); font-size: 14px; }
.pc-back strong { font-size: 20px; }
.pc-back em { font-style: normal; color: var(--muted); font-size: 13px; line-height: 1.35; }
.pc-card:focus-visible { outline: 2px solid var(--ui-accent, #7c5cff); outline-offset: 4px; border-radius: 22px; }
@media (prefers-reduced-motion: reduce) { .pc-face { transition: none; } }
.pc-none { color: var(--muted); }
</style>
