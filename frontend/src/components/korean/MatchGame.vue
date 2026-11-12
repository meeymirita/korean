<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { shuffle } from '@/data/korean/tasks'
import { matchDetail, shown, statKey, type TWord } from '@/data/korean/trainer'
import { burst, cascade, pop, shake } from '@/lib/fx'
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

/* ---------- карточки, линии и перетаскивание ---------- */
const board = ref<HTMLElement>()
const cards = new Map<string, HTMLElement>()
const setCard = (side: 'l' | 'r', id: number) => (el: unknown) => {
  if (el) cards.set(side + id, el as HTMLElement)
  else cards.delete(side + id)
}

/** Плавная линия от карточки к карточке (или к курсору): из правого края левой в левый край правой. */
function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2) * (x2 >= x1 ? 1 : -1)
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}
const anchor = (el: HTMLElement, side: 'l' | 'r') => {
  const b = board.value!.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return { x: (side === 'l' ? r.right : r.left) - b.left, y: r.top + r.height / 2 - b.top }
}

interface Drag {
  side: 'l' | 'r'
  id: number
  x: number
  y: number
  moved: boolean
}
const drag = ref<Drag | null>(null)
/** карточка под курсором во время перетаскивания: «l3» / «r3» */
const over = ref<string | null>(null)
let start = { x: 0, y: 0 }
let suppressClick = false
/** Как соединили пару: для журнала ответов. */
let via: 'линией' | 'нажатием' = 'нажатием'

/** Запас вокруг карточки, в котором линия всё ещё считается доведённой: пером и пальцем трудно попасть точно, а между карточками есть щели. */
const REACH_X = 28
const REACH_Y = 6
/**
 * Карточка противоположной колонки, до которой дотянули линию: ближайшая по высоте из тех, в чей прямоугольник (с запасом) попала точка.
 * Считается по размерам карточек, а не по элементу под курсором: так отпускание в щели между карточками или у самого края тоже соединяет пару.
 */
function cardAt(x: number, y: number, from: 'l' | 'r') {
  const side = from === 'l' ? 'r' : 'l'
  let best: { side: 'l' | 'r'; id: number } | null = null
  let bestDist = Infinity
  for (const [key, el] of cards) {
    if (!key.startsWith(side)) continue
    const id = Number(key.slice(1))
    if (matched.value.has(id)) continue
    const r = el.getBoundingClientRect()
    if (x < r.left - REACH_X || x > r.right + REACH_X || y < r.top - REACH_Y || y > r.bottom + REACH_Y) continue
    const dist = Math.abs(y - (r.top + r.height / 2))
    if (dist < bestDist) {
      best = { side, id }
      bestDist = dist
    }
  }
  return best
}
/** Пока ведём линию, страница не должна прокручиваться: иначе браузер на планшете забирает жест и обрывает линию (в дополнение к touch-action у карточек). */
const blockScroll = (e: TouchEvent) => {
  if (drag.value && e.cancelable) e.preventDefault()
}
function down(e: PointerEvent, side: 'l' | 'r', id: number) {
  if (e.button !== 0 || matched.value.has(id) || wrong.value) return
  start = { x: e.clientX, y: e.clientY }
  drag.value = { side, id, x: e.clientX, y: e.clientY, moved: false }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('touchmove', blockScroll, { passive: false })
}
function move(e: PointerEvent) {
  const d = drag.value
  if (!d) return
  d.x = e.clientX
  d.y = e.clientY
  if (!d.moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) d.moved = true
  if (!d.moved) return
  const t = cardAt(e.clientX, e.clientY, d.side)
  over.value = t ? t.side + t.id : null
}
function stopDrag() {
  drag.value = null
  over.value = null
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', up)
  window.removeEventListener('pointercancel', cancel)
  window.removeEventListener('touchmove', blockScroll)
}
/** Линию довели до точки (x, y): если там карточка другой колонки, пара проверяется. */
function finishAt(x: number, y: number) {
  const d = drag.value
  stopDrag()
  if (!d?.moved) return
  // после перетаскивания браузер ещё пришлёт click: его не считаем
  suppressClick = true
  setTimeout(() => (suppressClick = false), 0)
  const t = cardAt(x, y, d.side)
  if (!t || wrong.value) return
  selL.value = selR.value = null
  via = 'линией'
  pick(d.side, d.id)
  pick(t.side, t.id)
  via = 'нажатием'
}
const up = (e: PointerEvent) => finishAt(e.clientX, e.clientY)
/** Браузер прервал жест (на планшете так бывает и без нашей вины): считаем линию доведённой до последней точки, а не теряем её. */
const cancel = () => finishAt(drag.value?.x ?? -1, drag.value?.y ?? -1)
const onClick = (side: 'l' | 'r', id: number) => !suppressClick && pick(side, id)
onBeforeUnmount(stopDrag)

