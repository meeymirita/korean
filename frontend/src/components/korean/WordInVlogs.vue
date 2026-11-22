<script setup lang="ts">
import { computed } from 'vue'
import { vlogHitsFor } from '@/data/korean/vlog-words'

/** «Звучит во влогах»: короткие фразы с этим словом из других влогов и ссылка на момент в видео. Только владельцу (влоги закрыты токеном). */
const props = defineProps<{ wordKey: string; exclude?: string }>()
const res = computed(() => (import.meta.client ? vlogHitsFor(props.wordKey, props.exclude ?? '') : { hits: [], total: 0 }))
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
</script>

<template>
  <div v-if="res.hits.length" class="wv">
    <p class="wv-h">Звучит ещё в {{ res.total }} {{ res.total === 1 ? 'фразе' : 'фразах' }} влогов</p>
    <ul>
      <li v-for="h in res.hits" :key="`${h.id}-${h.i}`">
        <span lang="ko">{{ h.ko }}</span><br />{{ h.ru }}
        <NuxtLink :to="`/korean/vlog?v=${h.id}&t=${Math.floor(h.s)}`" class="wv-link">{{ h.title }}, {{ clock(h.s) }}</NuxtLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wv { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); }
.wv-h { margin: 0 0 6px; color: var(--muted); font-size: 12.5px; text-transform: uppercase; letter-spacing: .05em; }
.wv ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 14.5px; line-height: 1.5; }
.wv li { padding-left: 10px; border-left: 3px solid var(--line); }
.wv-link { display: block; color: var(--accent); font-size: 12.5px; text-decoration: none; }
</style>
