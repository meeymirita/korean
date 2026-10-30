<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExplainBox from '@/components/korean/ExplainBox.vue'
import { MOODS, type Mood } from '@/data/mood'
import { clock, paceSummary, PACE_CAP } from '@/data/pace'
import type { Task } from '@/data/korean/tasks'
import { burst, cascade, drop, follow, pop, shake, springBack } from '@/lib/fx'
import { useProgressStore } from '@/stores/progress'

/**
 * Серия заданий по одному: вопрос, варианты (клавиши 1–9), «Дальше» (Enter или →), итог со списком ошибок.
 * Ответы пишутся в прогресс с источником `source`. Новый набор (смена `tasks`) начинает серию заново.
 */
const props = defineProps<{ tasks: Task[]; source: string; againLabel?: string }>()
const emit = defineEmits<{ again: [] }>()

const progress = useProgressStore()
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

const current = computed(() => props.tasks[idx.value])
const finished = computed(() => idx.value >= props.tasks.length)

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
onMounted(enter)
watch(finished, v => {
  if (!v) return
  void nextTick(() => {
    const r = document.querySelector('.rs-end')?.getBoundingClientRect()
    if (r && right.value >= props.tasks.length / 2) burst(r.left + r.width / 2, r.top + 40)
  })
})

watch(
  () => props.tasks,
  () => {
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
  picked.value = option
  times.value.push(Math.min((Date.now() - shownAt.value) / 1000, PACE_CAP))
  const ok = option === t.answer
  if (ok) right.value++
  else missed.value.push(t)
  progress.record({ word: t.word, ok, source: props.source })
  ;(ok ? pop : shake)(zone.value)
}
function next() {
  idx.value++
  picked.value = null
  shownAt.value = Date.now()
  elapsed.value = 0
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const t = current.value
  if (!t) return
  if (picked.value === null && /^[1-9]$/.test(e.key)) {
    const o = t.options[Number(e.key) - 1]
    if (o) answer(o)
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
        <span class="rs-clock" aria-label="Время на задание">⏱ {{ clock(elapsed) }}</span>
        <span>верно: {{ right }}</span>
      </div>
      <div class="qk-prog" role="progressbar" :aria-valuenow="idx" aria-valuemin="0" :aria-valuemax="tasks.length"><i :style="{ width: (idx / tasks.length) * 100 + '%' }"></i></div>
      <div class="rs-sub">{{ current.title }}</div>
      <div ref="zone" class="rs-q drop" :class="{ ru: current.kind === 'back', over }" title="Перетащи сюда вариант ответа">{{ current.prompt }}</div>
      <div v-if="current.hint" class="rs-sub">{{ current.hint }}</div>
      <div ref="optsBox" class="rs-opts">
        <button
          v-for="(o, i) in current.options"
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
      <ExplainBox v-if="picked !== null && picked !== current.answer" :task="current" :picked="picked" />
      <button v-if="picked !== null" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
    </template>
    <div v-else class="rs-end">
      <div class="pg-v">{{ right }} <small>из {{ tasks.length }}</small></div>
      <p v-if="pace" class="rs-pace">Время: {{ clock(pace.total) }}, в среднем {{ pace.avg }} с на задание. Дольше всего: задание {{ pace.slowest + 1 }}.</p>
      <p>{{ right === tasks.length ? '🌸 Всё верно!' : 'Слова с ошибками вернутся в повторение. Вот что не получилось:' }}</p>
      <ul v-if="missed.length" class="qk-miss">
        <li v-for="t in missed" :key="t.id"><span class="ko">{{ t.prompt }}</span> → <b class="ko">{{ t.answer }}</b></li>
      </ul>
      <div class="md" role="group" aria-label="Как прошло?">
        <template v-if="!moodSet">
          <span class="md-q">Как прошло?</span>
          <button v-for="m in MOODS" :key="m.id" type="button" class="md-b" @click="setMood(m.id)">{{ m.icon }} {{ m.label }}</button>
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
