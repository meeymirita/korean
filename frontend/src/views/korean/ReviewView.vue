<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import MarkStar from '@/components/korean/MarkStar.vue'
import { CATN, D, type Word } from '@/data/korean/words'
import yunaImg from '@/assets/home/yuna-review.webp'

const cat = ref('')
const open = ref(false)
/** Колода: слова выбранной темы вперемешку, идём по ней по порядку, в конце тасуем заново. */
const deck = ref<Word[]>([])
const pos = ref(0)
const word = computed(() => deck.value[pos.value] ?? D[0]!)

function shuffle() {
  const pool = (cat.value ? D.filter(d => d.c.includes(cat.value)) : D).slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  deck.value = pool
  pos.value = 0
  open.value = false
}
function next() {
  open.value = false
  if (pos.value + 1 >= deck.value.length) shuffle()
  else pos.value++
}
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'SELECT') return
  if (e.key === ' ') {
    e.preventDefault()
    open.value = !open.value
  }
  if (e.key === 'ArrowRight' || e.key === 'Enter') next()
}
onMounted(() => {
  shuffle()
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="wrap review-page">
    <SectionHead id="review" />
    <div class="fcb">
      <select v-model="cat" @change="shuffle">
        <option value="">Все слова</option>
        <option v-for="(name, c) in CATN" :key="c" :value="c">{{ name }}</option>
      </select>
      <span class="kbd">пробел — перевернуть · → — следующая</span>
    </div>
    <div class="rv-stage">
      <div class="rv-deck">
        <!-- переворот: карточка стоит на месте и вращается вокруг вертикальной оси; ключ по слову, чтобы новая карточка появлялась лицом без вращения (иначе на миг виден ответ) -->
        <div class="rv-persp">
          <div :key="word.k + ':' + pos" class="rv-flip" :class="{ flipped: open }" role="button" tabindex="0" :aria-pressed="open" aria-label="Перевернуть карточку" @click="open = !open" @keydown.enter.stop.prevent="open = !open">
            <div class="fc rv-face rv-front" :aria-hidden="open">
              <div class="big">{{ word.k }}</div>
              <div class="hint">нажми, чтобы перевернуть</div>
            </div>
            <div class="fc rv-face rv-back" :aria-hidden="!open">
              <div class="big">{{ word.k }}</div>
              <div class="ans">
                {{ word.r }}<b>{{ word.t }}</b><small>{{ word.s }}</small>
              </div>
            </div>
          </div>
        </div>
        <div class="rv-top">
          <span class="rv-count">{{ pos + 1 }} / {{ deck.length }}</span>
          <button type="button" class="rv-icon" title="Перемешать колоду" aria-label="Перемешать колоду" @click="shuffle">⇄</button>
        </div>
        <div class="rv-bottom"><MarkStar kind="w" :id="word.k" /></div>
      </div>
      <img class="rv-yuna" :src="yunaImg" alt="" aria-hidden="true" draggable="false" />
    </div>
    <div class="fcb"><button @click="next">Следующее →</button></div>
  </div>
</template>

<style>
/* ===== Повторение: Юна и стопка карточек (двигай здесь) ===== */
.review-page .rv-stage { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.9fr); align-items: end; gap: 0; }
.review-page .rv-deck { position: relative; z-index: 2; margin: 28px 22px 26px 0; }
/* две «карточки» под верхней: смещены вправо и вниз */
.review-page .rv-deck::before, .review-page .rv-deck::after { content: ""; position: absolute; z-index: -1; inset: 0; border-radius: 22px;
  background: rgba(255, 255, 255, .55); border: 1px solid rgba(255, 255, 255, .9); box-shadow: 0 10px 28px rgba(110, 90, 190, .12); }
.review-page .rv-deck::before { transform: translate(12px, 12px); }
.review-page .rv-deck::after { transform: translate(24px, 24px); opacity: .6; }
.review-page .rv-deck .fc { margin-top: 0; position: relative; }
/* 3D-переворот: перспектива на родителе, вращается .rv-flip, обе стороны лежат в одной ячейке сетки (высота по большей, карточка не прыгает).
   Тень остаётся у сторон (box-shadow): filter на вращаемом элементе сплющил бы 3D. */
.review-page .rv-persp { perspective: 1100px; }
.review-page .rv-flip { display: grid; transform-style: preserve-3d; transition: transform 850ms cubic-bezier(.2, .75, .25, 1); cursor: pointer; border-radius: 22px; }
.review-page .rv-flip.flipped { transform: rotateY(180deg); }
.review-page .rv-flip:focus-visible { outline: 2px solid var(--accent, #8a6cf0); outline-offset: 4px; }
.review-page .rv-face { grid-area: 1 / 1; min-width: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.review-page .rv-back { transform: rotateY(180deg); }
@media (prefers-reduced-motion: reduce) { .review-page .rv-flip { transition: none; } }
.review-page .rv-top { position: absolute; z-index: 3; top: 18px; right: 20px; display: flex; align-items: center; gap: 8px; cursor: default; }
.review-page .rv-count { padding: 6px 14px; font-size: 13px; font-weight: 700; color: var(--muted); background: rgba(150, 130, 230, .14); border-radius: 999px; }
.review-page .rv-icon { width: 34px; height: 34px; display: grid; place-items: center; font-size: 16px; color: var(--muted);
  background: rgba(150, 130, 230, .14); border: 0; border-radius: 50%; cursor: pointer; }
.review-page .rv-icon:hover { background: rgba(150, 130, 230, .28); }
.review-page .rv-bottom { position: absolute; z-index: 3; right: 20px; bottom: 18px; }
.review-page .rv-bottom .mark-star { width: 40px; height: 40px; font-size: 18px; border-radius: 50%; border: 1px solid var(--line); background: rgba(255, 255, 255, .6); }
.review-page .rv-yuna { --w: 100%; --x: 0px; --y: 0px; width: var(--w); max-width: 600px; justify-self: end; align-self: end; height: auto;
  transform: translate(var(--x), var(--y)); pointer-events: none; user-select: none; }
@media (max-width: 900px) {
  .review-page .rv-stage { grid-template-columns: 1fr; }
  .review-page .rv-yuna { max-width: 280px; justify-self: center; }
}
</style>