/** Линия, которую ведёт курсор. */
const dragPath = computed(() => {
  const d = drag.value
  const el = d?.moved ? cards.get(d.side + d.id) : undefined
  if (!d || !el || !board.value) return ''
  const a = anchor(el, d.side)
  const b = board.value.getBoundingClientRect()
  return curve(a.x, a.y, d.x - b.left, d.y - b.top)
})
/** Точка под пером или пальцем на конце линии, которую ведут. */
const dragDot = computed(() => {
  const d = drag.value
  if (!d?.moved || !board.value) return null
  const b = board.value.getBoundingClientRect()
  return { x: d.x - b.left, y: d.y - b.top }
})
/** Линии верно найденных пар: остаются до конца раунда. */
interface Link { id: number; d: string; x1: number; y1: number; x2: number; y2: number }
const links = ref<Link[]>([])
function linkOf(id: number): Link | null {
  const a = cards.get('l' + id)
  const b = cards.get('r' + id)
  if (!a || !b || !board.value) return null
  const p1 = anchor(a, 'l')
  const p2 = anchor(b, 'r')
  return { id, d: curve(p1.x, p1.y, p2.x, p2.y), x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
}
function celebrate(l: number, r: number) {
  // линию считаем до анимации карточек: «вскакивание» на миг меняет их размер
  const link = linkOf(l)
  if (link) links.value = [...links.value, link]
  pop(cards.get('l' + l))
  pop(cards.get('r' + r))
}
/** Размер окна изменился: карточки переехали, линии пересчитываются. */
const relink = () => (links.value = links.value.map(x => linkOf(x.id)).filter((x): x is Link => !!x))

onMounted(() => {
  cascade(board.value?.querySelectorAll('.mg-card') ?? [])
  window.addEventListener('resize', relink)
})
onBeforeUnmount(() => window.removeEventListener('resize', relink))
watch(done, v => {
  if (!v) return
  void nextTick(() => {
    const r = board.value?.parentElement?.querySelector('.mg-end')?.getBoundingClientRect()
    if (r) burst(r.left + r.width / 2, r.top + r.height / 2)
  })
})


/** Текст карточки, как он показан на экране (без переносов). */
const cardText = (key: string) => (cards.get(key)?.textContent ?? '').replace(/\s+/g, ' ').trim()
/** Подробности для журнала: что соединили, как, и что ещё оставалось на экране. */
function detailOf(word: TWord, picked: TWord) {
  const open = (side: 'l' | 'r', list: TWord[]) => list.filter(w => !matched.value.has(w.n)).map(w => cardText(side + w.n))
  return matchDetail(word, picked, {
    via,
    leftText: cardText('l' + word.n),
    rightText: cardText('r' + picked.n),
    leftOpen: open('l', left.value),
    rightOpen: open('r', right.value),
  })
}

function pick(side: 'l' | 'r', id: number) {
  if (matched.value.has(id) || wrong.value) return
  if (side === 'l') selL.value = id
  else selR.value = id
  if (selL.value === null || selR.value === null) return

  const l = selL.value
  const r = selR.value
  selL.value = selR.value = null
  const word = props.words.find(x => x.n === l)
  const picked = props.words.find(x => x.n === r)
  // до смены состояния: в журнал идёт то, что было на экране в момент ответа
  const detail = word && picked ? detailOf(word, picked) : undefined
  if (l === r) {
    // засчитываем слово, если в этом раунде в нём не ошибались
    if (word && !missed.value.has(l)) progress.record({ word: statKey(word), ok: true, source: 'trainer', mode: 'match', detail })
    matched.value = new Set(matched.value).add(l)
    celebrate(l, r)
  } else {
    mistakes.value++
    if (word) progress.record({ word: statKey(word), ok: false, source: 'trainer', mode: 'match', detail })
    missed.value = new Set(missed.value).add(l)
    wrong.value = { l, r }
    shake(cards.get('l' + l))
    shake(cards.get('r' + r))
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

    <div ref="board" class="mg-board" @dragstart.prevent @contextmenu.prevent>
      <svg class="mg-lines" aria-hidden="true">
        <defs>
          <linearGradient id="mg-grad" gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#f49ac6" />
            <stop offset="100%" stop-color="#86b6f6" />
          </linearGradient>
        </defs>
        <g v-for="x in links" :key="x.id" class="kept">
          <path :d="x.d" pathLength="1" />
          <circle :cx="x.x1" :cy="x.y1" r="4.5" />
          <circle :cx="x.x2" :cy="x.y2" r="4.5" />
        </g>
        <path v-if="dragPath" :d="dragPath" class="drag" />
        <circle v-if="dragDot" :cx="dragDot.x" :cy="dragDot.y" r="6" class="drag-dot" />
      </svg>
      <div class="mg-col">
        <button
          v-for="w in left"
          :key="w.n"
          :ref="setCard('l', w.n)"
          class="mg-card ko"
          data-side="l"
          :data-id="w.n"
          :class="{
            'mg-aim': over === 'l' + w.n,
            sel: selL === w.n,
            ok: matched.has(w.n),
            bad: wrong?.l === w.n,
          }"
          :disabled="matched.has(w.n)"
          @pointerdown="down($event, 'l', w.n)"
          @click="onClick('l', w.n)"
        >
          <b>{{ w.k }}</b>
          <small v-if="showReading && w.r">{{ w.r }}</small>
        </button>
      </div>
      <div class="mg-col">
        <button
          v-for="w in right"
          :key="w.n"
          :ref="setCard('r', w.n)"
          class="mg-card"
          data-side="r"
          :data-id="w.n"
          :class="{
            'mg-aim': over === 'r' + w.n,
            sel: selR === w.n,
            ok: matched.has(w.n),
            bad: wrong?.r === w.n,
          }"
          :disabled="matched.has(w.n)"
          @pointerdown="down($event, 'r', w.n)"
          @click="onClick('r', w.n)"
        >
          {{ shown(w) }}
        </button>
      </div>
    </div>

    <div v-if="done" class="mg-end">
      <div>
        <b><template v-if="mistakes === 0"><Icon name="sakura" /> Без ошибок!</template><template v-else>Готово!</template></b>
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
/* между колонками широкий просвет: в нём видно линии и удобно вести пером */
.study .mg-board { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 14px clamp(56px, 14%, 170px); margin-top: 18px; }
.study .mg-col { display: flex; flex-direction: column; gap: 8px; }
.study .mg-card { touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; position: relative; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px;
  min-height: 56px; padding: 10px 14px; font-size: 16px; text-align: left; background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; transition: border-color .15s, background .15s, opacity .3s, transform .15s; }
.study .mg-card.ko b { font-family: var(--ko); font-size: 22px; font-weight: 700; }
.study .mg-card small { font-size: 12px; color: var(--muted); }
.study .mg-card:not(:disabled):hover { border-color: var(--gold); }
.study .mg-card.sel { border-color: var(--gold); background: var(--gold-soft); transform: scale(1.02); }
.study .mg-card.ok { background: var(--ok-bg); border-color: var(--ok); color: var(--ok); opacity: .55; cursor: default; }
.study .mg-card.bad { background: var(--bad-bg); border-color: var(--bad); }
/* карточка, к которой подвели линию: только цвет и обводка, без увеличения (от scale список «прыгал» при переходе с карточки на карточку) */
/* класс именно mg-aim, а не over: на странице игр у `.game .over` (окно конца игры движка) стоит display: none, и карточка под линией исчезала, а колонка съезжала */
.study .mg-card.mg-aim { border-color: var(--gold); background: var(--gold-soft); box-shadow: 0 0 0 3px var(--gold-soft); }
/* тянем слово к переводу: всё движение по карточке наше (touch-action: none). С pan-y браузер на iPad забирал жест пера при малейшем сдвиге вверх или вниз:
   страница дёргалась, линия обрывалась (pointercancel). Прокручивать страницу можно по просвету между колонками и по полям. */
.study .mg-card:not(:disabled) { touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
.study .mg-lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; z-index: 2; }
.study .mg-lines path { fill: none; stroke: url(#mg-grad); stroke-width: 4; stroke-linecap: round; filter: drop-shadow(0 2px 5px rgba(150, 130, 230, .35)); }
.study .mg-lines circle { fill: #fff; stroke: url(#mg-grad); stroke-width: 3; }
.study .mg-lines .drag { opacity: .85; }
.study .mg-lines .drag-dot { fill: #f49ac6; stroke: #fff; stroke-width: 2.5; }
/* найденная пара: линия «рисуется» от слова к переводу и остаётся, чуть бледнее */
.study .mg-lines .kept { opacity: .7; }
.study .mg-lines .kept path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: mg-draw .38s ease-out forwards; }
@keyframes mg-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .study .mg-lines .kept path { animation: none; stroke-dashoffset: 0; } }
.study .mg-end { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 18px;
  padding: 18px 22px; border-radius: 16px; background: var(--gold-soft); border: 1px solid var(--line); }
.study .mg-end > div:first-child { display: flex; flex-direction: column; gap: 2px; }
.study .mg-end b { font-family: var(--serif); font-size: 26px; font-weight: 600; }
.study .mg-end span { font-size: 13px; color: var(--muted); }
.study .mg-clock { padding: 4px 12px; font: inherit; font-size: 13px; font-weight: 600; background: var(--surface); border: 1px solid var(--line); border-radius: 99px; cursor: pointer; }
.study .mg-clock.on { background: var(--gold-soft); border-color: var(--gold); }
.study .mg-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.study .mg-actions button { transition: transform .15s cubic-bezier(.34, 1.56, .64, 1); border: 1px solid var(--gold); background: var(--gold); color: #fff; border-radius: 12px; padding: 10px 18px; font-weight: 600; }
.study .mg-actions button:active { transform: scale(.94); }
.study .mg-actions button:first-child:not(:last-child) { background: transparent; color: var(--ink); }
@media (max-width: 560px) { .study .mg-board { gap: 8px 40px; } .study .mg-card { padding: 8px 10px; font-size: 14px; } .study .mg-card.ko b { font-size: 18px; } }
</style>
