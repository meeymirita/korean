<script setup lang="ts">
import { computed } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { cheatHtml, hangulHtml, numbersHtml, readingHtml, talkHtml } from '@/data/korean/pages'

const props = defineProps<{ id: 'cheat' | 'talk' | 'hangul' | 'reading' | 'numbers' }>()

const html = computed(
  () => ({ cheat: cheatHtml, talk: talkHtml, hangul: () => hangulHtml, reading: () => readingHtml, numbers: numbersHtml })[props.id](),
)

const { open } = useGrammarModal()
function onClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-g]')
  if (a?.dataset.g) open(a.dataset.g)
}
</script>

<template>
  <div class="wrap">
    <SectionHead :id="id" />
    <div class="rich" @click="onClick" v-html="html"></div>
  </div>
</template>
