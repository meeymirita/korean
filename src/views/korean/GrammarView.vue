<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G, SECS } from '@/data/korean/grammar'
import { F } from '@/data/korean/render'
import { usePersisted } from '@/composables/usePersisted'

const sec = usePersisted('grammar_sec', '', v => typeof v === 'string')
const list = computed(() => (sec.value ? G.filter(g => g.s === sec.value) : G))
const { open } = useGrammarModal()
const route = useRoute()
/** /korean/grammar?g=ayo сразу открывает карточку */
onMounted(() => {
  const g = String(route.query.g ?? '')
  if (G.some(x => x.id === g)) open(g)
})
</script>

<template>
  <div class="wrap">
    <SectionHead id="grammar" :big="G.length" />
    <div class="chips">
      <button class="chip" :class="{ on: !sec }" @click="sec = ''">Все</button>
      <button v-for="s in SECS" :key="s" class="chip" :class="{ on: sec === s }" @click="sec = s">{{ s }}</button>
    </div>
    <div class="gg">
      <button v-for="g in list" :key="g.id" class="gc" @click="open(g.id)">
        <h3 v-html="F(g.ko)"></h3>
        <div class="rn">{{ g.ru }}</div>
        <div class="d">{{ g.d }}</div>
        <div class="ft">
          <span class="pill">{{ g.s }}</span>
          <span v-if="g.l" class="pill l">{{ g.l }}</span>
          <span class="pill" :class="g.st === 'ok' ? 's' : 'n'">{{ g.st === 'ok' ? 'пройдено' : 'ещё рано' }}</span>
        </div>
      </button>
    </div>
  </div>
</template>
