<script setup lang="ts">
import { computed } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { G, type Gram } from '@/data/korean/grammar'
import { F } from '@/data/korean/render'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()

/** Пройденные темы: по данным (`st: 'ok'`), если владелец не снял отметку (метка u). */
const known = computed(() => G.filter(g => g.st === 'ok' && !progress.isMarked('u', g.id)))

const num = (g: Gram) => Number(/\d+/.exec(g.l ?? '')?.[0] ?? 999)
const ordered = computed(() => [...known.value].sort((a, b) => num(a) - num(b)))

/** Короткая выжимка карточки: формула и первый пример. */
function digest(g: Gram) {
  const formula = g.b.find(b => b[0] === 'formula')?.[1] as string | undefined
  const ex = (g.b.find(b => b[0] === 'ex')?.[1] as string[][] | undefined)?.[0]
  return { formula, ko: ex?.[0], ru: ex?.[1] }
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="know" :big="known.length" />
    <p class="intro">Одна страница перед созвоном: каждая пройденная тема коротко: формула и один пример. Нажми на тему, чтобы открыть полное объяснение.</p>
    <div v-if="!ordered.length" class="empty">Пока нет пройденных тем.</div>
    <div class="know-list">
      <NuxtLink v-for="g in ordered" :key="g.id" class="know-item" :to="{ path: '/korean/grammar', query: { g: g.id } }">
        <div class="head">
          <h3>{{ g.ko }}</h3>
          <span v-if="g.l" class="les">{{ g.l }}</span>
        </div>
        <div class="rn">{{ g.ru }}</div>
        <div v-if="digest(g).formula" class="formula" v-html="F(digest(g).formula!)" />
        <div v-if="digest(g).ko" class="ex"><span v-html="F(digest(g).ko!)" /> <span class="tr">{{ digest(g).ru }}</span></div>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.intro { margin: 10px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }
.empty { margin-top: 20px; color: var(--muted); }
.know-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-top: 18px; }
.know-item { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 18px;
  background: var(--surface); color: inherit; text-decoration: none; transition: transform .15s, border-color .15s; }
.know-item:hover { transform: translateY(-2px); border-color: var(--gold); }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
h3 { margin: 0; font-family: var(--ko); font-size: 22px; font-weight: 700; }
.les { font-size: 12px; color: var(--muted); white-space: nowrap; }
.rn { font-size: 14px; font-weight: 600; }
.formula { padding: 6px 10px; border-radius: 10px; background: var(--gold-soft); font-size: 14px; }
.ex { font-size: 15px; font-family: var(--ko); }
.ex .tr { font-family: inherit; color: var(--muted); font-size: 13.5px; }
</style>
