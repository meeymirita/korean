<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { CATN, D, parseQuery, score, type Word } from '@/data/korean/words'
import { esc, hl } from '@/data/korean/render'

const q = ref('')
const cat = ref('')
const picked = ref<Word | null>(null)
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
</script>

<template>
  <div class="wrap">
    <SectionHead id="words" :sub="`словарь корейского · ${D.length} слов`" :big="D.length" />
    <div class="searchbar">
      <div class="sb">
        <input
          ref="input"
          v-model="q"
          type="text"
          autocomplete="off"
          placeholder="ем, есть, 먹다, мокта…"
          @input="picked = null"
        />
        <button title="Очистить" @click="clear">✕</button>
        <button title="Случайное слово" @click="random">🎲</button>
      </div>
      <div class="meta">
        <span>{{ counter }}</span>
        <span>ищет по переводу, корейскому, чтению, примеру · <b>/</b> — фокус на поиск</span>
      </div>
      <div class="chips">
        <button class="chip" :class="{ on: !cat }" @click="((cat = ''), (picked = null))">Все</button>
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
      <div v-for="d in rows" :key="d.n" class="row">
        <span class="n">{{ d.n }}</span>
        <span class="k" v-html="h(d.k)"></span>
        <span class="rd" v-html="h(d.r)"></span>
        <span class="tr" v-html="h(d.t)"></span>
        <span class="se" v-html="h(d.s)"></span>
      </div>
    </div>
    <div v-else class="empty">
      <div class="big">✿</div>
      Ничего не нашлось по «<span v-html="esc(q)"></span>».<br />Попробуй другое слово или русскую форму («ем» → «есть»).
    </div>
  </div>
</template>
