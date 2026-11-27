<script setup lang="ts">
import Cat from '@/components/Cat.vue'
import Icon from '@/components/Icon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ExplainBox from '@/components/korean/ExplainBox.vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { MOODS, type Mood } from '@/data/mood'
import { clock, paceSummary, PACE_CAP } from '@/data/pace'
import type { Task } from '@/data/korean/tasks'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G } from '@/data/korean/grammar'
import { dragDrop } from '@/lib/dragdrop'
import { burst, cascade, pop, shake } from '@/lib/fx'
import { newRound, useProgressStore } from '@/stores/progress'

/**
 * Серия заданий по одному: вопрос, варианты (клавиши 1–9), «Дальше» (Enter или →), итог со списком ошибок.
 * Ответы пишутся в прогресс с источником `source`. Новый набор (смена `tasks`) начинает серию заново.
 */
const props = defineProps<{ tasks: Task[]; source: string; /** режим для отчёта в кабинете: particles, translate, pairs… */ mode?: string; againLabel?: string }>()
const emit = defineEmits<{ again: [] }>()

const progress = useProgressStore()
const { open: openRule } = useGrammarModal()
/** Номер серии для журнала. */
const round = newRound()
/** Задания серии. */
const list = ref<Task[]>([...props.tasks])
const idx = ref(0)
const picked = ref<string | null>(null)
const missed = ref<Task[]>([])
const right = ref(0)
/** Сколько заданий в текущей серии (при «Ещё раз ошибки» это только неверные прошлой серии). */
const size = ref(props.tasks.length)
const scheduledRetries = new Set<number>()
const completedTasks = new Set<number>()
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
/** Задание с пропуском «＿＿＿»: после ответа верный вариант встаёт на его место. */
const blank = computed(() => {
  const p = current.value?.prompt ?? ''
  const i = p.indexOf('＿＿＿')
  return i < 0 ? null : [p.slice(0, i), p.slice(i + 3)]
})
const finished = computed(() => idx.value >= list.value.length)
/** Карточки правил задания (`Task.rules`): список со ссылками после ответа. */
const ruleCards = computed(() => (current.value?.rules ?? []).flatMap(id => G.filter(g => g.id === id)))
/** Варианты ответа текущего задания. */
const visible = computed(() => current.value?.options ?? [])

/* ---------- перетаскивание варианта на вопрос (общий помощник lib/dragdrop.ts), анимации ---------- */
const zone = ref<HTMLElement>()
const optsBox = ref<HTMLElement>()
let dragOff = () => {}
/** Варианты перерисовываются с каждым заданием: перетаскивание подключается заново. */
function wireDrag() {
  dragOff()
  dragOff = dragDrop({
    tiles: optsBox.value?.querySelectorAll('.rs-opt') ?? [],
    targets: () => (picked.value === null && zone.value ? [zone.value] : []),
    overClass: 'over',
    onDrop: tile => {
      if (picked.value === null && tile.dataset.opt !== undefined) answer(tile.dataset.opt)
    },
  })
}
function enter() {
  void nextTick(() => {
    cascade(optsBox.value?.querySelectorAll('.rs-opt') ?? [])
    wireDrag()
  })
}
watch([idx, () => props.tasks], enter)
onMounted(() => {
  enter()
})
watch(finished, v => {
  if (!v) return
  void nextTick(() => {
    const r = document.querySelector('.rs-end')?.getBoundingClientRect()
    if (r && right.value >= size.value / 2) burst(r.left + r.width / 2, r.top + 40)
  })
})

/** Начинает серию заново с этими заданиями (новый набор или «Ещё раз ошибки этой серии»). */
function restart(tasks: Task[]) {
  list.value = [...tasks]
  size.value = tasks.length
  idx.value = 0
  picked.value = null
  missed.value = []
  right.value = 0
  scheduledRetries.clear()
  completedTasks.clear()
  moodSet.value = null
  times.value = []
  shownAt.value = Date.now()
  elapsed.value = 0
}
watch(() => props.tasks, () => restart(props.tasks))
/** Повторяет только те задания, которые остались неверными в итоге (их список показан на экране итога). */
function retryMissed() {
  if (missed.value.length) restart(missed.value)
}

