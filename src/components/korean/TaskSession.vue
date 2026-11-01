<script setup lang="ts">
import Cat from '@/components/Cat.vue'
import Icon from '@/components/Icon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExplainBox from '@/components/korean/ExplainBox.vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { MOODS, type Mood } from '@/data/mood'
import { clock, paceSummary, PACE_CAP } from '@/data/pace'
import type { Task } from '@/data/korean/tasks'
import { burst, cascade, drop, follow, pop, shake, springBack } from '@/lib/fx'
import { itemIcon, itemName } from '@/data/shop'
import { useProgressStore } from '@/stores/progress'
import { useShopStore } from '@/stores/shop'

/**
 * Серия заданий по одному: вопрос, варианты (клавиши 1–9), «Дальше» (Enter или →), итог со списком ошибок.
 * Ответы пишутся в прогресс с источником `source`. Новый набор (смена `tasks`) начинает серию заново.
 */
const props = defineProps<{ tasks: Task[]; source: string; /** режим для отчёта в кабинете: particles, translate, pairs… */ mode?: string; againLabel?: string }>()
const emit = defineEmits<{ again: [] }>()

const progress = useProgressStore()
const shop = useShopStore()
/** Задания серии: «Повтор вопроса» переносит текущее в конец. */
const list = ref<Task[]>([...props.tasks])
const idx = ref(0)
const picked = ref<string | null>(null)
const missed = ref<Task[]>([])
const right = ref(0)
/** Отметка «как прошло»: одна на серию, после неё кнопки заменяются подтверждением. */
const moodSet = ref<Mood | null>(null)
function setMood(m: Mood) {
  if (moodSet.value) return
  moodSet.value = m
  progress.addMood(m)
}

/** Секундомер: время на каждое задание, от показа вопроса до ответа. */
const times = ref<number[]>([])
const shownAt = ref(Date.now())
const elapsed = ref(0)
let tick: ReturnType<typeof setInterval> | undefined
const pace = computed(() => paceSummary(times.value))

const current = computed(() => list.value[idx.value])
const finished = computed(() => idx.value >= list.value.length)

/* ---------- предметы из магазина ---------- */
const owner = computed(() => progress.unlocked && !progress.isGuest)
const removed = ref<string[]>([]) // варианты, убранные «50/50» и подсказкой
const hintText = ref('')
const hinted = ref(false)
const pending = ref<string | null>(null) // неверный ответ, который ещё можно исправить «Вторым шансом»
const chanceUsed = ref(false)
const visible = computed(() => (current.value?.options ?? []).filter(o => !removed.value.includes(o)))
const wrongLeft = () => visible.value.filter(o => o !== current.value?.answer)
const ITEM_BTNS = [
  { id: 'hint', label: 'Подсказка' },
  { id: 'fifty', label: '50/50' },
  { id: 'skip', label: 'Повтор' },
] as const
const btns = computed(() => (owner.value ? ITEM_BTNS.filter(b => shop.count(b.id) > 0) : []))
const canUse = (id: string) => !shop.busy && (id !== 'skip' || idx.value + 1 < list.value.length) && (id !== 'hint' || !hinted.value) && (id !== 'fifty' || wrongLeft().length > 1)
function resetItems() {
  removed.value = []
  hintText.value = ''
  hinted.value = false
  pending.value = null
  chanceUsed.value = false
}
async function useItem(id: 'hint' | 'fifty' | 'skip') {
  const t = current.value
  if (!t || picked.value !== null || !canUse(id) || !(await shop.use(id))) return
  if (id === 'skip') {
    list.value.push(list.value.splice(idx.value, 1)[0]!)
    resetItems()
    shownAt.value = Date.now()
    elapsed.value = 0
    return enter()
  }
  const drop = (n: number) => {
    const w = wrongLeft().sort(() => Math.random() - 0.5).slice(0, Math.min(n, wrongLeft().length - 1))
    removed.value = [...removed.value, ...w]
  }
  if (id === 'hint') {
    hinted.value = true
    hintText.value = `Подсказка Юны: ответ начинается с «${[...t.answer][0]}»`
    drop(1)
  } else drop(2)
}
async function secondChance() {
  const bad = pending.value
  if (bad === null || !(await shop.use('second'))) return
  removed.value = [...removed.value, bad]
  pending.value = null
  picked.value = null
  chanceUsed.value = true
  hintText.value = 'Второй шанс: выбери другой вариант'
}
function keepWrong() {
  const bad = pending.value
  if (bad === null) return
  pending.value = null
  commit(bad)
}

/* ---------- перетаскивание варианта на вопрос, анимации ---------- */
const zone = ref<HTMLElement>()
const optsBox = ref<HTMLElement>()
const over = ref(false)
let dragEl: HTMLElement | null = null
let dragOpt = ''
let dragFrom = { x: 0, y: 0 }
let moved = false
let suppressClick = false

