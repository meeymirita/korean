<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import MarkStar from '@/components/korean/MarkStar.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G } from '@/data/korean/grammar'
import { F } from '@/data/korean/render'
import { D } from '@/data/korean/words'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const { open } = useGrammarModal()
const marks = computed(() => progress.data.settings.marks)
/** Порядок как в закладках: что отмечено позже, то ниже. Удалённых из словаря и грамматики слов нет в списке. */
const words = computed(() => marks.value.filter(m => m.startsWith('w:')).map(m => D.find(d => d.k === m.slice(2))).filter(Boolean) as typeof D)
const rules = computed(() => marks.value.filter(m => m.startsWith('g:')).map(m => G.find(g => g.id === m.slice(2))).filter(Boolean) as typeof G)
</script>

<template>
  <div class="wrap">
    <SectionHead id="marks" :big="words.length + rules.length" />
    <p v-if="!words.length && !rules.length" class="cb-empty">
      Пока пусто. Нажми ☆ у слова в <RouterLink to="/korean/words">словаре</RouterLink> или в открытой карточке правила в
      <RouterLink to="/korean/grammar">грамматике</RouterLink>, и оно появится здесь.
    </p>

    <template v-if="words.length">
      <h2 class="today-h">Слова <small>{{ words.length }}</small></h2>
      <div class="tb">
        <div class="row h"><span>№</span><span>Корейский</span><span>Чтение</span><span>Перевод</span><span>Предложение</span></div>
        <div v-for="d in words" :key="d.n" class="row">
          <span class="n"><MarkStar kind="w" :id="d.k" /></span>
          <span class="k">{{ d.k }}</span>
          <span class="rd">{{ d.r }}</span>
          <span class="tr">{{ d.t }}</span>
          <span class="se">{{ d.s }}</span>
        </div>
      </div>
    </template>

    <template v-if="rules.length">
      <h2 class="today-h">Правила <small>{{ rules.length }}</small></h2>
      <div class="gg">
        <div v-for="g in rules" :key="g.id" class="gc mk-gc" role="button" tabindex="0" @click="open(g.id)" @keydown.enter="open(g.id)">
          <h3 v-html="F(g.ko)"></h3>
          <div class="rn">{{ g.ru }}</div>
          <div class="d">{{ g.d }}</div>
          <MarkStar kind="g" :id="g.id" />
        </div>
      </div>
    </template>
  </div>
</template>
