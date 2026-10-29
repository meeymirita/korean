<script setup lang="ts">
import { computed, ref } from 'vue'
import LetterCard from '@/components/korean/LetterCard.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { groups, syllableRows, syllableVowels } from '@/data/alphabet'

const SYLLABLES = 'syllables'
const tab = ref(groups[0]!.id)
const group = computed(() => groups.find(g => g.id === tab.value))
const total = groups.reduce((n, g) => n + g.letters.length, 0)
</script>

<template>
  <div class="wrap">
    <SectionHead id="alphabet" :big="total" sub="наведи на букву (или нажми) — увидишь чтение" />

    <div class="chips">
      <button v-for="g in groups" :key="g.id" class="chip" :class="{ on: tab === g.id }" @click="tab = g.id">
        {{ g.title }} · {{ g.letters.length }}
      </button>
      <button class="chip" :class="{ on: tab === SYLLABLES }" @click="tab = SYLLABLES">Все слоги · 399</button>
    </div>

    <template v-if="group">
      <p class="al-note">{{ group.note }}</p>
      <div class="al-grid">
        <LetterCard v-for="l in group.letters" :key="l.char" :letter="l" />
      </div>
    </template>

    <template v-else>
      <p class="al-note">19 согласных × 21 гласная = 399 слогов. Наведи на ячейку, чтобы увидеть чтение.</p>
      <div class="sy-scroll">
        <div class="sy-grid">
          <div class="sy-corner"></div>
          <div v-for="v in syllableVowels" :key="v.char" class="sy-head sy-col" :title="v.reading">{{ v.char }}</div>
          <template v-for="r in syllableRows" :key="r.consonant">
            <div class="sy-head sy-row" :title="r.reading">{{ r.consonant }}</div>
            <div v-for="c in r.cells" :key="c.char" class="sy-cell" :title="`${c.reading} · ${c.roman}`">
              <span class="sy-ch">{{ c.char }}</span>
              <span class="sy-rd">{{ c.reading }}</span>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style>
.study .al-note { margin: 18px 0 0; font-size: 14px; color: var(--muted); }
.study .al-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 14px; margin-top: 16px; }
.study .sy-scroll { margin-top: 16px; max-height: 72vh; overflow: auto; background: var(--surface);
  border: 1px solid var(--line); border-radius: 16px; }
.study .sy-grid { display: grid; grid-template-columns: 2.4rem repeat(21, minmax(2.6rem, 1fr)); gap: 3px; min-width: max-content; padding: 6px; }
.study .sy-corner { position: sticky; top: 0; left: 0; z-index: 3; background: var(--bg); }
.study .sy-head { display: flex; align-items: center; justify-content: center; min-height: 2.4rem; font-family: var(--ko);
  font-size: .9rem; font-weight: 700; color: var(--gold); background: var(--bg); border-radius: 6px; }
.study .sy-col { position: sticky; top: 0; z-index: 2; }
.study .sy-row { position: sticky; left: 0; z-index: 2; }
.study .sy-cell { position: relative; display: flex; align-items: center; justify-content: center; min-height: 2.6rem;
  border: 1px solid var(--line-soft); border-radius: 6px; background: transparent; transition: transform .15s, border-color .15s; }
.study .sy-ch { font-family: var(--ko); font-size: 1rem; font-weight: 600; transition: opacity .15s; }
.study .sy-rd { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border-radius: 5px;
  background: var(--gold-soft); font-size: .66rem; font-weight: 700; color: var(--gold); text-align: center; opacity: 0;
  transition: opacity .15s; }
.study .sy-cell:hover { z-index: 5; transform: scale(1.18); border-color: var(--gold); background: var(--bg); }
.study .sy-cell:hover .sy-ch { opacity: .15; }
.study .sy-cell:hover .sy-rd { opacity: 1; }
</style>
