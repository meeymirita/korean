<script setup lang="ts">
/**
 * Вид «Колонки, как в Finder» страницы грамматики: разделы → карточки раздела → предпросмотр выбранной карточки.
 * Стрелки на клавиатуре работают, пока фокус в таблице колонок. Описание: docs/data.md, «Страница грамматики: виды».
 */
import { computed, nextTick, ref, watch } from 'vue'
import { SECS, type Gram } from '@/data/korean/grammar'
import { F, blocksHtml } from '@/data/korean/render'
import { formulaOf, headKo, plain, secColor } from '@/lib/grammarView'

const props = defineProps<{ cards: Gram[] }>()
const emit = defineEmits<{ open: [id: string] }>()

const secs = computed(() => SECS.filter(s => props.cards.some(g => g.s === s)))
const selSec = ref('')
const selId = ref('')
const inSec = computed(() => props.cards.filter(g => g.s === selSec.value))
const card = computed(() => props.cards.find(g => g.id === selId.value) ?? null)
const count = (s: string) => {
  const n = props.cards.filter(g => g.s === s)
  return `${n.filter(g => !g.ahead).length}/${n.length}`
}
// вкладка, поиск или «пройдено» поменяли набор: выбор, которого больше нет, сбрасываем
watch(
  () => props.cards,
  () => {
    if (!secs.value.includes(selSec.value)) selSec.value = secs.value[0] ?? ''
    if (!inSec.value.some(g => g.id === selId.value)) selId.value = ''
  },
  { immediate: true },
)
const pickSec = (s: string) => {
  selSec.value = s
  selId.value = ''
}
const colsEl = ref<HTMLElement>()
const scrollEnd = () => void nextTick(() => colsEl.value?.scrollTo({ left: colsEl.value.scrollWidth, behavior: 'smooth' }))
watch(selId, scrollEnd)

function onKey(e: KeyboardEvent) {
  const k = e.key
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(k)) return
  e.preventDefault()
  if (!selId.value) {
    const i = secs.value.indexOf(selSec.value)
    if (k === 'ArrowDown') selSec.value = secs.value[Math.min(secs.value.length - 1, i + 1)] ?? ''
    else if (k === 'ArrowUp') selSec.value = secs.value[Math.max(0, i - 1)] ?? ''
    else if (k === 'ArrowRight') selId.value = inSec.value[0]?.id ?? ''
    return
  }
  const i = inSec.value.findIndex(g => g.id === selId.value)
  if (k === 'ArrowDown') selId.value = inSec.value[Math.min(inSec.value.length - 1, i + 1)]!.id
  else if (k === 'ArrowUp') selId.value = inSec.value[Math.max(0, i - 1)]!.id
  else if (k === 'ArrowLeft') selId.value = ''
}
const crumbs = computed(() => ['Грамматика', selSec.value, card.value ? plain(card.value.ko) : ''].filter(Boolean))
</script>