const hitZone = (x: number, y: number) => {
  const r = zone.value?.getBoundingClientRect()
  return !!r && x >= r.left - 12 && x <= r.right + 12 && y >= r.top - 12 && y <= r.bottom + 12
}
function optDown(e: PointerEvent, o: string) {
  if (e.button !== 0 || picked.value !== null) return
  dragEl = e.currentTarget as HTMLElement
  dragOpt = o
  dragFrom = { x: e.clientX, y: e.clientY }
  moved = false
  window.addEventListener('pointermove', optMove)
  window.addEventListener('pointerup', optUp)
  window.addEventListener('pointercancel', optCancel)
}
function optMove(e: PointerEvent) {
  if (!dragEl) return
  const dx = e.clientX - dragFrom.x
  const dy = e.clientY - dragFrom.y
  if (!moved && Math.hypot(dx, dy) > 8) {
    moved = true
    dragEl.classList.add('dragging')
  }
  if (!moved) return
  follow(dragEl, dx, dy)
  over.value = hitZone(e.clientX, e.clientY)
}
function endDrag() {
  window.removeEventListener('pointermove', optMove)
  window.removeEventListener('pointerup', optUp)
  window.removeEventListener('pointercancel', optCancel)
  over.value = false
}
function optCancel() {
  const el = dragEl
  endDrag()
  dragEl = null
  if (el && moved) {
    el.classList.remove('dragging')
    springBack(el)
  }
}
function optUp(e: PointerEvent) {
  const el = dragEl
  const o = dragOpt
  const wasMoved = moved
  const hit = hitZone(e.clientX, e.clientY)
  endDrag()
  dragEl = null
  if (!el || !wasMoved) return
  // после перетаскивания браузер ещё пришлёт click: его не считаем
  suppressClick = true
  setTimeout(() => (suppressClick = false), 0)
  el.classList.remove('dragging')
  if (hit && picked.value === null) {
    drop(el)
    answer(o)
  } else springBack(el)
}
const onPick = (o: string) => !suppressClick && answer(o)
function enter() {
  void nextTick(() => cascade(optsBox.value?.querySelectorAll('.rs-opt') ?? []))
}
watch([idx, () => props.tasks], enter)
onMounted(() => {
  enter()
  if (owner.value) void shop.load()
})
let roundId = Math.random().toString(36).slice(2, 12)
watch(finished, v => {
  if (!v) return
  progress.roundDone(roundId, list.value.length, right.value)
  void nextTick(() => {
    const r = document.querySelector('.rs-end')?.getBoundingClientRect()
    if (r && right.value >= props.tasks.length / 2) burst(r.left + r.width / 2, r.top + 40)
  })
})

watch(
  () => props.tasks,
  () => {
    list.value = [...props.tasks]
    resetItems()
    roundId = Math.random().toString(36).slice(2, 12)
    idx.value = 0
    picked.value = null
    missed.value = []
    right.value = 0
    moodSet.value = null
    times.value = []
    shownAt.value = Date.now()
    elapsed.value = 0
  },
)

function answer(option: string) {
  const t = current.value
  if (!t || picked.value !== null) return
  // «Второй шанс»: неверный ответ ещё не записан, его можно исправить один раз
  if (option !== t.answer && owner.value && !chanceUsed.value && shop.count('second') > 0) {
    pending.value = option
    picked.value = option
    shake(zone.value)
    return
  }
  commit(option)
}
function commit(option: string) {
  const t = current.value
  if (!t) return
  picked.value = option
  times.value.push(Math.min((Date.now() - shownAt.value) / 1000, PACE_CAP))
  const ok = option === t.answer
  if (ok) right.value++
  else missed.value.push(t)
  progress.record({ word: t.word, ok, source: props.source, mode: props.mode, ...(hinted.value && ok ? { xp: 5 } : {}), detail: { q: `${t.title}: ${t.prompt}`, a: t.answer, y: ok ? undefined : option } })
  ;(ok ? pop : shake)(zone.value)
}
function next() {
  idx.value++
  resetItems()
  picked.value = null
  shownAt.value = Date.now()
  elapsed.value = 0
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const t = current.value
  if (!t) return
  if (picked.value === null && /^[1-9]$/.test(e.key)) {
    const o = visible.value[Number(e.key) - 1]
    if (o) answer(o)
  } else if (pending.value !== null && (e.key === 'Enter' || e.key === 'ArrowRight')) {
    e.preventDefault()
    keepWrong()
  } else if (picked.value !== null && (e.key === 'Enter' || e.key === 'ArrowRight')) {
    e.preventDefault()
    next()
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  tick = setInterval(() => {
    if (picked.value === null && !finished.value) elapsed.value = Math.min(Math.floor((Date.now() - shownAt.value) / 1000), PACE_CAP)
  }, 1000)
})
onBeforeUnmount(() => {
  endDrag()
  document.removeEventListener('keydown', onKey)
  clearInterval(tick)
})
</script>

