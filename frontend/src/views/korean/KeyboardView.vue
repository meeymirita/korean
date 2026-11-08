<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { usePersisted } from '@/composables/usePersisted'
import {
  CUSTOM_KINDS, CUSTOM_SOURCES, KB_CUSTOM, KB_LEVELS, customLabel, customPool, kbItems, keyCount, randomCustom, searchCustom,
  type CustomItem, type CustomKind, type CustomSource, type KbLevel,
} from '@/data/korean/keyboard'
import { useProgressStore } from '@/stores/progress'
import { KEY_LABELS, keysOfText, matches, ROWS } from '@/lib/hangulKeys'

type Tab = KbLevel | 'custom'
const LEVEL_IDS = KB_LEVELS.map(l => l.id)
const TABS = [...KB_LEVELS, KB_CUSTOM]
const level = usePersisted<Tab>('kb_level', 'letters', v => typeof v === 'string' && TABS.some(t => t.id === v))
const isCustom = computed(() => level.value === 'custom')

/* ---------- своя вкладка: набор собирает сам игрок ---------- */
const MAX_CUSTOM = 100
const account = useProgressStore()
const kind = usePersisted<CustomKind>('kb_c_kind', 'words', v => CUSTOM_KINDS.some(k => k.id === v))
const src = usePersisted<CustomSource>('kb_c_src', 'dict', v => CUSTOM_SOURCES.some(x => x.id === v))
/** Выбранное: слова и предложения вместе, в порядке добавления */
const chosen = usePersisted<string[]>('kb_c_items', [], v => Array.isArray(v) && v.every(x => typeof x === 'string'))
const q = ref('')
const dropOpen = ref(false)
const started = ref(false)
const pool = computed(() => customPool(kind.value, src.value, account.data))
const found = computed(() => searchCustom(pool.value, q.value))
const counts = computed(() => Object.fromEntries(CUSTOM_SOURCES.map(x => [x.id, customPool(kind.value, x.id, account.data).length])))
/** Выбранное с переводом; то, чего уже нет в словаре, молча пропускается */
const list = computed(() => chosen.value.flatMap(t => { const it = customLabel(t); return it ? [it] : [] }))
const isChosen = (t: string) => chosen.value.includes(t)
const add = (it: CustomItem) => {
  if (!isChosen(it.text) && chosen.value.length < MAX_CUSTOM) chosen.value = [...chosen.value, it.text]
}
const remove = (t: string) => (chosen.value = chosen.value.filter(x => x !== t))
const addRandom = () => {
  const it = randomCustom(pool.value, chosen.value)
  if (it) add(it)
}
const addAll = () => {
  const free = pool.value.filter(it => !isChosen(it.text)).slice(0, MAX_CUSTOM - chosen.value.length)
  chosen.value = [...chosen.value, ...free.map(it => it.text)]
}
const clearAll = () => (chosen.value = [])

const items = ref<string[]>([])
const idx = ref(0)
const pos = ref(0)
const errors = ref(0)
const flash = ref(false)
const startedAt = ref(0)
const result = ref<{ cpm: number; acc: number; sec: number; best: boolean } | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const BEST_KEY = 'kb_best'

const cur = computed(() => items.value[idx.value] ?? '')
/** «Диктовка»: слово скрыто, видно только перевод; уже набранные буквы открываются. */
const dictation = computed(() => level.value === 'dictation')
const ruOfCur = computed(() => (dictation.value ? (customLabel(cur.value)?.ru ?? '') : ''))
const keys = computed(() => keysOfText(cur.value))
const next = computed(() => keys.value[pos.value])
/** Сколько символов текущей строки уже набрано. */
const doneChars = computed(() => (next.value ? next.value.at : [...cur.value].length))
const chars = computed(() => [...cur.value])
const nextLabel = computed(() => {
  const k = next.value?.key
  if (!k) return ''
  if (k.code === 'Space') return 'пробел'
  const letter = k.code.startsWith('Key') ? k.code.slice(3).toLowerCase() : ''
  const l = KEY_LABELS[letter]
  return l ? (k.shift ? l[1] : l[0]) ?? '' : { Period: '.', Comma: ',', Slash: '?', Digit1: '!' }[k.code] ?? ''
})
const nextLetter = computed(() => (next.value?.key.code.startsWith('Key') ? next.value.key.code.slice(3).toLowerCase() : ''))
const needShift = computed(() => !!next.value?.key.shift)
const progress = computed(() => (items.value.length ? Math.round((idx.value / items.value.length) * 100) : 0))

function readBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) || '{}')
  } catch {
    return {}
  }
}
const best = ref<Record<string, number>>({})

function start() {
  items.value = level.value === 'custom' ? list.value.map(it => it.text) : kbItems(level.value)
  started.value = level.value === 'custom' && items.value.length > 0
  idx.value = 0
  pos.value = 0
  errors.value = 0
  startedAt.value = 0
  result.value = null
  void nextTick(() => inputEl.value?.focus())
}

function finish() {
  const total = keyCount(items.value)
  const sec = Math.max(1, (Date.now() - startedAt.value) / 1000)
  const cpm = Math.round((total / sec) * 60)
  const acc = Math.round((total / (total + errors.value)) * 100)
  const b = readBest()
  // у своего набора рекорда нет: он зависит от того, что выбрано
  const isBest = level.value !== 'custom' && cpm > (b[level.value] ?? 0)
  if (isBest) {
    b[level.value] = cpm
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(b))
    } catch {
      /* хранилище недоступно: рекорд не запомнится */
    }
    best.value = b
  }
  result.value = { cpm, acc, sec: Math.round(sec), best: isBest }
}

function onKey(e: KeyboardEvent) {
  if (result.value || !next.value) return
  if (/^(Shift|Control|Alt|Meta|CapsLock|Tab|Escape)/.test(e.code) || e.ctrlKey || e.metaKey || e.altKey) return
  e.preventDefault()
  if (e.code === 'Backspace' || e.repeat) return
  if (!startedAt.value) startedAt.value = Date.now()
  if (matches(next.value.key, e)) {
    pos.value++
    if (pos.value >= keys.value.length) {
      idx.value++
      pos.value = 0
      if (idx.value >= items.value.length) finish()
    }
  } else {
    errors.value++
    flash.value = true
    setTimeout(() => (flash.value = false), 180)
  }
}

