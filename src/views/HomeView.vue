<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { sections } from '@/data/korean/sections'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
</script>

<template>
  <main class="stub">
    <div class="jp">韓国語</div>
    <h1>Хлебушек</h1>
    <p class="muted">Корейский язык · 서울대 한국어+ 1A</p>

    <nav class="links">
      <RouterLink v-for="s in sections" :key="s.id" :to="`/korean/${s.id}`">
        <span class="line"></span>
        <span>{{ s.menu }}</span>
        <span v-if="s.private && !progress.unlocked" class="lock" title="Откроется после входа по токену">🔒</span>
      </RouterLink>
      <RouterLink to="/game">
        <span class="line"></span>
        <span>Игра на слова</span>
        <span v-if="!progress.unlocked" class="lock" title="Откроется после входа по токену">🔒</span>
      </RouterLink>
      <a href="https://meeymirita.ru/">
        <span class="line"></span>
        <span>← meeymirita.ru</span>
      </a>
    </nav>
  </main>
</template>

<style scoped>
.stub { max-width: 520px; margin: 0 auto; padding: 72px 24px; }
.jp { font-family: 'Noto Serif JP', serif; font-size: 13px; letter-spacing: .35em; color: var(--gold); }
h1 { margin: 6px 0 0; font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 52px; line-height: 1; }
.muted { margin: 12px 0 32px; color: var(--muted); font-size: 14px; }
.links { display: flex; flex-direction: column; }
.links a { display: flex; align-items: center; gap: 14px; padding: 8px 0; font-size: 15px; font-weight: 600;
  transition: color .2s, padding-left .2s; }
.links a:hover { color: var(--gold); padding-left: 8px; }
.line { width: 18px; height: 1px; background: var(--gold); }
.lock { font-size: 12px; opacity: .6; }
</style>