<template>
  <div class="rs">
    <template v-if="!finished && current">
      <div class="rs-bar">
        <span>{{ idx + 1 }} из {{ tasks.length }}</span>
        <span class="rs-clock" aria-label="Время на задание"><Icon name="stopwatch" /> {{ clock(elapsed) }}</span>
        <span>верно: {{ right }}</span>
      </div>
      <div class="qk-prog" role="progressbar" :aria-valuenow="idx" aria-valuemin="0" :aria-valuemax="tasks.length"><i :style="{ width: (idx / tasks.length) * 100 + '%' }"></i></div>
      <div class="rs-sub">{{ current.title }}</div>
      <div ref="zone" class="rs-q drop" :class="{ ru: current.kind === 'back', over }" title="Перетащи сюда вариант ответа">{{ current.prompt }}</div>
      <div v-if="current.hint" class="rs-sub">{{ current.hint }}</div>
      <div v-if="btns.length && picked === null" class="rs-items" aria-label="Предметы Юны">
        <button v-for="b in btns" :key="b.id" type="button" class="rs-item" :disabled="!canUse(b.id)" :title="itemName(b.id)" @click="useItem(b.id)">
          <img :src="itemIcon(b.id)" alt="" />{{ b.label }} <small>×{{ shop.count(b.id) }}</small>
        </button>
      </div>
      <p v-if="hintText" class="rs-hint">{{ hintText }}</p>
      <div ref="optsBox" class="rs-opts">
        <button
          v-for="(o, i) in visible"
          :key="o"
          class="rs-opt"
          :class="{ ok: picked !== null && o === current.answer, bad: picked === o && o !== current.answer }"
          :disabled="picked !== null"
          @pointerdown="optDown($event, o)"
          @click="onPick(o)"
        >
          <kbd>{{ i + 1 }}</kbd> {{ o }}
        </button>
      </div>
      <div v-if="pending !== null" class="rs-chance">
        <span>Неверно. Есть «Второй шанс» (×{{ shop.count('second') }}): можно исправить, ошибка не запишется.</span>
        <button type="button" class="rs-item" @click="secondChance"><img :src="itemIcon('second')" alt="" />Исправить</button>
        <button type="button" class="rs-item soft" @click="keepWrong">Оставить ответ</button>
      </div>
      <ExplainBox v-if="picked !== null && pending === null && picked !== current.answer" :task="current" :picked="picked" />
      <div v-if="picked !== null && pending === null && current.sentence" class="rs-why">
        <p class="rs-sub">Разбор вариантов:</p>
        <ul v-if="current.pairOf" class="rs-wl">
          <li v-for="o in current.options" :key="o" :class="o === current.answer ? 'ok' : 'bad'">
            <b>{{ o === current.answer ? '✓' : '✗' }}</b>
            <span><span class="ko-or-ru">«{{ o }}»</span>
              <template v-if="o === current.answer"> — верно: это и есть перевод «{{ current.prompt }}».</template>
              <template v-else> — это про «{{ current.pairOf[o] ?? '?' }}», а в задании «{{ current.prompt }}».</template>
              <em v-if="o === picked"> Ты выбрал его.</em>
            </span>
          </li>
        </ul>
        <p class="rs-sub">Как устроено верное предложение:</p>
        <SentenceBreakdown :sentence="current.sentence" />
      </div>
      <button v-if="picked !== null && pending === null" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
    </template>
    <div v-else class="rs-end">
      <Cat :name="right === tasks.length ? 'cheer' : right * 2 >= tasks.length ? 'happy' : 'sad'" />
      <div class="pg-v">{{ right }} <small>из {{ tasks.length }}</small></div>
      <p v-if="pace" class="rs-pace">Время: {{ clock(pace.total) }}, в среднем {{ pace.avg }} с на задание. Дольше всего: задание {{ pace.slowest + 1 }}.</p>
      <p><template v-if="right === tasks.length"><Icon name="sakura" /> Всё верно!</template><template v-else>Слова с ошибками вернутся в повторение. Вот что не получилось:</template></p>
      <ul v-if="missed.length" class="qk-miss">
        <li v-for="t in missed" :key="t.id"><span class="ko">{{ t.prompt }}</span> → <b class="ko">{{ t.answer }}</b></li>
      </ul>
      <div class="md" role="group" aria-label="Как прошло?">
        <template v-if="!moodSet">
          <span class="md-q">Как прошло?</span>
          <button v-for="m in MOODS" :key="m.id" type="button" class="md-b" @click="setMood(m.id)"><Icon :name="m.icon" /> {{ m.label }}</button>
        </template>
        <span v-else class="md-q">Записано: {{ MOODS.find(m => m.id === moodSet)?.label.toLowerCase() }}</span>
      </div>
      <div class="pg-btns">
        <button class="rs-start" @click="emit('again')">{{ againLabel ?? 'Ещё раз' }}</button>
        <slot name="after" />
      </div>
    </div>
  </div>
</template>
