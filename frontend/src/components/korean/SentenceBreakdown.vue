<script setup lang="ts">
import { computed } from 'vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import '@/assets/breakdown.css'
import { analyze, SEG_LABEL } from '@/data/korean/parse'
import { TRANSLATIONS } from '@/data/korean/translations'

const props = defineProps<{ sentence: string }>()
const { open } = useGrammarModal()

const segments = computed(() => analyze(props.sentence))
const translation = computed(() => TRANSLATIONS[props.sentence])
const hasUnknown = computed(() => segments.value.some(s => s.type === 'unknown'))
</script>

<template>
  <div class="bd">
    <div class="bd-ko">{{ sentence }}</div>
    <div v-if="translation" class="bd-tr">«{{ translation }}»</div>

    <div class="bd-title">Как собрано</div>
    <div class="bd-cards">
      <div v-for="(s, i) in segments" :key="i" class="bd-card" :class="s.type">
        <div class="bd-kind">{{ SEG_LABEL[s.type] }}</div>
        <div class="bd-k">{{ s.text }}</div>
        <div v-if="s.reading" class="bd-r">{{ s.reading }}</div>
        <div class="bd-g">{{ s.type === 'unknown' ? '?' : s.gloss }}</div>
        <div v-if="s.explain" class="bd-ex">{{ s.explain }}</div>
        <button v-if="s.g" class="bd-rule" @click="open(s.g)">Правило →</button>
      </div>
    </div>
    <p v-if="hasUnknown" class="bd-note">«?» — этого слова нет в словаре сайта. Когда его добавят в словарь, оно появится в разборе.</p>
  </div>
</template>
