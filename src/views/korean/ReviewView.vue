<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { CATN, D, type Word } from '@/data/korean/words'

const cat = ref('')
const open = ref(false)
const word = ref<Word>(D[0]!)

function next() {
  const pool = cat.value ? D.filter(d => d.c.includes(cat.value)) : D
  open.value = false
  word.value = pool[Math.floor(Math.random() * pool.length)]!
}
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'SELECT') return
  if (e.key === ' ') {
    e.preventDefault()
    open.value = !open.value
  }
  if (e.key === 'ArrowRight' || e.key === 'Enter') next()
}
onMounted(() => {
  next()
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="wrap">
    <SectionHead id="review" />
    <div class="fcb">
      <select v-model="cat" @change="next">
        <option value="">Все слова</option>
        <option v-for="(name, c) in CATN" :key="c" :value="c">{{ name }}</option>
      </select>
      <span class="kbd">пробел — перевернуть · → — следующая</span>
    </div>
    <div class="fc" @click="open = !open">
      <div class="big">{{ word.k }}</div>
      <div v-if="!open" class="hint">нажми, чтобы открыть</div>
      <div v-else class="ans">
        {{ word.r }}<b>{{ word.t }}</b><small>{{ word.s }}</small>
      </div>
    </div>
    <div class="fcb"><button @click="next">Следующее →</button></div>
  </div>
</template>
