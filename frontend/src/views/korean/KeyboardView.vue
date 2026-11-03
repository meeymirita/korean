<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { usePersisted } from '@/composables/usePersisted'
import { KB_LEVELS, kbItems, keyCount, type KbLevel } from '@/data/korean/keyboard'
import { KEY_LABELS, keysOfText, matches, ROWS } from '@/lib/hangulKeys'

const LEVEL_IDS = KB_LEVELS.map(l => l.id)
const level = usePersisted<KbLevel>('kb_level', 'letters', v => typeof v === 'string' && (LEVEL_IDS as string[]).includes(v))

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
  items.value = kbItems(level.value)
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
  const isBest = cpm > (b[level.value] ?? 0)
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
const setLevel = (id: KbLevel) => {
  level.value = id
  start()
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="keyboard" />
    <div class="chips">
      <button v-for="l in KB_LEVELS" :key="l.id" type="button" class="chip" :class="{ on: level === l.id }" :title="l.hint" @click="setLevel(l.id)">{{ l.label }}</button>
    </div>
    <p class="intro">{{ KB_LEVELS.find(l => l.id === level)!.hint }}. Нужна обычная клавиатура: печатай по подсказке, раскладку в системе менять не нужно, клавиши совпадают с корейской 두벌식.
      <template v-if="best[level]"> Рекорд уровня: {{ best[level] }} нажатий в минуту.</template></p>

    <div class="stage" :class="{ bad: flash }" @click="inputEl?.focus()">
      <input ref="inputEl" class="catch" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Поле набора" @keydown="onKey" @blur="() => {}" />
      <template v-if="!result">
        <div class="meter"><i :style="{ width: progress + '%' }" /></div>
        <div class="count">{{ Math.min(idx + 1, items.length) }} из {{ items.length }}</div>
        <div class="target" aria-live="polite">
          <span v-for="(c, i) in chars" :key="i" class="ch" :class="{ done: i < doneChars, now: i === doneChars }">{{ c === ' ' ? '·' : c }}</span>
        </div>
        <div class="need">Нажми: <b>{{ nextLabel }}</b><span v-if="needShift"> вместе с Shift</span></div>
      </template>
      <template v-else>
        <div class="res-title">Готово!</div>
        <div class="res-row"><b>{{ result.cpm }}</b> нажатий в минуту <span v-if="result.best" class="rec">новый рекорд</span></div>
        <div class="res-row">Точность <b>{{ result.acc }}%</b> · время <b>{{ result.sec }} с</b> · ошибок <b>{{ errors }}</b></div>
        <div class="res-btns">
          <button type="button" class="chip on" @click.stop="start">Ещё раз</button>
          <button v-if="level !== 'sentences'" type="button" class="chip" @click.stop="setLevel(LEVEL_IDS[LEVEL_IDS.indexOf(level) + 1]!)">Следующий уровень</button>
        </div>
      </template>
    </div>

    <div class="kb" aria-hidden="true">
      <div v-for="(row, r) in ROWS" :key="r" class="krow" :style="{ paddingLeft: r * 18 + 'px' }">
        <div v-for="k in row" :key="k" class="key" :class="{ hit: !result && nextLetter === k, shift: !result && nextLetter === k && needShift }">
          <span>{{ KEY_LABELS[k]![0] }}</span><small v-if="KEY_LABELS[k]![1]">{{ KEY_LABELS[k]![1] }}</small>
        </div>
      </div>
      <div class="krow"><div class="key space" :class="{ hit: !result && next?.key.code === 'Space' }">пробел</div></div>
    </div>
  </div>
</template>

<style scoped>
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
</style>
