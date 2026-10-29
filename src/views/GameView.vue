<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AuthGate from '@/components/AuthGate.vue'
import { initGame } from '@/game/engine'
import { useProgressStore } from '@/stores/progress'
import markup from '@/game/markup.html?raw'
import '@/game/game.css'

const progress = useProgressStore()
let dispose: (() => void) | undefined

function start() {
  dispose = initGame({
    record: (o: { word: string | null; ok: boolean; xp?: number }) => progress.record({ ...o, source: 'game' }),
    importXp: (n: number) => progress.importXp(n),
    state: () => ({ ...progress.info, todayOk: progress.todayOk, goal: progress.goal }),
    cats: () => progress.data.settings.gameCats,
    saveCats: (c: Record<string, number>) => progress.setSettings({ gameCats: { ...c } }),
  })
}

// игра запускается, когда страница открыта токеном; при выходе останавливается
onMounted(() => {
  if (progress.unlocked) start()
})
watch(
  () => progress.unlocked,
  async open => {
    if (open) {
      await nextTick()
      start()
    } else {
      dispose?.()
      dispose = undefined
    }
  },
)
onBeforeUnmount(() => dispose?.())
</script>

<template>
  <div class="study game">
    <header class="game-top">
      <RouterLink to="/">← На главную</RouterLink>
      <div class="game-title">
        <span class="jp">言葉遊び</span>
        <h1>Игра на слова</h1>
      </div>
      <RouterLink to="/korean/words">Словарь →</RouterLink>
    </header>
    <div v-if="progress.unlocked" v-html="markup"></div>
    <AuthGate v-else />
  </div>
</template>

<style>
.game {
  --panel: rgba(248, 247, 244, .92);
  --line: rgba(168, 130, 47, .3);
  --accent: #a8822f;
  --accent-ink: #fff;
  --accent-soft: rgba(168, 130, 47, .14);
  --ok: #3f6b4f;
  --ok-bg: rgba(63, 107, 79, .12);
  --bad: #a4402f;
  --bad-bg: rgba(164, 64, 47, .1);
  --shadow: 0 30px 60px -34px rgba(40, 38, 34, .45);
  --ko: 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Noto Sans CJK KR', sans-serif;
  font: 16px/1.45 'Manrope', sans-serif;
  color: var(--ink);
  word-break: keep-all;
  padding-bottom: 24px;
}
.game .game-top { max-width: none; margin: 0; padding: 18px clamp(16px, 2.4vw, 40px) 0; display: flex; align-items: flex-end;
  justify-content: space-between; gap: 16px; font-size: 14px; font-weight: 600; }
.game .game-top a { color: var(--gold); }
.game .game-top a:hover { text-decoration: underline; }
.game .game-title { text-align: center; }
.game .game-title .jp { font-family: 'Noto Serif JP', serif; font-size: 12px; letter-spacing: .35em; color: var(--gold); }
.game .game-title h1 { margin: 2px 0 0; font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 34px; line-height: 1; }
.game h2, .game h3, .game .brand { font-family: 'Cormorant Garamond', serif; font-weight: 600; }
.game .brand { font-size: 26px; }
</style>
