<script setup lang="ts">
import { computed, ref } from 'vue'
import { RARITY, cards, type Card, type CardState, type Rarity } from '@/data/garden'
import { CATN } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const all = computed(() => cards(progress.data))

const state = ref<'' | CardState>('')
const rarity = ref<'' | Rarity>('')
const cat = ref('')

const opened = computed(() => all.value.filter(c => c.state === 'open'))
const byRarity = computed(() => RARITY.map(r => ({ ...r, n: opened.value.filter(c => c.rarity === r.id).length })))

const rows = computed(() =>
  all.value.filter(
    c =>
      (!state.value || c.state === state.value) &&
      (!rarity.value || c.rarity === rarity.value) &&
      (!cat.value || c.word.c.includes(cat.value)),
  ),
)
const LIMIT = 120
const more = ref(false)
const shown = computed(() => (more.value ? rows.value : rows.value.slice(0, LIMIT)))

const catNames = (c: Card) => c.word.c.map(id => CATN[id]).join(', ')
const rname = (c: Card) => RARITY.find(r => r.id === c.rarity)?.name
const STATES: ['' | CardState, string][] = [
  ['', 'Все'],
  ['open', 'Открытые'],
  ['learning', 'Учатся'],
  ['locked', 'Закрытые'],
]
</script>

<template>
  <div class="cb-body">
    <div class="pg-cards">
      <div class="pg-card">
        <div class="pg-k">Открыто карточек</div>
        <div class="pg-v">🃏 {{ opened.length }} <small>из {{ all.length }}</small></div>
        <div class="pg-bar"><i :style="{ width: (opened.length / all.length) * 100 + '%' }"></i></div>
        <div class="pg-s">карточка открывается, когда слово выучено (3 верных ответа подряд)</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Редкость</div>
        <div class="cl-rar">
          <span v-for="r in byRarity" :key="r.id" class="cl-badge" :class="r.id" :title="r.hint">{{ r.name }} · {{ r.n }}</span>
        </div>
        <div class="pg-s">чем чаще ошибался в слове, тем реже карточка: это слова, которые ты победил</div>
      </div>
    </div>

    <div class="chips">
      <button v-for="[id, name] in STATES" :key="id" class="chip" :class="{ on: state === id }" @click="state = id">{{ name }}</button>
    </div>
    <div class="chips">
      <button class="chip" :class="{ on: !rarity }" @click="rarity = ''">Любая редкость</button>
      <button v-for="r in RARITY" :key="r.id" class="chip" :class="{ on: rarity === r.id }" @click="rarity = r.id">{{ r.name }}</button>
    </div>
    <div class="chips">
      <button class="chip" :class="{ on: !cat }" @click="cat = ''">Все темы</button>
      <button v-for="(name, c) in CATN" :key="c" class="chip" :class="{ on: cat === c }" @click="cat = c">{{ name }}</button>
    </div>

    <div v-if="rows.length" class="cl-grid">
      <div v-for="c in shown" :key="c.word.n" class="cl-card" :class="[c.state, c.rarity]">
        <template v-if="c.state === 'open'">
          <span class="cl-badge" :class="c.rarity">{{ rname(c) }}</span>
          <div class="cl-ko">{{ c.word.k }}</div>
          <div class="cl-rd">{{ c.word.r }}</div>
          <div class="cl-tr">{{ c.word.t }}</div>
          <div class="cl-st">ошибок {{ c.stat!.bad }} · верных {{ c.stat!.ok }}</div>
        </template>
        <template v-else-if="c.state === 'learning'">
          <div class="cl-ko">{{ c.word.k }}</div>
          <div class="cl-rd">{{ c.word.r }}</div>
          <div class="cl-tr cl-hid">перевод откроется…</div>
          <div class="cl-st">🌱 {{ c.stat!.streak }} / 3 подряд</div>
        </template>
        <template v-else>
          <div class="cl-ko">?</div>
          <div class="cl-tr cl-hid">{{ catNames(c) || 'слово' }}</div>
        </template>
      </div>
    </div>
    <div v-else class="empty"><div class="big">🃏</div>Таких карточек пока нет.<br />Отвечай верно в «Сегодня» и в тренажёрах: карточки появятся сами.</div>
    <button v-if="!more && rows.length > LIMIT" class="chip cl-more" @click="more = true">Показать ещё {{ rows.length - LIMIT }}</button>
  </div>
</template>