onMounted(() => {
  best.value = readBest()
  start()
})
const setLevel = (id: Tab) => {
  level.value = id
  start()
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="keyboard" />
    <div class="chips">
      <button v-for="l in TABS" :key="l.id" type="button" class="chip" :class="{ on: level === l.id }" :title="l.hint" @click="setLevel(l.id)">{{ l.label }}</button>
    </div>
    <p class="intro">{{ TABS.find(l => l.id === level)!.hint }}. Нужна обычная клавиатура: печатай по подсказке, раскладку в системе менять не нужно, клавиши совпадают с корейской 두벌식.
      <template v-if="level !== 'custom' && best[level]"> Рекорд уровня: {{ best[level] }} нажатий в минуту.</template></p>

    <div :class="{ cust: isCustom }">
    <aside v-if="isCustom" class="cl">
      <div class="cl-head">
        <b>Выбрано · {{ list.length }}</b>
        <button v-if="list.length" type="button" class="link" @click="clearAll">Очистить всё</button>
      </div>
      <ul v-if="list.length">
        <li v-for="it in list" :key="it.text">
          <span class="ko">{{ it.text }}</span><small>{{ it.ru }}</small>
          <button type="button" aria-label="Убрать из набора" @click="remove(it.text)">✕</button>
        </li>
      </ul>
      <p v-else class="cl-empty">Пока ничего. Найди слово в списке, нажми «Случайное» или добавь слова из ошибок.</p>
    </aside>
    <div class="cmain">
    <div v-if="isCustom" class="cpick">
      <div class="chips">
        <button v-for="k in CUSTOM_KINDS" :key="k.id" type="button" class="chip" :class="{ on: kind === k.id }" @click="((kind = k.id), (q = ''))">{{ k.label }}</button>
        <select v-model="src" aria-label="Откуда брать" @change="q = ''">
          <option v-for="x in CUSTOM_SOURCES" :key="x.id" :value="x.id">{{ x.label }} · {{ counts[x.id] }}</option>
        </select>
      </div>
      <div class="csearch">
        <input v-model="q" type="text" autocomplete="off" spellcheck="false" :placeholder="kind === 'words' ? 'Найти слово: ем, есть, 먹다…' : 'Найти предложение…'" aria-label="Поиск" @focus="dropOpen = true" @blur="dropOpen = false" @keydown.esc="dropOpen = false" />
        <button type="button" class="chip" @click="addRandom">Случайное</button>
        <button v-if="src !== 'dict'" type="button" class="chip" @click="addAll">Добавить все</button>
        <ul v-if="dropOpen && found.length" class="cdrop" role="listbox">
          <li v-for="it in found" :key="it.text">
            <button type="button" :disabled="isChosen(it.text)" @mousedown.prevent="add(it)">
              <span class="ko">{{ it.text }}</span><small>{{ it.ru }}</small><i v-if="isChosen(it.text)">✓</i>
            </button>
          </li>
        </ul>
        <p v-else-if="dropOpen" class="cdrop none">{{ pool.length ? 'Ничего не нашлось' : 'Здесь пока пусто' }}</p>
      </div>
      <p v-if="chosen.length >= MAX_CUSTOM" class="intro">Набралось {{ MAX_CUSTOM }}: больше добавить нельзя.</p>
    </div>

    <div v-if="isCustom && !started" class="stage idle">
      <template v-if="list.length">
        <div class="res-title">{{ list.length }} для печати</div>
        <div class="res-btns"><button type="button" class="chip on" @click="start">Начать</button></div>
      </template>
      <p v-else class="cl-empty">Выбери слова или предложения, и здесь появится кнопка «Начать».</p>
    </div>
    <div v-else class="stage" :class="{ bad: flash }" @click="inputEl?.focus()">
      <input ref="inputEl" class="catch" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Поле набора" @keydown="onKey" @blur="() => {}" />
      <template v-if="!result">
        <div class="meter"><i :style="{ width: progress + '%' }" /></div>
        <div class="count">{{ Math.min(idx + 1, items.length) }} из {{ items.length }}</div>
        <div class="target" aria-live="polite">
          <span v-for="(c, i) in chars" :key="i" class="ch" :class="{ done: i < doneChars, now: i === doneChars }">{{ dictation && i >= doneChars ? '·' : c === ' ' ? '·' : c }}</span>
        </div>
        <div v-if="dictation" class="need">Переведи на корейский: <b>{{ ruOfCur }}</b></div>
        <div v-else class="need">Нажми: <b>{{ nextLabel }}</b><span v-if="needShift"> вместе с Shift</span></div>
      </template>
      <template v-else>
        <div class="res-title">Готово!</div>
        <div class="res-row"><b>{{ result.cpm }}</b> нажатий в минуту <span v-if="result.best" class="rec">новый рекорд</span></div>
        <div class="res-row">Точность <b>{{ result.acc }}%</b> · время <b>{{ result.sec }} с</b> · ошибок <b>{{ errors }}</b></div>
        <div class="res-btns">
          <button type="button" class="chip on" @click.stop="start">Ещё раз</button>
          <button v-if="level === 'custom'" type="button" class="chip" @click.stop="((started = false), (result = null))">Изменить набор</button>
          <button v-else-if="level !== 'dictation'" type="button" class="chip" @click.stop="setLevel(LEVEL_IDS[LEVEL_IDS.indexOf(level as KbLevel) + 1]!)">Следующий уровень</button>
        </div>
      </template>
    </div>

    <div v-if="!isCustom || started" class="kb" aria-hidden="true">
      <div v-for="(row, r) in ROWS" :key="r" class="krow" :style="{ paddingLeft: r * 18 + 'px' }">
        <div v-for="k in row" :key="k" class="key" :class="{ hit: !result && !dictation && nextLetter === k, shift: !result && !dictation && nextLetter === k && needShift }">
          <span>{{ KEY_LABELS[k]![0] }}</span><small v-if="KEY_LABELS[k]![1]">{{ KEY_LABELS[k]![1] }}</small>
        </div>
      </div>
      <div class="krow"><div class="key space" :class="{ hit: !result && !dictation && next?.key.code === 'Space' }">пробел</div></div>
    </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.cust { display: grid; grid-template-columns: minmax(230px, 300px) minmax(0, 1fr); gap: 16px; align-items: start; margin-top: 16px; }
.cust .stage { margin-top: 14px; }
.cl { padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.cl-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.cl ul, .cdrop { list-style: none; margin: 0; padding: 0; }
.cl ul { display: flex; flex-direction: column; gap: 4px; max-height: 420px; overflow-y: auto; }
.cl li { display: flex; align-items: baseline; gap: 8px; padding: 6px 8px; border-radius: 10px; background: var(--gold-soft); }
.cl li .ko { font-family: var(--ko); font-weight: 600; }
.cl li small { flex: 1; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl li button, .link { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
.cl li button:hover, .link:hover { color: var(--pink); }
.cl-empty { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.45; }
.cpick .chips select { padding: 6px 10px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 99px; }
.csearch { position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.csearch input { flex: 1 1 220px; min-width: 0; padding: 10px 14px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.csearch input:focus { outline: none; border-color: var(--gold); }
.cdrop { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 5; max-height: 320px; overflow-y: auto; border: 1px solid var(--line); border-radius: 14px; background: var(--bg, #fff); box-shadow: 0 12px 30px rgba(0, 0, 0, .15); }
.cdrop.none { padding: 12px 14px; color: var(--muted); }
.cdrop button { display: flex; align-items: baseline; gap: 10px; width: 100%; padding: 8px 14px; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
.cdrop button:hover:not(:disabled) { background: var(--gold-soft); }
.cdrop button:disabled { opacity: .55; cursor: default; }
.cdrop .ko { font-family: var(--ko); font-weight: 600; }
.cdrop small { flex: 1; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cdrop i { font-style: normal; color: var(--ok); }
.stage.idle { cursor: default; }
@media (max-width: 820px) { .cust { grid-template-columns: minmax(0, 1fr); } .cl ul { max-height: 220px; } }
.intro { margin: 12px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.stage { position: relative; margin-top: 16px; padding: 22px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); text-align: center; cursor: text; transition: border-color .12s, background .12s; }
.stage.bad { border-color: var(--bad); background: var(--bad-bg); }
.catch { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; cursor: text; }
.meter { height: 6px; border-radius: 99px; background: var(--gold-soft); overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--gold); transition: width .2s; }
.count { margin-top: 8px; font-size: 12.5px; color: var(--muted); }
.target { margin-top: 10px; min-height: 76px; font-family: var(--ko); font-size: 44px; font-weight: 700; letter-spacing: .04em; word-break: keep-all; }
.ch { color: var(--muted); }
.ch.done { color: var(--ok); }
.ch.now { color: var(--ink); text-decoration: underline; text-underline-offset: 8px; text-decoration-color: var(--gold); }
.need { margin-top: 6px; font-size: 15px; color: var(--muted); }
.need b { font-family: var(--ko); font-size: 20px; color: var(--ink); }
.res-title { font-size: 24px; font-weight: 700; }
.res-row { margin-top: 8px; font-size: 15px; }
.res-row b { font-size: 20px; }
.rec { margin-left: 6px; padding: 2px 9px; border-radius: 99px; background: var(--ok-bg); color: var(--ok); font-size: 12px; font-weight: 700; }
.res-btns { position: relative; z-index: 1; display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.kb { margin-top: 18px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.krow { display: flex; gap: 6px; }
.key { position: relative; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface);
  font-family: var(--ko); font-size: 17px; font-weight: 600; transition: background .1s, transform .1s; }
.key small { position: absolute; top: 2px; right: 5px; font-size: 10px; color: var(--muted); }
.key.hit { background: var(--gold); border-color: var(--gold); color: #fff; transform: translateY(-2px); }
.key.hit.shift { background: var(--pink); border-color: var(--pink); }
.key.hit small { color: #fff; }
.key.space { width: 240px; font-size: 13px; font-family: inherit; }
@media (max-width: 560px) { .key { width: 30px; height: 36px; font-size: 14px; } .krow { gap: 4px; } .key.space { width: 160px; } .target { font-size: 34px; } }
@media (max-width: 380px) { .key { width: 26px; } .krow { padding-left: 0 !important; gap: 3px; } .stage { padding: 16px 12px; } }
</style>
