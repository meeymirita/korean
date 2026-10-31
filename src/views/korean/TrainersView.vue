<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { usePersisted } from '@/composables/usePersisted'
import { useQueryParam } from '@/composables/useQueryParam'
import MatchGame from '@/components/korean/MatchGame.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import TypingQuiz from '@/components/korean/TypingQuiz.vue'
import { CATN } from '@/data/korean/words'
import { DIR_LABEL, type Direction, SETS, dirsFor, pickRound, pool, shown } from '@/data/korean/trainer'

type Mode = 'match' | 'type'

/** Режим в адресе (?mode=type), «Найди пару» без параметра. */
const mode = useQueryParam<Mode>('mode', 'match', ['match', 'type'])
const cat = usePersisted('tr_cat', '', v => typeof v === 'string')
const size = usePersisted('tr_size', 8, v => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 20)
const dir = usePersisted<Direction>('tr_dir', 'ko-ru', v => typeof v === 'string')
const showReading = usePersisted('tr_reading', true, v => typeof v === 'boolean')

const available = computed(() => pool(cat.value))
/** Различных слов в теме (переводы не повторяются, как и в раунде). */
const poolSize = computed(() => pickRound(available.value, 1000).length)
/** В теме мало слов: недостающие добираются из всего словаря (там, где задания только «слово ↔ перевод»); у предложений и форм глаголов этого нет. */
const canFill = computed(() => !['qsent', 'verbs', 'adjectives'].includes(cat.value))
const roundSize = computed(() => (canFill.value ? size.value : Math.max(1, Math.min(size.value, poolSize.value))))
/** Раунд: слова темы, а если их меньше нужного, добавка из остального словаря (без повторов перевода). */
function makeRound() {
  const own = pickRound(available.value, roundSize.value)
  if (own.length >= roundSize.value || !canFill.value) return own
  const taken = new Set(own.map(w => shown(w).toLowerCase()))
  const rest = pool('').filter(w => !taken.has(shown(w).toLowerCase()))
  return [...own, ...pickRound(rest, roundSize.value - own.length)]
}
const filled = computed(() => canFill.value && poolSize.value < size.value)
const SIZES = [4, 6, 8, 10, 12, 15, 20]
/** Варианты размера: без добавки из словаря — не больше слов в теме (и «все»), с добавкой — любые. */
const sizes = computed(() => (canFill.value ? SIZES : [...SIZES.filter(n => n < poolSize.value), ...(poolSize.value <= 20 ? [poolSize.value] : [])]))
const round = ref(makeRound())
const roundId = ref(0)

function start(words?: typeof round.value) {
  round.value = words ?? makeRound()
  roundId.value++
}
const dirs = computed(() => dirsFor(cat.value))
const setCat = (c: string) => {
  cat.value = c
  if (!dirs.value.includes(dir.value)) dir.value = dirs.value[0]!
  start()
}
const setMode = (m: Mode) => (mode.value = m)
// новый раунд при любой смене режима, в том числе кнопкой «Назад»
watch(mode, () => start())
</script>

<template>
  <div class="wrap">
    <SectionHead id="trainers" />

    <div class="chips">
      <button class="chip" :class="{ on: mode === 'match' }" @click="setMode('match')">🔗 Найди пару</button>
      <button class="chip" :class="{ on: mode === 'type' }" @click="setMode('type')">⌨️ Напиши перевод</button>
      <RouterLink to="/korean/particles" class="chip">🧩 Частицы и окончания</RouterLink>
      <RouterLink to="/korean/pairs" class="chip">👯 Похожие, но разные</RouterLink>
      <RouterLink to="/korean/translate" class="chip">🔀 Переведи предложение</RouterLink>
      <RouterLink to="/korean/syllables" class="chip">🧱 Собери по слогам</RouterLink>
    </div>

    <div class="chips">
      <button class="chip" :class="{ on: !cat }" @click="setCat('')">Все слова</button>
      <button v-for="(name, c) in CATN" :key="c" class="chip" :class="{ on: cat === c }" @click="setCat(c)">{{ name }}</button>
    </div>

    <div class="chips">
      <span class="tr-group">Грамматика</span>
      <button v-for="s in SETS" :key="s.id" class="chip" :class="{ on: cat === s.id }" @click="setCat(s.id)">{{ s.title }}</button>
    </div>

    <div class="tr-set">
      <label>Слов в раунде
        <select :value="roundSize" @change="size = Number(($event.target as HTMLSelectElement).value); start()">
          <option v-for="n in sizes" :key="n" :value="n">{{ !canFill && n === poolSize ? `${n} (все)` : n }}</option>
        </select>
      </label>
      <label v-if="mode === 'type' && dirs.length > 1">Задание
        <select v-model="dir" @change="start()">
          <option v-for="d in dirs" :key="d" :value="d">{{ DIR_LABEL[d] }}</option>
        </select>
      </label>
      <label v-if="mode === 'match'" class="chk"><input v-model="showReading" type="checkbox" /> показывать чтение</label>
    </div>
    <p v-if="filled" class="tr-note">В этой теме всего {{ poolSize }} слов, остальные в раунде добраны из всего словаря.</p>
    <p v-else-if="!canFill && poolSize < size" class="tr-note">В этой теме всего {{ poolSize }}, поэтому в раунде их {{ roundSize }}.</p>

    <MatchGame
      v-if="mode === 'match'"
      :key="roundId"
      :words="round"
      :show-reading="showReading"
      @again="start()"
      @retry="start"
    />
     <TypingQuiz v-else :key="roundId" :words="round" :dir="dirs.includes(dir) ? dir : dirs[0]!" @again="start()" @retry="start" />
  </div>
</template>

<style>
.study .tr-group { align-self: center; margin-right: 4px; font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); }
.study .tr-set { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-top: 16px; font-size: 14px; color: var(--muted); }
.study .tr-set label { display: inline-flex; align-items: center; gap: 8px; }
.study .tr-set select { padding: 6px 10px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.study .tr-set .chk { cursor: pointer; }
.study .tr-set .chk input { accent-color: var(--gold); }
.study .tr-new { margin-left: auto; padding: 8px 16px; font-weight: 600; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 12px; }
.study .tr-new:hover { border-color: var(--gold); }
.study .tr-note { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
</style>
