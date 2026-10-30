<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { visit } from '@/composables/useLastVisited'
import '@/assets/home/fonts.css'
import '@/assets/sky.css'
import Avatar from '@/components/Avatar.vue'
import AuthGate from '@/components/AuthGate.vue'
import SearchWindow from '@/components/SearchWindow.vue'
import { openSearch } from '@/composables/useSearchWindow'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import { sections } from '@/data/korean/sections'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { useProgressStore } from '@/stores/progress'

const counts: Record<string, number> = { words: D.length, grammar: G.length }
const icons: Record<string, string> = { game: '◈', home: '⌂', today: '☀', cabinet: '♡', words: '▤', grammar: '◉', ref: '▣', trainers: '✧', review: '↻', garden: '🌸' }
const progress = useProgressStore()
const route = useRoute()
watch(() => route.path, visit, { immediate: true })
</script>

<template>
  <div class="study study-shell sky">
    <aside class="study-side">
      <RouterLink to="/" class="study-back">← На главную</RouterLink>
      <div class="brand brand-row">
        <span class="brand-mark">✳</span>
        <div>
          <h1 class="ko">우리말</h1>
          <div class="course">서울대 한국어+ 1A</div>
        </div>
      </div>
      <div class="study-links" role="navigation">
        <template v-for="s in sections.filter(s => !s.group)" :key="s.id">
        <RouterLink :to="`/korean/${s.id}`">
          <span class="line"></span>
          <span class="ic">{{ icons[s.id] }}</span>
          <span>{{ s.menu }}</span>
          <span v-if="s.private && !progress.unlocked" class="lock" title="Откроется после входа по токену">🔒</span>
          <span v-else-if="counts[s.id]" class="ct">{{ counts[s.id] }}</span>
          <span v-else class="num">{{ s.num }}</span>
        </RouterLink>
        <RouterLink v-if="s.id === 'today'" to="/game">
          <span class="line"></span>
          <span class="ic">{{ icons.game }}</span>
          <span>Игра на слова</span>
          <span v-if="!progress.unlocked" class="lock" title="Откроется после входа по токену">🔒</span>
        </RouterLink>
        </template>
      </div>
      <RouterLink v-if="progress.unlocked" to="/korean/cabinet" class="study-level">
        <span class="lv-who">
          <Avatar :avatar="progress.data.profile.avatar" :size="26" />
          <b>{{ progress.data.profile.name || 'Мой кабинет' }}</b>
        </span>
        <span>⭐ Уровень {{ progress.info.level }} · {{ progress.info.title }}</span>
        <span class="lv-bar"><i :style="{ width: progress.info.pct + '%' }"></i></span>
        <small>🔥 серия {{ progress.streak }} · 🎯 {{ Math.min(progress.todayOk, progress.goal) }} / {{ progress.goal }} сегодня</small>
      </RouterLink>
      <RouterLink v-else to="/korean/cabinet" class="study-level">
        <span>🔒 Войти по токену</span>
        <small>откроются задания, тренажёры, игра и кабинет</small>
      </RouterLink>
      <div class="foot">
      </div>
    </aside>
    <main class="study-main">
      <AuthGate v-if="route.meta.private && !progress.unlocked" />
      <RouterView v-else />
    </main>
    <button class="sw-btn" title="Поиск по платформе (Ctrl/⌘ + K)" @click="openSearch()">
      <span class="ic">⌕</span><span class="t">Поиск</span><kbd>⌘K</kbd>
    </button>
    <SearchWindow />
    <GrammarModal />
  </div>
</template>
