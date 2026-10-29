<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { parseQuery } from '@/data/korean/words'
import { cheatHtml, hangulHtml, numbersHtml, readingHtml, talkHtml } from '@/data/korean/pages'

const props = defineProps<{ id: 'cheat' | 'talk' | 'hangul' | 'reading' | 'numbers' }>()

const html = computed(
  () => ({ cheat: cheatHtml, talk: talkHtml, hangul: () => hangulHtml, reading: () => readingHtml, numbers: numbersHtml })[props.id](),
)

const route = useRoute()
const root = ref<HTMLElement>()

/** Подсвечивает слова запроса (?q=) на странице, раскрывает блоки <details> и прокручивает к первому совпадению. */
function highlight() {
  const el = root.value
  if (!el) return
  const qs = parseQuery(String(route.query.q ?? ''))
  if (!qs.length) return
  const re = new RegExp('(' + qs.map(q => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi')
  const nodes: Text[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (re.test(n.nodeValue!)) nodes.push(n as Text)
  nodes.forEach(n => {
    const frag = document.createDocumentFragment()
    n.nodeValue!.split(re).forEach((part, i) => {
      if (i % 2) {
        const m = document.createElement('mark')
        m.textContent = part
        frag.append(m)
      } else if (part) frag.append(part)
    })
    n.replaceWith(frag)
  })
  const first = el.querySelector('mark')
  if (!first) return
  for (let d = first.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true
  first.scrollIntoView({ block: 'center' })
}
onMounted(highlight)
watch(
  () => [route.query.q, props.id],
  () => nextTick(highlight),
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
    <div ref="root" class="rich" @click="onClick" v-html="html"></div>
  </div>
</template>
