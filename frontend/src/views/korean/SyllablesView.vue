<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { mistakeWords } from '@/data/mistakes'
import { usePersisted } from '@/composables/usePersisted'
import { isCorrect, SYLLABLE_LEVELS, syllableTasks, type SyllableLevel, type SyllableTask } from '@/data/korean/syllables'
import { useItemBar } from '@/composables/useItemBar'
import { itemIcon, itemName } from '@/data/shop'
import { dragDrop } from '@/lib/dragdrop'
import { burst, cascade, pop, shake } from '@/lib/fx'
import { newRound, useProgressStore } from '@/stores/progress'

interface Tile {
  /** номер плитки в задании */
  i: number
  s: string
}

const ROUND = 10
const progress = useProgressStore()
/** Номер серии для журнала. */
const round = newRound()
const weak = () => mistakeWords(progress.data, 30).map(m => m.word.k)
/** Уровень по длине слова; помнится после обновления страницы. */
const level = usePersisted<SyllableLevel>('syl_level', 'any', v => SYLLABLE_LEVELS.some(l => l.id === v))
/** Чтение под переводом можно выключить: тогда слово собирается без подсказки. */
const reading = usePersisted('syl_reading', true, v => typeof v === 'boolean')
const tasks = ref<SyllableTask[]>(syllableTasks(ROUND, weak(), level.value))
const idx = ref(0)
/** плитки в слотах по порядку: их можно тянуть в слоты, менять местами и убирать нажатием (в самом наборе плитка затемняется, пока выбрана) */
const picked = ref<Tile[]>([])
const result = ref<'ok' | 'bad' | null>(null)
const right = ref(0)
const missed = ref<SyllableTask[]>([])
const slotsBox = ref<HTMLElement>()
const poolBox = ref<HTMLElement>()

/* ---------- предметы из магазина (docs/shop.md): подсказка, 50/50, повтор, второй шанс ---------- */
const items = useItemBar()
const removed = ref<number[]>([]) // номера плиток, которые убрали подсказка и «50/50»
const hintText = ref('')
const hinted = ref(false)
/** Неверный ответ ждёт решения: исправить «Вторым шансом» (ошибка не запишется) или оставить */
const pending = ref(false)
const chanceUsed = ref(false)
const ITEM_BTNS = [
  { id: 'hint', label: 'Подсказка' },
  { id: 'fifty', label: '50/50' },
  { id: 'skip', label: 'Повтор' },
] as const
const btns = computed(() => ITEM_BTNS.filter(b => items.count(b.id) > 0))
/** Номера лишних плиток задания: тех, которых не хватило бы для слова (повторы слогов считаются). */
function extraTiles(task: SyllableTask): number[] {
  const need = new Map<string, number>()
  for (const syl of task.answer) need.set(syl, (need.get(syl) ?? 0) + 1)
  const extra: number[] = []
  task.tiles.forEach((syl, i) => {
    const n = need.get(syl) ?? 0
    if (n > 0) need.set(syl, n - 1)
    else extra.push(i)
  })
  return extra
}
const extraLeft = () => (current.value ? extraTiles(current.value).filter(i => !removed.value.includes(i)) : [])
const canUse = (id: string) => !items.shop.busy && !result.value && !pending.value && (id !== 'skip' || idx.value + 1 < tasks.value.length) && (id !== 'hint' || !hinted.value) && (id !== 'fifty' || extraLeft().length > 0)
function resetItems() {
  removed.value = []
  hintText.value = ''
  hinted.value = false
  pending.value = false
  chanceUsed.value = false
}
async function useItem(id: 'hint' | 'fifty' | 'skip') {
  const task = current.value
  if (!task || !canUse(id) || !(await items.use(id))) return
  if (id === 'skip') {
    tasks.value.push(tasks.value.splice(idx.value, 1)[0]!)
    picked.value = []
    resetItems()
    return enter()
  }
  const drop = (n: number) => {
    const free = extraLeft()
    removed.value = [...removed.value, ...free.slice(0, n)]
  }
  if (id === 'hint') {
    hinted.value = true
    hintText.value = `Подсказка Юны: слово начинается с «${task.answer[0]}»`
    drop(1)
  } else drop(Math.max(1, Math.ceil(extraLeft().length / 2)))
}
async function secondChance() {
  if (!pending.value || !(await items.use('second'))) return
  pending.value = false
  chanceUsed.value = true
  picked.value = []
  hintText.value = 'Второй шанс: собери слово ещё раз'
}
const keepWrong = () => {
  pending.value = false
  commit(false)
}

