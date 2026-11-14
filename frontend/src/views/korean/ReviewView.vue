<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import MarkStar from '@/components/korean/MarkStar.vue'
import { CATN, D } from '@/data/korean/words'
import { STUDY } from '@/data/korean/study'
import { PAIR_SETS, SETS, pool } from '@/data/korean/trainer'
import { NEW_NOTE, newToday, pickSession, type SessionCard } from '@/data/review'
import yunaImg from '@/assets/home/yuna-review.webp'
import { burst, cascade, pop } from '@/lib/fx'
import { newRound, useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const cat = ref('')
const open = ref(false)

/* ---------- порция: сколько слов за раз и сколько новых в день (числа вводит владелец, помнятся в браузере) ---------- */
const SIZE_KEY = 'rv_size'
const NEW_KEY = 'rv_new'
const size = ref(10)
const newMax = ref(5)
const clamp = (v: unknown, min: number, max: number, d: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && v !== '' && v !== null ? Math.min(max, Math.max(min, n)) : d
}
function saveNums() {
  size.value = clamp(size.value, 1, 50, 10)
  newMax.value = clamp(newMax.value, 0, 50, 5)
  try {
    localStorage.setItem(SIZE_KEY, String(size.value))
    localStorage.setItem(NEW_KEY, String(newMax.value))
  } catch {
    /* без хранилища числа просто не запомнятся */
  }
  start()
}

/* ---------- раунд ---------- */
/** Очередь карточек: первая на экране. «Не помню» возвращает карточку в очередь через несколько штук, раунд идёт, пока очередь не опустеет. */
const queue = ref<SessionCard[]>([])
const total = ref(0)
/** сколько карточек вспомнилось с первого показа */
const firstTry = ref(0)
/** каких карточек в раунде сколько: пора повторить, новые, закрепление */
const parts = ref({ due: 0, new: 0, extra: 0 })
/** меняется на каждой карточке: по нему новая карточка появляется лицом, без вращения */
const step = ref(0)
/** через сколько карточек возвращается та, что не вспомнилась */
const BACK_AFTER = 3
let answered = new Set<string>()
let round = ''

const card = computed(() => queue.value[0])
const finished = computed(() => total.value > 0 && !queue.value.length)
const idOf = (c: SessionCard) => `${c.word.n}:${c.word.k}`
/** сколько разных карточек ещё не вспомнили */
const left = computed(() => new Set(queue.value.map(idOf)).size)
const done = computed(() => total.value - left.value)

/** Те же группы, что в «Найди пару»: наборы по грамматике и предложения берутся из `trainer.ts`, темы словаря из слов для заданий (`STUDY`). */
const isSet = (c: string) => SETS.some(s => s.id === c) || PAIR_SETS.some(s => s.id === c)
const DICT = new Set(D.map(d => d.k))
/** звёздочка «отметить слово» только у слов словаря (у предложений и форм её нет, даже если фраза есть и в словаре) */
const canMark = computed(() => !!card.value && !PAIR_SETS.some(s => s.id === cat.value) && DICT.has(card.value.word.k))
/** лицо карточки: у вопросительных предложений предложение с пропуском */
const front = computed(() => (card.value ? ((card.value.word as { blank?: string }).blank ?? card.value.word.k) : ''))
/** длинное (предложение) пишется мельче, чтобы помещалось на карточке */
const long = computed(() => isSet(cat.value) && front.value.length > 8)
const KIND = { due: 'пора повторить', new: 'новое слово', extra: 'закрепление' } as const

const flipEl = ref<HTMLElement>()
const countEl = ref<HTMLElement>()
const deckEl = ref<HTMLElement>()
/** Новая карточка выезжает, как задания в тренажёрах (`lib/fx.ts`; при «уменьшить движение» появляется сразу). */
const enter = () => void nextTick(() => flipEl.value && cascade([flipEl.value]))

function start() {
  const cards = isSet(cat.value) ? pool(cat.value) : cat.value ? STUDY.filter(d => d.c.includes(cat.value)) : STUDY
  const q = pickSession(cards, progress.data, { size: size.value, newLeft: newMax.value - newToday(progress.data) })
  queue.value = q
  total.value = q.length
  firstTry.value = 0
  parts.value = { due: q.filter(c => c.kind === 'due').length, new: q.filter(c => c.kind === 'new').length, extra: q.filter(c => c.kind === 'extra').length }
  answered = new Set()
  round = newRound()
  open.value = false
  step.value++
  enter()
  pop(countEl.value)
}

/** Ответ после переворота. В прогресс идёт только первый ответ по карточке за раунд: вернувшаяся карточка очков не меняет. */
function answer(ok: boolean) {
  const c = card.value
  if (!c || !open.value) return
  const id = idOf(c)
  if (!answered.has(id)) {
    answered.add(id)
    if (ok) firstTry.value++
    progress.record({
      word: c.key,
      ok,
      source: 'review',
      mode: 'cards',
      detail: { q: front.value, a: c.word.t, y: ok ? undefined : 'не помню', n: c.kind === 'new' ? NEW_NOTE : undefined, r: round },
    })
  }
  const rest = queue.value.slice(1)
  if (!ok) rest.splice(Math.min(BACK_AFTER, rest.length), 0, c)
  queue.value = rest
  open.value = false
  step.value++
  pop(countEl.value)
  if (rest.length) return enter()
  void nextTick(() => {
    const r = deckEl.value?.getBoundingClientRect()
    if (r) burst(r.left + r.width / 2, r.top + r.height / 2, 26)
  })
}

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'SELECT' || tag === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
  if (finished.value) {
    if (e.key === 'Enter') start()
    return
  }
  if (e.key === ' ') {
    e.preventDefault()
    open.value = !open.value
  }
  if (e.key === 'Enter') open.value = true
  if (e.key === '1') answer(true)
  if (e.key === '2') answer(false)
}
onMounted(() => {
  try {
    size.value = clamp(localStorage.getItem(SIZE_KEY), 1, 50, 10)
    newMax.value = clamp(localStorage.getItem(NEW_KEY), 0, 50, 5)
  } catch {
    /* хранилища нет: остаются 10 и 5 */
  }
  start()
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="wrap review-page">
    <SectionHead id="review" />
    <div class="fcb">
      <select v-model="cat" aria-label="Группа слов" @change="start">
        <option value="">Все слова</option>
        <option v-for="(name, c) in CATN" :key="c" :value="c">{{ name }}</option>
        <optgroup label="Грамматика">
          <option v-for="s in SETS" :key="s.id" :value="s.id">{{ s.title }}</option>
        </optgroup>
        <optgroup label="Предложения">
          <option v-for="s in PAIR_SETS" :key="s.id" :value="s.id">{{ s.title }}</option>
        </optgroup>
      </select>
      <label class="rv-num">Слов за раз <input v-model="size" type="number" min="1" max="50" inputmode="numeric" @change="saveNums" /></label>
      <label class="rv-num">Новых в день <input v-model="newMax" type="number" min="0" max="50" inputmode="numeric" @change="saveNums" /></label>
    </div>
    <p class="rv-info">
      <span>В раунде: <b>{{ parts.due }}</b> пора повторить · <b>{{ parts.new }}</b> новых · <b>{{ parts.extra }}</b> на закрепление.</span>
      <span class="kbd">пробел — перевернуть · 1 — помню · 2 — не помню</span>
    </p>
    <div class="rv-prog" role="progressbar" :aria-valuenow="done" aria-valuemin="0" :aria-valuemax="total" aria-label="Сколько карточек уже вспомнилось">
      <i :style="{ width: (total ? (done / total) * 100 : 0) + '%' }"></i>
    </div>
    <div class="rv-stage">
      <div ref="deckEl" class="rv-deck" :class="{ end: finished }">
        <div v-if="finished" class="fc rv-end">
          <div class="rv-score">{{ firstTry }} <small>из {{ total }}</small></div>
          <p class="rv-end-t">с первого раза</p>
          <p class="rv-end-s">
            <template v-if="firstTry === total"><Icon name="sakura" /> Все карточки с первого раза!</template>
            <template v-else>Карточки с «Не помню» вернутся первыми в следующих раундах.</template>
          </p>
        </div>
        <template v-else-if="card">
          <!-- переворот: карточка стоит на месте и вращается вокруг вертикальной оси; ключ меняется на каждой карточке, чтобы новая появлялась лицом без вращения (иначе на миг виден ответ) -->
          <div class="rv-persp">
            <div :key="step" ref="flipEl" class="rv-flip" :class="{ flipped: open }" role="button" tabindex="0" :aria-pressed="open" aria-label="Перевернуть карточку" @click="open = !open" @keydown.enter.stop.prevent="open = !open">
              <div class="fc rv-face rv-front" :aria-hidden="open">
                <div class="big" :class="{ long }">{{ front }}</div>
                <div class="hint">вспомни перевод и нажми, чтобы перевернуть</div>
              </div>
              <div class="fc rv-face rv-back" :aria-hidden="!open">
                <div class="big" :class="{ long }">{{ card.word.k }}</div>
                <div class="ans" :class="{ long }">
                  {{ card.word.r }}<b>{{ card.word.t }}</b><small>{{ card.word.s }}</small>
                </div>
              </div>
            </div>
          </div>
          <span class="rv-kind" :class="card.kind">{{ KIND[card.kind] }}</span>
          <div class="rv-top">
            <span ref="countEl" class="rv-count">осталось {{ left }}</span>
            <button type="button" class="rv-icon" title="Новый раунд" aria-label="Новый раунд" @click="start">⇄</button>
          </div>
          <div v-if="canMark" class="rv-bottom"><MarkStar kind="w" :id="card.word.k" /></div>
        </template>
        <div v-else class="fc rv-end"><p class="rv-end-s">В этой группе пока нет карточек.</p></div>
      </div>
      <img class="rv-yuna" :src="yunaImg" alt="" aria-hidden="true" draggable="false" />
    </div>
    <div class="fcb rv-act">
      <button v-if="finished || !card" type="button" @click="start">Ещё раунд →</button>
      <button v-else-if="!open" type="button" class="plain" @click="open = true">Показать ответ</button>
      <template v-else>
        <button type="button" class="rv-yes" @click="answer(true)">Помню <kbd>1</kbd></button>
        <button type="button" class="rv-no" @click="answer(false)">Не помню <kbd>2</kbd></button>
      </template>
    </div>
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
/* порция: два поля с числами рядом со списком групп */
.review-page .rv-num { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--muted); }
.review-page .rv-num input { width: 74px; padding: 10px 12px; font: inherit; font-weight: 700; color: var(--ink); text-align: center;
  border: 1px solid var(--line); background: var(--surface); border-radius: 12px; }
.review-page .rv-num input:focus-visible { outline: 2px solid var(--accent, #8a6cf0); outline-offset: 2px; }
.review-page .rv-info { margin: 14px 0 0; font-size: 14px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; }
.review-page .rv-info b { color: var(--ink); }
.review-page .rv-info .kbd { font-size: 12px; }
/* полоска раунда: растёт плавно с каждой вспомненной карточкой */
.review-page .rv-prog { margin-top: 12px; height: 8px; border-radius: 999px; background: rgba(150, 130, 230, .16); overflow: hidden; }
.review-page .rv-prog i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #f29ac9, #8fb8f5); transition: width .45s cubic-bezier(.2, .75, .25, 1); }
.review-page .rv-kind { position: absolute; z-index: 3; top: 18px; left: 20px; padding: 6px 14px; font-size: 13px; font-weight: 700; border-radius: 999px;
  color: var(--muted); background: rgba(150, 130, 230, .14); }
.review-page .rv-kind.due { color: var(--bad); background: var(--bad-bg); }
.review-page .rv-kind.new { color: var(--ok); background: var(--ok-bg); }
.review-page .rv-act button { display: inline-flex; align-items: center; gap: 8px; }
.review-page .rv-act kbd { font: inherit; font-size: 12px; padding: 1px 7px; border-radius: 6px; background: rgba(255, 255, 255, .28); }
.study .review-page .rv-act button.rv-yes { background: #3fa77a; border-color: #3fa77a; }
.study .review-page .rv-act button.rv-no { background: #d1607a; border-color: #d1607a; }
/* место под метку «пора повторить / новое слово» над словом */
.review-page .rv-deck .rv-face { padding-top: 68px; }
/* итог раунда */
.review-page .rv-end { align-items: center; text-align: center; cursor: default; }
.review-page .rv-score { font-family: var(--serif); font-size: clamp(64px, 9vw, 104px); font-weight: 700; line-height: 1; font-variant-numeric: lining-nums; }
.review-page .rv-score small { font-size: .38em; color: var(--muted); font-weight: 600; }
.review-page .rv-end-t { margin: 8px 0 0; font-size: 18px; font-weight: 700; }
.review-page .rv-end-s { margin: 10px 0 0; font-size: 15px; color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .review-page .rv-prog i { transition: none; } }
/* предложения и длинные слова: мельче и с переносом, перевод тоже */
.review-page .fc .big.long { font-size: clamp(26px, 3.6vw, 44px); line-height: 1.25; overflow-wrap: anywhere; }
.review-page .fc .ans.long b { font-size: 26px; line-height: 1.25; }
@media (max-width: 900px) {
  .review-page .rv-stage { grid-template-columns: 1fr; }
  .review-page .rv-yuna { max-width: 280px; justify-self: center; }
}
</style>
