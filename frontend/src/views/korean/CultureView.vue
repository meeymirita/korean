<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { CULTURE, CULTURE_CATS, type CultureCard } from '@/data/korean/culture'
import { D, type Word } from '@/data/korean/words'

type Cat = CultureCard['cat']
const cat = ref<Cat | 'all'>('all')
const CATS: Array<{ id: Cat | 'all'; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'food', label: CULTURE_CATS.food },
  { id: 'holiday', label: CULTURE_CATS.holiday },
  { id: 'etiquette', label: CULTURE_CATS.etiquette },
]

/** Несколько случайных слов для «вперемешку», выбираются один раз при открытии страницы. */
const mixWords = ref<Word[]>([])
onMounted(() => {
  const pool = [...D]
  const picked: Word[] = []
  for (let i = 0; i < 5 && pool.length; i++) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!)
  mixWords.value = picked
})

type Item = { kind: 'culture'; card: CultureCard } | { kind: 'word'; word: Word }

const items = computed<Item[]>(() => {
  const cards = CULTURE.filter(c => cat.value === 'all' || c.cat === cat.value).map((card): Item => ({ kind: 'culture', card }))
  if (cat.value !== 'all') return cards
  const out: Item[] = []
  let wi = 0
  cards.forEach((c, i) => {
    out.push(c)
    if ((i + 1) % 4 === 0 && wi < mixWords.value.length) out.push({ kind: 'word', word: mixWords.value[wi++]! })
  })
  return out
})
</script>

<template>
  <div class="wrap">
    <SectionHead id="culture" :big="CULTURE.length" />
    <p class="intro">Короткие карточки о корейской еде, праздниках и этикете. Во вкладке «Все» вперемешку попадаются и слова из словаря.</p>
    <div class="chips">
      <button v-for="c in CATS" :key="c.id" type="button" class="chip" :class="{ on: cat === c.id }" @click="cat = c.id">{{ c.label }}</button>
    </div>
    <div class="gg culture-gg">
      <template v-for="it in items" :key="it.kind === 'culture' ? it.card.id : 'w:' + it.word.k">
        <div v-if="it.kind === 'culture'" class="gc culture-gc" :class="'cat-' + it.card.cat">
          <span class="cat-badge">{{ CULTURE_CATS[it.card.cat] }}</span>
          <h3>{{ it.card.title }}</h3>
          <div class="d">{{ it.card.text }}</div>
        </div>
        <div v-else class="gc culture-gc word-gc">
          <span class="cat-badge">Слово</span>
          <h3>{{ it.word.k }}</h3>
          <div class="rn">{{ it.word.r }}</div>
          <div class="d">{{ it.word.t }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.intro { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.culture-gc { position: relative; }
.cat-badge { align-self: flex-start; padding: 3px 10px; border-radius: 99px; font-size: 11.5px; font-weight: 700; letter-spacing: .02em;
  background: rgba(168, 199, 255, .35); color: #4d4a86; }
.culture-gc.cat-food .cat-badge { background: rgba(255, 197, 158, .4); color: #8a4a1c; }
.culture-gc.cat-holiday .cat-badge { background: rgba(255, 170, 210, .35); color: #9c2e6a; }
.culture-gc.cat-etiquette .cat-badge { background: rgba(170, 220, 190, .4); color: #276b48; }
.word-gc { border-style: dashed; }
.word-gc .cat-badge { background: var(--gold); color: #fff; }
</style>