const current = computed(() => tasks.value[idx.value])
const finished = computed(() => idx.value >= tasks.value.length)
const pool = computed<Tile[]>(() => (current.value ? current.value.tiles.map((s, i) => ({ i, s })).filter(t => !removed.value.includes(t.i)) : []))
const pickedIdx = computed(() => picked.value.map(t => t.i))
const letters = computed(() => picked.value.map(t => t.s))

function tap(t: Tile) {
  const task = current.value
  if (!task || result.value || pending.value || pickedIdx.value.includes(t.i) || picked.value.length >= task.answer.length) return
  picked.value = [...picked.value, t]
}
const removeAt = (n: number) => {
  if (!result.value && !pending.value) picked.value = picked.value.filter((_, k) => k !== n)
}
const back = () => {
  if (!result.value && !pending.value) picked.value = picked.value.slice(0, -1)
}

/**
 * Плитку отпустили над слотами в точке `x`: она встаёт перед слотом, левее середины которого её отпустили.
 * Так же двигается плитка, которая уже стоит в слоте (сначала вынимается, потом встаёт на новое место).
 */
function place(i: number, x: number) {
  const task = current.value
  const tile = pool.value.find(t => t.i === i)
  if (!task || !tile || result.value || pending.value) return
  const rest = picked.value.filter(t => t.i !== i)
  if (rest.length >= task.answer.length) return
  const slots = [...(slotsBox.value?.querySelectorAll<HTMLElement>('.sy-slot.filled') ?? [])].filter(e => Number(e.dataset.i) !== i)
  let pos = slots.findIndex(e => {
    const r = e.getBoundingClientRect()
    return x < r.left + r.width / 2
  })
  if (pos < 0) pos = rest.length
  picked.value = [...rest.slice(0, pos), tile, ...rest.slice(pos)]
}
/** Перетаскивание (общий помощник `lib/dragdrop.ts`): плитки набора и плитки в слотах тянутся в слоты. Набор перерисовывается, поэтому подключается заново. */
let dragOff = () => {}
function wireDrag() {
  dragOff()
  dragOff = () => {}
  const box = slotsBox.value
  if (!box || !poolBox.value || result.value || pending.value) return
  dragOff = dragDrop({
    tiles: [...poolBox.value.querySelectorAll('.sy-tile:not(.picked)'), ...box.querySelectorAll('.sy-slot.filled')],
    targets: () => (result.value || pending.value ? [] : [box]),
    onDrop: (tile, _target, x) => place(Number(tile.dataset.i), x),
  })
}
onBeforeUnmount(() => dragOff())

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
  // есть «Второй шанс»: неверный ответ пока не записываем, ждём решения
  if (!ok && !chanceUsed.value && items.count('second') > 0) {
    pending.value = true
    shake(slotsBox.value)
    return
  }
  commit(ok)
})
function commit(ok: boolean) {
  const task = current.value
  if (!task) return
  result.value = ok ? 'ok' : 'bad'
  if (ok) right.value++
  else missed.value.push(task)
  // у фраз нет слова в словаре (номер от 16000): в общий прогресс слов они не идут, но в журнал ответов пишутся
  progress.record({
    word: task.word.n < 16000 ? task.word.k : null,
    ok,
    source: 'trainer',
    mode: 'syllables',
    ...(hinted.value && ok ? { xp: 5 } : {}),
    detail: { q: `Собери: ${task.word.t}`, a: task.word.k, y: ok ? undefined : letters.value.join(''), r: round },
  })
  ;(ok ? pop : shake)(slotsBox.value)
}
watch([picked, result, current, pending], () => void nextTick(wireDrag), { flush: 'post' })

