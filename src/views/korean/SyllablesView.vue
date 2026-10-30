<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Draggable from 'vuedraggable'
import SectionHead from '@/components/korean/SectionHead.vue'
import { mistakeWords } from '@/data/mistakes'
import { isCorrect, syllableTasks, type SyllableTask } from '@/data/korean/syllables'
import { burst, cascade, pop, shake } from '@/lib/fx'
import { useProgressStore } from '@/stores/progress'

interface Tile {
  /** номер плитки в задании */
  i: number
  s: string
}

const ROUND = 10
const progress = useProgressStore()
const weak = () => mistakeWords(progress.data, 30).map(m => m.word.k)
const tasks = ref<SyllableTask[]>(syllableTasks(ROUND, weak()))
const idx = ref(0)
/** плитки в слотах по порядку: их можно тянуть в слоты, менять местами и убирать нажатием (в самом наборе плитка затемняется, пока выбрана) */
const picked = ref<Tile[]>([])
const result = ref<'ok' | 'bad' | null>(null)
const right = ref(0)
const missed = ref<SyllableTask[]>([])
const slotsBox = ref<HTMLElement>()
const poolBox = ref<HTMLElement>()

const current = computed(() => tasks.value[idx.value])
const finished = computed(() => idx.value >= tasks.value.length)
const pool = computed<Tile[]>(() => (current.value ? current.value.tiles.map((s, i) => ({ i, s })) : []))
const pickedIdx = computed(() => picked.value.map(t => t.i))
const letters = computed(() => picked.value.map(t => t.s))
const cloneTile = (t: Tile): Tile => ({ ...t })

function tap(t: Tile) {
  const task = current.value
  if (!task || result.value || pickedIdx.value.includes(t.i) || picked.value.length >= task.answer.length) return
  picked.value = [...picked.value, t]
}
const removeAt = (n: number) => {
  if (!result.value) picked.value = picked.value.filter((_, k) => k !== n)
}
const back = () => {
  if (!result.value) picked.value = picked.value.slice(0, -1)
}

/** Слоты заполнены (нажатием или перетаскиванием): проверяем ответ. */
watch(picked, p => {
  const task = current.value
  if (!task || result.value) return
  // перетаскивание не должно дать лишнего или повторить одну плитку дважды
  const uniq = p.filter((t, k) => p.findIndex(x => x.i === t.i) === k).slice(0, task.answer.length)
  if (uniq.length !== p.length) {
    picked.value = uniq
    return
  }
  if (p.length < task.answer.length) return
  const ok = isCorrect(task, letters.value)
  result.value = ok ? 'ok' : 'bad'
  if (ok) right.value++
  else missed.value.push(task)
  progress.record({ word: task.word.k, ok, source: 'trainer', mode: 'syllables' })
  ;(ok ? pop : shake)(slotsBox.value)
})

function enter() {
  void nextTick(() => cascade(poolBox.value?.querySelectorAll('.sy-tile') ?? []))
}
function next() {
  idx.value++
  picked.value = []
  result.value = null
  enter()
}
function again() {
  tasks.value = syllableTasks(ROUND, weak())
  idx.value = 0
  picked.value = []
  result.value = null
  right.value = 0
  missed.value = []
  enter()
}
onMounted(enter)
watch(finished, v => {
  if (!v) return
  void nextTick(() => {
    const r = document.querySelector('.rs-end')?.getBoundingClientRect()
    if (r && right.value >= tasks.value.length / 2) burst(r.left + r.width / 2, r.top + 40)
  })
})
</script>

<template>
  <div class="wrap">
    <SectionHead id="syllables" />
    <div class="rs">
      <template v-if="!finished && current">
        <div class="rs-bar"><span>{{ idx + 1 }} из {{ tasks.length }}</span><span>верно: {{ right }}</span></div>
        <div class="qk-prog"><i :style="{ width: (idx / tasks.length) * 100 + '%' }"></i></div>
        <div class="rs-sub">Собери слово по слогам</div>
        <div class="rs-q ru">{{ current.prompt }}</div>
        <div class="rs-sub">чтение: {{ current.word.r }}</div>

        <div ref="slotsBox" class="sy-slotwrap">
          <div class="sy-bg" aria-hidden="true"><span v-for="n in current.answer.length" :key="n" class="sy-slot empty"></span></div>
          <Draggable
            v-model="picked"
            item-key="i"
            class="sy-slots"
            :class="result"
            :group="{ name: 'sy', pull: false, put: true }"
            :disabled="!!result"
            :animation="180"
            :empty-insert-threshold="60"
            ghost-class="sy-ghost"
            draggable=".sy-slot"
            aria-live="polite"
          >
            <template #item="{ element, index }">
              <span class="sy-slot ko filled" :title="result ? '' : 'Нажми, чтобы убрать'" @click="removeAt(index)">{{ element.s }}</span>
            </template>
          </Draggable>
        </div>
        <div ref="poolBox">
          <Draggable
            :model-value="pool"
            item-key="i"
            class="sy-tiles"
            :group="{ name: 'sy', pull: 'clone', put: false }"
            :sort="false"
            :clone="cloneTile"
            :disabled="!!result"
            :animation="150"
            filter=".picked"
            draggable=".sy-tile"
            chosen-class="sy-chosen"
          >
            <template #item="{ element }">
              <button type="button" class="sy-tile ko" :class="{ picked: pickedIdx.includes(element.i) }" :aria-disabled="pickedIdx.includes(element.i) || !!result" @click="tap(element)">{{ element.s }}</button>
            </template>
            <template #footer>
              <button class="sy-back" :disabled="!picked.length || !!result" title="Убрать последний слог" aria-label="Убрать последний слог" @click="back">⌫</button>
            </template>
          </Draggable>
        </div>
        <div v-if="result === 'bad'" class="xb" role="note">Верно: <b class="ko">{{ current.word.k }}</b> ({{ current.word.r }})</div>
        <button v-if="result" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
      </template>
      <div v-else class="rs-end">
        <div class="pg-v">{{ right }} <small>из {{ tasks.length }}</small></div>
        <p>{{ right === tasks.length ? '🌸 Всё верно!' : 'Вот что не получилось:' }}</p>
        <ul v-if="missed.length" class="qk-miss"><li v-for="t in missed" :key="t.word.n"><span class="ko">{{ t.word.k }}</span> ({{ t.word.r }}) — {{ t.prompt }}</li></ul>
        <div class="pg-btns"><button class="rs-start" @click="again">Ещё раз</button></div>
      </div>
    </div>
  </div>
</template>
