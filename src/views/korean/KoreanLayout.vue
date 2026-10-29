<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import { sections } from '@/data/korean/sections'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { DAILY_GOAL } from '@/data/levels'
import { useProgressStore } from '@/stores/progress'

const counts: Record<string, number> = { words: D.length, grammar: G.length }
const progress = useProgressStore()
</script>

<template>
  <div class="study study-shell">
    <aside class="study-side">
      <RouterLink to="/" class="study-back">← На главную</RouterLink>
      <div class="brand">
        <div class="jp">韓国語</div>
        <h1>Хлебушек</h1>
        <div class="course">서울대 한국어+ 1A</div>
      </div>
      <div class="study-links" role="navigation">
        <RouterLink v-for="s in sections" :key="s.id" :to="`/korean/${s.id}`">
          <span class="line"></span>
          <span>{{ s.menu }}</span>
          <span v-if="counts[s.id]" class="ct">{{ counts[s.id] }}</span>
          <span v-else class="num">{{ s.num }}</span>
        </RouterLink>
      </div>
      <RouterLink to="/korean/progress" class="study-level">
        <span>⭐ Уровень {{ progress.info.level }} · {{ progress.info.title }}</span>
        <span class="lv-bar"><i :style="{ width: progress.info.pct + '%' }"></i></span>
        <small>🔥 серия {{ progress.streak }} · 🎯 {{ Math.min(progress.todayOk, DAILY_GOAL) }} / {{ DAILY_GOAL }} сегодня</small>
      </RouterLink>
      <div class="foot">
        <RouterLink to="/game">🍞 Игра на слова</RouterLink>
        <RouterLink to="/">← На главную</RouterLink>
      </div>
    </aside>
    <main class="study-main">
      <RouterView />
    </main>
    <GrammarModal />
  </div>
</template>