function enter() {
  void nextTick(() => cascade(poolBox.value?.querySelectorAll('.sy-tile') ?? []))
}
function next() {
  idx.value++
  picked.value = []
  result.value = null
  resetItems()
  enter()
}
function again() {
  tasks.value = syllableTasks(ROUND, weak(), level.value)
  idx.value = 0
  picked.value = []
  result.value = null
  right.value = 0
  missed.value = []
  resetItems()
  enter()
}
const setLevel = (id: SyllableLevel) => {
  level.value = id
  again()
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
    <div class="chips">
      <button v-for="l in SYLLABLE_LEVELS" :key="l.id" type="button" class="chip" :class="{ on: level === l.id }" :title="l.hint" @click="setLevel(l.id)">{{ l.label }}</button>
    </div>
    <div class="chips"><label class="chk"><input v-model="reading" type="checkbox" /> показывать чтение</label></div>
    <div class="rs">
      <template v-if="!finished && current">
        <div class="rs-bar"><span>{{ idx + 1 }} из {{ tasks.length }}</span><span>верно: {{ right }}</span></div>
        <div class="qk-prog"><i :style="{ width: (idx / tasks.length) * 100 + '%' }"></i></div>
        <div class="rs-sub">Собери слово по слогам</div>
        <div class="rs-q ru">{{ current.prompt }}</div>
        <div v-if="reading && current.word.r" class="rs-sub">чтение: {{ current.word.r }}</div>

        <div ref="slotsBox" class="sy-slotwrap">
          <div class="sy-bg" aria-hidden="true"><span v-for="n in current.answer.length" :key="n" class="sy-slot empty"></span></div>
          <div class="sy-slots" :class="result" aria-live="polite">
            <button v-for="(t, index) in picked" :key="idx + ':' + t.i" type="button" class="sy-slot ko filled" :data-i="t.i" :title="result ? '' : 'Нажми, чтобы убрать'" @click="removeAt(index)">{{ t.s }}</button>
          </div>
        </div>
        <div v-if="btns.length && !result && !pending" class="rs-items">
          <button v-for="b in btns" :key="b.id" type="button" class="rs-item" :disabled="!canUse(b.id)" :title="itemName(b.id)" @click="useItem(b.id)">
            <img :src="itemIcon(b.id)" alt="" />{{ b.label }} <small>×{{ items.count(b.id) }}</small>
          </button>
        </div>
        <p v-if="hintText" class="rs-hint">{{ hintText }}</p>
        <div v-if="pending" class="rs-items" role="note">
          <span>Неверно. Есть «Второй шанс» (×{{ items.count('second') }}): можно исправить, ошибка не запишется.</span>
          <button type="button" class="rs-item" @click="secondChance"><img :src="itemIcon('second')" alt="" />Исправить</button>
          <button type="button" class="rs-item soft" @click="keepWrong">Оставить ошибку</button>
        </div>
        <div ref="poolBox" class="sy-tiles">
          <button v-for="t in pool" :key="idx + ':' + t.i" type="button" class="sy-tile ko" :data-i="t.i" :class="{ picked: pickedIdx.includes(t.i) }" :aria-disabled="pickedIdx.includes(t.i) || !!result" @click="tap(t)">{{ t.s }}</button>
          <button class="sy-back" :disabled="!picked.length || !!result" title="Убрать последний слог" aria-label="Убрать последний слог" @click="back">⌫</button>
        </div>
        <div v-if="result === 'bad'" class="xb" role="note">Верно: <b class="ko">{{ current.display ?? current.word.k }}</b><template v-if="current.word.r"> ({{ current.word.r }})</template></div>
        <button v-if="result" class="rs-next" @click="next">{{ idx + 1 < tasks.length ? 'Дальше →' : 'Итог' }}</button>
      </template>
      <div v-else class="rs-end">
        <div class="pg-v">{{ right }} <small>из {{ tasks.length }}</small></div>
        <p><template v-if="right === tasks.length"><Icon name="sakura" /> Всё верно!</template><template v-else>Вот что не получилось:</template></p>
        <ul v-if="missed.length" class="qk-miss"><li v-for="t in missed" :key="t.word.n"><span class="ko">{{ t.display ?? t.word.k }}</span><template v-if="t.word.r"> ({{ t.word.r }})</template> — {{ t.prompt }}</li></ul>
        <div class="pg-btns"><button class="rs-start" @click="again">Ещё раз</button></div>
      </div>
    </div>
  </div>
</template>
