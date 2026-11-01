<script setup lang="ts">
import Cat from '@/components/Cat.vue'
import Icon from '@/components/Icon.vue'
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
import yunaBook from '@/assets/home/yuna-book.webp'

const progress = useProgressStore()
/** Слова со звёздочкой: фильтр «★ Важное» показывает только их прямо в списке. */
const markedWords = computed(() => new Set(progress.data.settings.marks.filter(m => m.startsWith('w:')).map(m => m.slice(2))))
const marked = computed(() => markedWords.value.size)
/** Иконки вкладок-тем (имена из src/lib/icons.ts) */
const CAT_ICON: Record<string, string> = { Люди: 'user', природа: 'sprout', окружение: 'home', еда: 'bread', место: 'target', животные: 'cat-q', одежда: 'sparkle', событие: 'party', тело: 'heart', наречие: 'comet', эмоции: 'hearts' }
const fav = usePersisted('words_fav', false, v => typeof v === 'boolean')
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
const pool = computed(() => D.filter(d => (!cat.value || d.c.includes(cat.value)) && (!fav.value || markedWords.value.has(d.k))))

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
  return (fav.value ? 'Важное: ' : cat.value ? `${CATN[cat.value]}: ` : 'Всего слов: ') + rows.value.length
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
  share({ kicker: 'слово', title: d.k, sub: d.t, lines: [d.r, d.s, TRANSLATIONS[d.s] ?? ''].filter(Boolean), icon: 'sakura' }, `слово-${d.k}`)
</script>

<template>
  <div class="wrap words-page">
    <!-- Юна зафиксирована справа: страница прокручивается, она остаётся на месте (в body, чтобы не зависеть от родителей) -->
    <Teleport to="body">
      <img class="words-yuna" :src="yunaBook" alt="" aria-hidden="true" draggable="false" />
    </Teleport>
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
        <button title="Случайное слово" aria-label="Случайное слово" @click="random"><Icon name="dice" /></button>
      </div>
      <div class="meta">
        <span>{{ counter }}</span>
        <span>ищет по переводу, корейскому, чтению, примеру · <b>/</b> — фокус на поиск</span>
      </div>
      <div class="chips">
        <button class="chip" :class="{ on: !cat }" @click="((cat = ''), (picked = null))"><Icon name="dict" /> Все</button>
        <button v-if="marked || fav" class="chip" :class="{ on: fav }" :aria-pressed="fav" title="Показать только слова со звёздочкой" @click="((fav = !fav), (picked = null))"><Icon name="goldstar" /> Важное · {{ marked }}</button>
        <RouterLink v-if="progress.unlocked" to="/korean/forms" class="chip"><Icon name="wrench" /> Формы глаголов</RouterLink>
        <button
          v-for="(name, c) in CATN"
          :key="c"
          class="chip"
          :class="{ on: cat === c }"
          @click="((cat = c), (picked = null))"
        >
          <Icon :name="CAT_ICON[c] ?? 'star'" /> {{ name }}
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
          <button class="share-btn" :disabled="sharing" @click="shareWord(d)"><Icon name="picture" /> Поделиться словом</button>
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
      <Cat :name="fav && !q ? 'read' : 'think'" />
      <template v-if="fav && !q">Звёздочек пока нет: нажми ☆ рядом со словом, и оно появится здесь.</template>
      <template v-else>Ничего не нашлось по «<span v-html="esc(q)"></span>».<br />Попробуй другое слово или русскую форму («ем» → «есть»).</template>
    </div>
  </div>
</template>

<style>
/* Юна на «Словах»: двигай здесь */
.words-yuna {
  --h: min(80vh, 840px);   /* высота картинки */
  --right: 12px;           /* отступ от правого края */
  --bottom: 0px;           /* отступ от низа */
  position: fixed; right: var(--right); bottom: var(--bottom); height: var(--h); width: auto;
  z-index: 3; pointer-events: none; user-select: none; opacity: .95;
}
/* место справа под Юну: таблица не заходит под неё */
.study-shell.sky .study-main .wrap.words-page { padding-right: 240px; }
@media (max-width: 1100px) { .words-yuna { display: none; } .study-shell.sky .study-main .wrap.words-page { padding-right: 14px; } }
</style>
