<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import MarkStar from '@/components/korean/MarkStar.vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { CATN, D, parseQuery, score, similarWords, type Word } from '@/data/korean/words'
import { esc, hl } from '@/data/korean/render'
import { usePersisted } from '@/composables/usePersisted'
import { useProgressStore } from '@/stores/progress'
import { useShareCard } from '@/composables/useShareCard'
import { TRANSLATIONS } from '@/data/korean/translations'

const progress = useProgressStore()
const marked = computed(() => progress.data.settings.marks.length)
const q = usePersisted('words_q', '', v => typeof v === 'string')
if (useRoute().query.q) q.value = String(useRoute().query.q) // ссылка с ?q= важнее запомненного поиска
const cat = usePersisted('words_cat', '', v => typeof v === 'string')
const picked = ref<Word | null>(null)
const openN = ref<number | null>(null)
const toggle = (n: number) => ((openN.value = openN.value === n ? null : n), (simN.value = null))
/** Для какого слова показаны «похожие» */
const simN = ref<number | null>(null)
const similar = computed(() => { const w = D.find(d => d.n === simN.value); return w ? similarWords(w) : [] })
function openWord(d: Word) {
  q.value = d.k
  picked.value = null
  openN.value = null
  simN.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
const input = ref<HTMLInputElement>()

const qs = computed(() => parseQuery(q.value))
const pool = computed(() => (cat.value ? D.filter(d => d.c.includes(cat.value)) : D))

const rows = computed(() => {
  if (picked.value) return [picked.value]
  if (!qs.value.length) return pool.value
  return pool.value
    .map(d => [score(d, qs.value), d] as const)
    .filter(x => x[0] > 0)
    .sort((a, b) => b[0] - a[0] || a[1].n - b[1].n)
    .map(x => x[1])
})

const counter = computed(() => {
  if (picked.value) return 'Случайное слово'
  if (qs.value.length) return `Найдено: ${rows.value.length}`
  return (cat.value ? `${CATN[cat.value]}: ` : 'Всего слов: ') + rows.value.length
})

const h = (text: string) => hl(text, picked.value ? [] : qs.value)

function clear() {
  q.value = ''
  picked.value = null
  input.value?.focus()
}
function random() {
  q.value = ''
  picked.value = D[Math.floor(Math.random() * D.length)]!
}
function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement).tagName
  if (e.key === '/' && tag !== 'INPUT') {
    e.preventDefault()
    input.value?.focus()
  }
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

const { share, busy: sharing } = useShareCard()
const shareWord = (d: Word) =>
  share({ kicker: 'слово', title: d.k, sub: d.t, lines: [d.r, d.s, TRANSLATIONS[d.s] ?? ''].filter(Boolean), icon: '🌸' }, `слово-${d.k}`)
</script>

<template>
  <div class="wrap">
    <SectionHead id="words" :sub="`словарь корейского · ${D.length} слов`" :big="D.length" />
    <div class="searchbar">
      <div class="sb">
        <input
          ref="input"
          data-page-search
          v-model="q"
          type="text"
          autocomplete="off"
          placeholder="ем, есть, 먹다, мокта…"
          @input="picked = null"
        />
        <button title="Очистить" aria-label="Очистить" @click="clear">✕</button>
        <button title="Случайное слово" aria-label="Случайное слово" @click="random">🎲</button>
      </div>
      <div class="meta">
        <span>{{ counter }}</span>
        <span>ищет по переводу, корейскому, чтению, примеру · <b>/</b> — фокус на поиск</span>
      </div>
      <div class="chips">
        <button class="chip" :class="{ on: !cat }" @click="((cat = ''), (picked = null))">Все</button>
        <RouterLink v-if="marked" to="/korean/marks" class="chip">★ Важное · {{ marked }}</RouterLink>
        <button
          v-for="(name, c) in CATN"
          :key="c"
          class="chip"
          :class="{ on: cat === c }"
          @click="((cat = c), (picked = null))"
        >
          {{ name }}
        </button>
      </div>
    </div>

    <div v-if="rows.length" class="tb">
      <div class="row h"><span>№</span><span>Корейский</span><span>Чтение</span><span>Перевод</span><span>Предложение</span></div>
      <template v-for="d in rows" :key="d.n">
        <div class="row">
          <span class="n"><MarkStar kind="w" :id="d.k" />{{ d.n }}</span>
          <span class="k" v-html="h(d.k)"></span>
          <span class="rd" v-html="h(d.r)"></span>
          <span class="tr" v-html="h(d.t)"></span>
          <span class="se">
            <button class="se-btn" :class="{ open: openN === d.n }" title="Разобрать предложение" @click="toggle(d.n)" v-html="h(d.s)"></button>
          </span>
        </div>
        <div v-if="openN === d.n" class="row-detail">
          <SentenceBreakdown :sentence="d.s" />
          <button class="share-btn" :disabled="sharing" @click="shareWord(d)">🖼 Поделиться словом</button>
          <button class="share-btn" :aria-pressed="simN === d.n" @click="simN = simN === d.n ? null : d.n">≈ Похожие слова</button>
          <div v-if="simN === d.n" class="sim">
            <template v-if="similar.length">
              <button v-for="s in similar" :key="s.n" class="chip" :title="s.r" @click="openWord(s)"><span class="ko">{{ s.k }}</span> · {{ s.t }}</button>
            </template>
            <span v-else class="sim-none">Похожих слов пока не нашлось.</span>
          </div>
        </div>
      </template>
    </div>
    <div v-else class="empty">
      <div class="big">✿</div>
      Ничего не нашлось по «<span v-html="esc(q)"></span>».<br />Попробуй другое слово или русскую форму («ем» → «есть»).
    </div>
  </div>
</template>