function answer(option: string) {
  const t = current.value
  if (!t || picked.value !== null) return
  picked.value = option
  times.value.push(Math.min((Date.now() - shownAt.value) / 1000, PACE_CAP))
  const ok = option === t.answer
  const already = ok && completedTasks.has(t.id)
  if (ok) {
    if (!already) right.value++
    completedTasks.add(t.id)
    missed.value = missed.value.filter(task => task.id !== t.id)
  } else {
    if (!missed.value.some(task => task.id === t.id)) missed.value.push(t)
    if (!scheduledRetries.has(t.id)) {
      scheduledRetries.add(t.id)
      const delay = 3 + Math.floor(Math.random() * 2)
      list.value.splice(Math.min(list.value.length, idx.value + 1 + delay), 0, t)
    }
  }
  // повтор после ошибки засчитывается (ошибка −1, верно +1); второй верный ответ на то же задание не начисляется
  if (!already) {
    progress.record({ word: t.word, ok, source: props.source, mode: props.mode, detail: { q: `${t.title}: ${t.prompt}`, a: t.answer, y: ok ? undefined : option, ...(t.gram ? { g: t.gram } : {}), r: round } })
  }
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
    const o = visible.value[Number(e.key) - 1]
    if (o) answer(o)
  } else if (picked.value !== null && (e.key === 'Enter' || e.key === 'ArrowRight')) {
    e.preventDefault()
    next()
  }
}
/** Тестовая сборка для бота-игрока (docs/bot.md, `NUXT_PUBLIC_TEST_HOOKS=1`): текущее задание с верным ответом и счётчики серии. В боевой сборке крючка нет. */
const testHooks = !!useRuntimeConfig().public.testHooks
onMounted(() => {
  if (testHooks) {
    ;(window as unknown as { __taskProbe?: unknown }).__taskProbe = {
      task: () => (current.value ? (JSON.parse(JSON.stringify(current.value)) as unknown) : null),
      state: () => ({ idx: idx.value, size: size.value, right: right.value, picked: picked.value, finished: finished.value, missed: missed.value.length }),
    }
  }
  document.addEventListener('keydown', onKey)
  tick = setInterval(() => {
    if (picked.value === null && !finished.value) elapsed.value = Math.min(Math.floor((Date.now() - shownAt.value) / 1000), PACE_CAP)
  }, 1000)
})
onBeforeUnmount(() => {
  dragOff()
  if (testHooks) delete (window as unknown as { __taskProbe?: unknown }).__taskProbe
  document.removeEventListener('keydown', onKey)
  clearInterval(tick)
})
</script>

<template>
  <div class="rs">
    <template v-if="!finished && current">
      <div class="rs-bar">
        <span>{{ idx + 1 }} из {{ list.length }}</span>
        <span class="rs-clock" aria-label="Время на задание"><Icon name="stopwatch" /> {{ clock(elapsed) }}</span>
        <span>верно: {{ right }}</span>
      </div>
      <div class="qk-prog" role="progressbar" :aria-valuenow="idx" aria-valuemin="0" :aria-valuemax="list.length"><i :style="{ width: (idx / list.length) * 100 + '%' }"></i></div>
      <div class="rs-sub" :class="{ 'rs-pre': current.title.includes('\n') }">{{ current.title }}</div>
      <div ref="zone" class="rs-q drop" :class="{ ru: current.kind === 'back', small: current.small }" title="Перетащи сюда вариант ответа"><template v-if="blank"><template v-if="picked !== null">{{ blank[0] }}<b class="rs-fill">{{ current.answer }}</b>{{ blank[1] }}</template><template v-else>{{ current.prompt }}</template></template><template v-else>{{ current.prompt }}</template></div>
      <div v-if="current.hint" class="rs-sub">{{ current.hint }}</div>
      <div ref="optsBox" class="rs-opts">
        <button
          v-for="(o, i) in visible"
          :key="o"
          class="rs-opt"
          :class="{ ok: picked !== null && o === current.answer, bad: picked === o && o !== current.answer }"
          :data-opt="o"
          :disabled="picked !== null"
          @click="answer(o)"
        >
          <kbd>{{ i + 1 }}</kbd> {{ o }}
        </button>
      </div>
      <ExplainBox v-if="picked !== null && picked !== current.answer" :task="current" :picked="picked" />
      <div v-if="picked !== null && current.sentence" class="rs-why">
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
        <p v-if="current.pairOf || current.prompt.includes('＿')" class="rs-sub">Как устроено верное предложение:</p>
        <SentenceBreakdown :sentence="current.sentence" :word="current.pairOf || current.prompt.includes('＿') ? undefined : current.word" :extra="[`Задание: ${current.prompt}`, `Верный ответ: ${current.answer}`, `Ответ ученика: ${picked}`]" />
      </div>
      <p v-if="picked !== null && current.note && picked === current.answer" class="rs-sub rs-note">{{ current.note }}</p>
      <div v-if="picked !== null && ruleCards.length" class="rs-rules">
        <p class="rs-sub">Правила в этом предложении:</p>
        <ul class="rs-wl">
          <li v-for="g in ruleCards" :key="g.id">
            <span><b class="ko">{{ g.ko }}</b>: {{ g.d }}.</span>
            <button type="button" class="xb-b" @click="openRule(g.id)">Открыть правило</button>
          </li>
        </ul>
      </div>
      <button v-if="picked !== null" class="rs-next" @click="next">{{ idx + 1 < list.length ? 'Дальше →' : 'Итог' }}</button>
    </template>
    <div v-else class="rs-end">
      <Cat :name="right === size ? 'cheer' : right * 2 >= size ? 'happy' : 'sad'" />
      <div class="pg-v">{{ right }} <small>из {{ size }}</small></div>
      <p v-if="pace" class="rs-pace">Время: {{ clock(pace.total) }}, в среднем {{ pace.avg }} с на задание. Дольше всего: задание {{ pace.slowest + 1 }}.</p>
      <p><template v-if="right === size"><Icon name="sakura" /> Всё верно!</template><template v-else>Слова с ошибками вернутся в повторение. Вот что не получилось:</template></p>
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
        <button v-if="missed.length" class="rs-start plain" type="button" @click="retryMissed">Ещё раз ошибки этой серии</button>
        <slot name="after" />
      </div>
    </div>
  </div>
</template>
