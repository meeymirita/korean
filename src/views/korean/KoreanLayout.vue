<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import Avatar from '@/components/Avatar.vue'
import AuthGate from '@/components/AuthGate.vue'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import { sections } from '@/data/korean/sections'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { useProgressStore } from '@/stores/progress'

const counts: Record<string, number> = { words: D.length, grammar: G.length }
const progress = useProgressStore()
const route = useRoute()
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
          <span v-if="s.private && !progress.unlocked" class="lock" title="Откроется после входа по токену">🔒</span>
          <span v-else-if="counts[s.id]" class="ct">{{ counts[s.id] }}</span>
          <span v-else class="num">{{ s.num }}</span>
        </RouterLink>
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
        <RouterLink to="/game">🍞 Игра на слова <span v-if="!progress.unlocked">🔒</span></RouterLink>
        <RouterLink to="/">← На главную</RouterLink>
      </div>
    </aside>
    <main class="study-main">
      <AuthGate v-if="route.meta.private && !progress.unlocked" />
      <RouterView v-else />
    </main>
    <GrammarModal />
  </div>
</template>
