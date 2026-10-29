<script setup lang="ts">
import { ref } from 'vue'
import type { Letter } from '@/data/alphabet'

defineProps<{ letter: Letter }>()
/** На телефоне наведения нет — переворачиваем нажатием. */
const open = ref(false)
</script>

<template>
  <button class="lc-card" :class="{ open }" @click="open = !open">
    <span class="lc-char">{{ letter.char }}</span>
    <span class="lc-prompt">нажми или наведи</span>
    <span class="lc-over">
      <b>{{ letter.reading }}</b>
      <i>{{ letter.roman }}</i>
      <small v-if="letter.hint">{{ letter.hint }}</small>
    </span>
  </button>
</template>

<style>
.study .lc-card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 150px; padding: 18px 12px; overflow: hidden; text-align: center; background: var(--surface);
  border: 1px solid var(--line); border-radius: 16px; transition: transform .2s, border-color .2s, box-shadow .2s; }
.study .lc-card:hover { transform: translateY(-3px); border-color: var(--gold); box-shadow: var(--shadow); }
.study .lc-char { font-family: var(--ko); font-size: 56px; font-weight: 600; line-height: 1; transition: opacity .2s, transform .2s; }
.study .lc-prompt { margin-top: 10px; font-family: var(--mono); font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase;
  color: var(--muted); transition: opacity .2s; }
.study .lc-over { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; padding: 12px; background: rgba(244, 243, 240, .97); opacity: 0; visibility: hidden; transition: opacity .2s, visibility .2s; }
.study .lc-over b { font-family: var(--serif); font-size: 30px; font-weight: 600; color: var(--gold); }
.study .lc-over i { font-style: normal; font-family: var(--mono); font-size: 12px; color: var(--muted); }
.study .lc-over small { font-size: 12px; line-height: 1.4; color: var(--muted); }
.study .lc-card.open .lc-char { opacity: .12; transform: scale(.95); }
.study .lc-card.open .lc-prompt { opacity: 0; }
.study .lc-card.open .lc-over { opacity: 1; visibility: visible; }
@media (hover: hover) {
  .study .lc-card:hover .lc-char { opacity: .12; transform: scale(.95); }
  .study .lc-card:hover .lc-prompt { opacity: 0; }
  .study .lc-card:hover .lc-over { opacity: 1; visibility: visible; }
}
</style>
