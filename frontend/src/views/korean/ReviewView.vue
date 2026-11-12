<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import MarkStar from '@/components/korean/MarkStar.vue'
import { CATN, D, type Word } from '@/data/korean/words'
import { PAIR_SETS, SETS, pool } from '@/data/korean/trainer'
import yunaImg from '@/assets/home/yuna-review.webp'
import { cascade, pop } from '@/lib/fx'

const cat = ref('')
const open = ref(false)
/** Колода: слова выбранной темы вперемешку, идём по ней по порядку, в конце тасуем заново. */
const deck = ref<Word[]>([])
const pos = ref(0)
const word = computed(() => deck.value[pos.value] ?? D[0]!)
/** Те же группы, что в «Найди пару»: наборы по грамматике и предложения берутся из `trainer.ts`, темы словаря из самого словаря. */
const isSet = (c: string) => SETS.some(s => s.id === c) || PAIR_SETS.some(s => s.id === c)
const DICT = new Set(D.map(d => d.k))
/** звёздочка «отметить слово» только у слов словаря (у предложений и форм её нет) */
const canMark = computed(() => DICT.has(word.value.k))
/** лицо карточки: у вопросительных предложений предложение с пропуском */
const front = computed(() => (word.value as { blank?: string }).blank ?? word.value.k)
/** длинное (предложение) пишется мельче, чтобы помещалось на карточке */
const long = computed(() => isSet(cat.value) && front.value.length > 8)
const flipEl = ref<HTMLElement>()
const countEl = ref<HTMLElement>()
/** Новая карточка выезжает, как задания в тренажёрах (`lib/fx.ts`; при «уменьшить движение» появляется сразу). */
const enter = () => void nextTick(() => flipEl.value && cascade([flipEl.value]))

function shuffle() {
  const cards: Word[] = (isSet(cat.value) ? pool(cat.value) : cat.value ? D.filter(d => d.c.includes(cat.value)) : D).slice()
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j]!, cards[i]!]
  }
  deck.value = cards
  pos.value = 0
  open.value = false
  enter()
  pop(countEl.value)
}
function next() {
  open.value = false
  if (pos.value + 1 >= deck.value.length) shuffle()
  else {
    pos.value++
    enter()
  }
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
        <optgroup label="Грамматика">
          <option v-for="s in SETS" :key="s.id" :value="s.id">{{ s.title }}</option>
        </optgroup>
        <optgroup label="Предложения">
          <option v-for="s in PAIR_SETS" :key="s.id" :value="s.id">{{ s.title }}</option>
        </optgroup>
      </select>
      <span class="kbd">пробел — перевернуть · → — следующая</span>
    </div>
    <div class="rv-stage">
      <div class="rv-deck">
        <!-- переворот: карточка стоит на месте и вращается вокруг вертикальной оси; ключ по слову, чтобы новая карточка появлялась лицом без вращения (иначе на миг виден ответ) -->
        <div class="rv-persp">
          <div :key="word.k + ':' + pos" ref="flipEl" class="rv-flip" :class="{ flipped: open }" role="button" tabindex="0" :aria-pressed="open" aria-label="Перевернуть карточку" @click="open = !open" @keydown.enter.stop.prevent="open = !open">
            <div class="fc rv-face rv-front" :aria-hidden="open">
              <div class="big" :class="{ long }">{{ front }}</div>
              <div class="hint">нажми, чтобы перевернуть</div>
            </div>
            <div class="fc rv-face rv-back" :aria-hidden="!open">
              <div class="big" :class="{ long }">{{ word.k }}</div>
              <div class="ans" :class="{ long }">
                {{ word.r }}<b>{{ word.t }}</b><small>{{ word.s }}</small>
              </div>
            </div>
          </div>
        </div>
        <div class="rv-top">
          <span ref="countEl" class="rv-count">{{ pos + 1 }} / {{ deck.length }}</span>
          <button type="button" class="rv-icon" title="Перемешать колоду" aria-label="Перемешать колоду" @click="shuffle">⇄</button>
        </div>
        <div v-if="canMark" class="rv-bottom"><MarkStar kind="w" :id="word.k" /></div>
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
/* предложения и длинные слова: мельче и с переносом, перевод тоже */
.review-page .fc .big.long { font-size: clamp(26px, 3.6vw, 44px); line-height: 1.25; overflow-wrap: anywhere; }
.review-page .fc .ans.long b { font-size: 26px; line-height: 1.25; }
@media (max-width: 900px) {
  .review-page .rv-stage { grid-template-columns: 1fr; }
  .review-page .rv-yuna { max-width: 280px; justify-self: center; }
}
</style>