<template>
  <div class="gcols">
    <div class="bar">
      <span class="dots"><i style="background: #ff5f57"></i><i style="background: #febc2e"></i><i style="background: #28c840"></i></span>
      <div class="path">
        <template v-for="(c, i) in crumbs" :key="i"><span v-if="i" class="sep"> › </span>{{ c }}</template>
      </div>
    </div>
    <div ref="colsEl" class="cols" tabindex="0" role="tree" aria-label="Разделы грамматики" @keydown="onKey">
      <div class="col s">
        <button v-for="s in secs" :key="s" type="button" class="it" :class="{ sel: selSec === s }" :style="{ '--c': secColor({ s }) }" @click="pickSec(s)">
          <i></i>{{ s }}<span class="cnt">{{ count(s) }} ›</span>
        </button>
      </div>
      <div v-if="selSec" class="col">
        <button v-for="g in inSec" :key="g.id" type="button" class="it" :class="{ sel: selId === g.id, ahead: g.ahead }" :style="{ '--c': secColor(g) }" @click="selId = g.id">
          <i></i><b>{{ headKo(g) }}</b><small>{{ plain(g.ru).slice(0, 22) }}</small>
        </button>
      </div>
      <div v-if="card" class="pv" :style="{ '--c': secColor(card) }">
        <div class="icon">{{ headKo(card).slice(0, 2) }}</div>
        <h2 v-html="F(card.ko)"></h2>
        <dl class="meta">
          <dt>Что</dt><dd>{{ plain(card.ru) }}</dd>
          <dt>Раздел</dt><dd>{{ card.s }}</dd>
          <dt>В книге</dt><dd>{{ card.bk || '—' }}</dd>
          <dt>Статус</dt><dd>{{ card.ahead ? 'Впереди' : card.st === 'ok' ? 'Пройдено' : 'Ещё рано' }}</dd>
          <template v-if="formulaOf(card)"><dt>Формула</dt><dd v-html="F(formulaOf(card))"></dd></template>
        </dl>
        <button type="button" class="more" @click="emit('open', card.id)">Открыть карточку целиком</button>
        <div v-if="!card.ahead" class="rich" v-html="blocksHtml(card.b)"></div>
      </div>
    </div>
    <div class="status">{{ card ? '1 элемент выбран' : selSec ? `${inSec.length} элементов` : `${secs.length} разделов` }}</div>
  </div>
</template>

<style scoped>
.gcols { margin-top: 18px; display: flex; flex-direction: column; height: min(680px, 78vh); border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: rgba(255, 255, 255, .7); box-shadow: var(--shadow); }
.bar { height: 44px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 14px; background: linear-gradient(#faf7ff, #ece6fb); border-bottom: 1px solid var(--line); }
.dots i { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; }
.path { flex: 1; min-width: 0; text-align: center; font-weight: 700; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sep { opacity: .5; }
.cols { flex: 1; min-height: 0; display: flex; background: #fff; overflow-x: auto; outline: none; }
.cols:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.col { width: 260px; flex: none; overflow-y: auto; border-right: 1px solid var(--line-soft); padding: 4px 0; }
.col.s { background: #f7f4ff; }
.it { display: flex; align-items: center; gap: 8px; width: calc(100% - 12px); margin: 1px 6px; padding: 6px 12px; border: 0; border-radius: 8px; background: none; color: inherit; font: inherit; font-weight: 600; text-align: left; cursor: pointer; }
.it:hover { background: #efeafd; }
.it i { flex: none; width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
.it.sel { background: var(--c); color: #fff; }
.it.sel i { background: #fff; }
.it .cnt { margin-left: auto; opacity: .5; font-size: 12px; }
.it small { opacity: .6; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.it.ahead { opacity: .55; font-style: italic; }
.pv { flex: 1; min-width: 340px; overflow-y: auto; padding: 26px 32px; }
.icon { width: 80px; height: 80px; border-radius: 20px; background: var(--c); color: #fff; display: grid; place-items: center; font: 700 36px 'Noto Sans KR', sans-serif; margin-bottom: 12px; }
.pv h2 { margin: 0; font-size: 30px; font-weight: 700; }
.meta { display: grid; grid-template-columns: 90px 1fr; font-size: 13px; margin: 12px 0 14px; border-top: 1px solid var(--line-soft); }
.meta > * { padding: 5px 0; border-bottom: 1px solid var(--line-soft); }
.meta dt { color: var(--muted); }
.meta dd { margin: 0; }
.more { margin-bottom: 8px; border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 99px; padding: 6px 16px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.more:hover { border-color: var(--accent); }
.status { height: 26px; flex: none; display: flex; align-items: center; padding: 0 14px; border-top: 1px solid var(--line); background: #f7f4ff; font-size: 12px; color: var(--muted); }
@media (max-width: 760px) { .col { width: 200px; } .pv { min-width: 280px; padding: 18px; } }
</style>
