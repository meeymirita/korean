<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { SE, parseQuery } from '@/data/korean/words'
import { hl } from '@/data/korean/render'

const q = ref('')
const input = ref<HTMLInputElement>()
const openN = ref<number | null>(null)
const toggle = (n: number) => (openN.value = openN.value === n ? null : n)
const qs = computed(() => parseQuery(q.value))
const rows = computed(() =>
  qs.value.length
    ? SE.filter(d => qs.value.every(w => d.s.includes(w) || d.k.includes(w) || d.ft.includes(w) || d.fr.includes(w)))
    : SE,
)
</script>

<template>
  <div class="wrap">
    <SectionHead id="sentences" :big="SE.length" />
    <div class="searchbar">
      <div class="sb">
        <input ref="input" v-model="q" type="text" autocomplete="off" placeholder="поиск по предложению, слову или переводу" />
        <button title="Очистить" @click="((q = ''), input?.focus())">✕</button>
      </div>
      <div class="meta"><span>{{ qs.length ? 'Найдено: ' : 'Всего предложений: ' }}{{ rows.length }}</span></div>
    </div>
    <div class="tb">
      <template v-for="d in rows" :key="d.n">
        <div class="sc">
          <div class="ko">
            <button class="se-btn" :class="{ open: openN === d.n }" title="Разобрать предложение" @click="toggle(d.n)" v-html="hl(d.s, qs)"></button>
          </div>
          <div class="sw"><i>{{ d.n }}</i><b v-html="hl(d.k, qs)"></b> · <span v-html="hl(d.t, qs)"></span></div>
        </div>
        <div v-if="openN === d.n" class="row-detail"><SentenceBreakdown :sentence="d.s" /></div>
      </template>
      <div v-if="!rows.length" class="empty"><div class="big">✿</div>Ничего не нашлось</div>
    </div>
  </div>
</template>
