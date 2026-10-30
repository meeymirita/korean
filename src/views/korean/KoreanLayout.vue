<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { visit } from '@/composables/useLastVisited'
import '@/assets/home/fonts.css'
import '@/assets/sky.css'
import Avatar from '@/components/Avatar.vue'
import AuthGate from '@/components/AuthGate.vue'
import SearchWindow from '@/components/SearchWindow.vue'
import { openSearch } from '@/composables/useSearchWindow'
import Breadcrumbs from '@/components/korean/Breadcrumbs.vue'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import { sections } from '@/data/korean/sections'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { themeDark, toggleTheme } from '@/lib/theme'
import { comboFromEvent } from '@/lib/shortcuts'
import { useProgressStore } from '@/stores/progress'
import { useShortcutsStore } from '@/stores/shortcuts'

const counts: Record<string, number> = { words: D.length, grammar: G.length }
const icons: Record<string, string> = { game: '◈', home: '⌂', today: '☀', cabinet: '♡', words: '▤', grammar: '◉', ref: '▣', trainers: '✧', review: '↻', garden: '🌸' }
const progress = useProgressStore()
const route = useRoute()
const router = useRouter()
const shortcuts = useShortcutsStore()
watch(() => route.path, visit, { immediate: true })

/** Режим «только задание»: боковое меню спрятано, страница на всю ширину. Выбор помнится на устройстве; клавиша F переключает. */
const FOCUS_KEY = 'focus_mode'
const focus = ref(false)
try {
  focus.value = localStorage.getItem(FOCUS_KEY) === '1'
} catch {
  /* без запоминания */
}
function setFocus(v: boolean) {
  focus.value = v
  try {
    localStorage.setItem(FOCUS_KEY, v ? '1' : '0')
  } catch {
    /* без запоминания */
  }
}
function onKey(e: KeyboardEvent) {
  // свои сочетания пунктов меню и вкладок кабинета (⌘/Ctrl + клавиша); во время записи в «Настройках» не срабатывают
  const combo = comboFromEvent(e)
  if (combo) {
    const to = shortcuts.capturing ? null : shortcuts.targetFor(combo)
    if (to) {
      e.preventDefault()
      void router.push(to)
    }
    return
  }
  const el = e.target as HTMLElement | null
  if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return
  if (document.querySelector('[role="dialog"]')) return
  setFocus(!focus.value)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="study study-shell sky" :class="{ focus }">
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
          <kbd v-if="shortcuts.labelOf('nav:' + s.id)" class="kb">{{ shortcuts.labelOf('nav:' + s.id) }}</kbd>
          <span v-if="s.private && !progress.unlocked" class="lock" title="Откроется после входа по токену">🔒</span>
          <span v-else-if="counts[s.id]" class="ct">{{ counts[s.id] }}</span>
          <span v-else class="num">{{ s.num }}</span>
        </RouterLink>
        <RouterLink v-if="s.id === 'today'" to="/game">
          <span class="line"></span>
          <span class="ic">{{ icons.game }}</span>
          <span>Игра на слова</span>
          <kbd v-if="shortcuts.labelOf('nav:game')" class="kb">{{ shortcuts.labelOf('nav:game') }}</kbd>
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
        <button class="theme-btn" title="Спрятать меню (клавиша F)" aria-label="Спрятать меню" @click="setFocus(true)"><span aria-hidden="true">⇤</span> Спрятать меню</button>
        <button class="theme-btn" :title="themeDark ? 'Светлая тема' : 'Тёмная тема'" :aria-label="themeDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleTheme()"><span aria-hidden="true">{{ themeDark ? '☀' : '☾' }}</span> {{ themeDark ? 'Светлая' : 'Тёмная' }}</button>
      </div>
    </aside>
    <button v-if="focus" class="side-show" title="Показать меню (клавиша F)" aria-label="Показать меню" @click="setFocus(false)">☰ Меню</button>
    <main class="study-main">
      <Breadcrumbs />
      <AuthGate v-if="route.meta.private && !progress.unlocked" />
      <RouterView v-else />
    </main>
    <button class="sw-btn" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" @click="openSearch()">
      <span class="ic">⌕</span><span class="t">Поиск</span><kbd>⌘K</kbd>
    </button>
    <SearchWindow />
    <GrammarModal />
  </div>
</template>
