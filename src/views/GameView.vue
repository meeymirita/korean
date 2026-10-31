<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AuthGate from '@/components/AuthGate.vue'
import { openSearch } from '@/composables/useSearchWindow'
import { sections } from '@/data/korean/sections'
import { initGame } from '@/game/engine'
import { useProgressStore } from '@/stores/progress'
import markupRaw from '@/game/markup.html?raw'
import Avatar from '@/components/Avatar.vue'
import { themeDark, toggleTheme } from '@/lib/theme'
import catSleep from '@/assets/game/cat-sleep.webp'
import catWow from '@/assets/game/cat-wow.webp'
import catCheer from '@/assets/game/cat-cheer.webp'
import bg from '@/assets/game/bg.webp'
import '@/assets/home/fonts.css'
import '@/assets/sky.css'
import '@/game/game.css'
import '@/game/redesign.css'

const progress = useProgressStore()
const markup = markupRaw.replace('CAT_BOOK', catCheer).replace('CAT_SLEEP', catSleep)
const bgStyle = { '--gx-bg': `url(${bg})` }

/** Меню профиля справа вверху (аватар): открывается по нажатию, закрывается по Esc и нажатию мимо. */
const userOpen = ref(false)
const userLinks = [
  { to: '/korean/cabinet', t: 'Мой кабинет', i: '♡' },
  { to: '/korean/today', t: 'Сегодня', i: '☀' },
  { to: '/korean/garden', t: 'Сад', i: '🌸' },
  { to: '/korean/words', t: 'Словарь', i: '▤' },
  { to: '/korean/grammar', t: 'Грамматика', i: '◉' },
  { to: '/korean/home', t: 'На платформу', i: '←' },
]
const searchFromUser = () => {
  userOpen.value = false
  openSearch()
}

/** Меню слева вверху: открывается при наведении (на планшете и телефоне по нажатию), закрывается, когда курсор ушёл, по Esc или по нажатию мимо. */
const menuOpen = ref(false)
let menuTimer: ReturnType<typeof setTimeout> | undefined
const menuIn = () => {
  clearTimeout(menuTimer)
  menuOpen.value = true
}
const menuOut = () => {
  clearTimeout(menuTimer)
  menuTimer = setTimeout(() => (menuOpen.value = false), 250)
}
const menuItems = sections.filter(s => !s.group)
const onDocDown = (e: Event) => {
  const t = e.target as HTMLElement
  if (menuOpen.value && !t.closest?.('.game-menu')) menuOpen.value = false
  if (userOpen.value && !t.closest?.('.gx-user')) userOpen.value = false
}
const onMenuKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') menuOpen.value = userOpen.value = false
}
onMounted(() => {
  document.body.classList.add('on-game')
  document.addEventListener('pointerdown', onDocDown)
  document.addEventListener('keydown', onMenuKey)
})
onBeforeUnmount(() => {
  document.body.classList.remove('on-game')
  document.removeEventListener('pointerdown', onDocDown)
  document.removeEventListener('keydown', onMenuKey)
  clearTimeout(menuTimer)
})
const route = useRoute()
let dispose: (() => void) | undefined

function start() {
  dispose = initGame({
    record: (o: { word: string | null; ok: boolean; xp?: number; mode?: string; detail?: { q?: string; a?: string; y?: string } }) => progress.record({ ...o, source: 'game' }),
    importXp: (n: number) => progress.importXp(n),
    state: () => ({ ...progress.info, todayOk: progress.todayOk, goal: progress.goal }),
    cats: () => progress.data.settings.gameCats,
    mode: () => String(route.query.mode ?? ''),
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
  <div class="study game sky gx" :style="bgStyle">
    <aside class="gx-nav">
      <RouterLink to="/korean/home" class="gx-brand" title="На платформу">
        <span class="gx-flower">✳︎</span>
        <div>
          <div class="gx-logo ko">우리말</div>
          <div class="gx-sub">Учим корейский вместе ♡</div>
        </div>
      </RouterLink>
      <button type="button" class="gx-find" title="Поиск по платформе" @click="openSearch()"><span aria-hidden="true">⌕</span> Поиск игр… <kbd>⌘K</kbd></button>
      <div class="gx-navbox">
        <img class="gx-cat gx-cat-nav" :src="catWow" alt="" aria-hidden="true" />
        <nav id="sideModes" class="gx-modes" aria-label="Режимы игры"></nav>
      </div>
      <RouterLink to="/korean/cabinet" class="gx-level">
        <template v-if="progress.unlocked">
          <span class="gx-lv-t"><span>⭐ Уровень {{ progress.info.level }} · {{ progress.info.title }}</span><b>{{ progress.info.into }} / {{ progress.info.span }}</b></span>
          <span class="lv-bar"><i :style="{ width: progress.info.pct + '%' }"></i></span>
        </template>
        <span v-else>🔒 Войти по токену</span>
      </RouterLink>
    </aside>

    <div class="gx-main">
      <header class="game-top gx-top">
        <div class="game-title">
          <h1><span class="gx-star">✦</span> Игры на слова</h1>
        </div>
        <div class="gx-tools">
          <div class="game-menu" @mouseenter="menuIn" @mouseleave="menuOut">
            <button type="button" class="game-pill" :aria-expanded="menuOpen" aria-haspopup="true" @click="menuOpen = !menuOpen">≡ Меню</button>
            <nav v-show="menuOpen" class="game-menu-list" aria-label="Разделы платформы">
              <RouterLink to="/korean/home" class="gm-item">← На платформу</RouterLink>
              <template v-for="s in menuItems" :key="s.id">
                <RouterLink v-if="s.id !== 'home'" :to="`/korean/${s.id}`" class="gm-item">
                  <span>{{ s.menu }}</span>
                  <span v-if="s.private && !progress.unlocked" title="Откроется после входа по токену">🔒</span>
                </RouterLink>
                <RouterLink v-if="s.id === 'today'" to="/game" class="gm-item on" aria-current="page"><span>Игра на слова</span></RouterLink>
              </template>
            </nav>
          </div>
          <button type="button" class="gx-round" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" aria-label="Поиск" @click="openSearch()">⌕</button>
          <button type="button" class="gx-round" :title="themeDark ? 'Светлая тема' : 'Тёмная тема'" :aria-label="themeDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleTheme()">{{ themeDark ? '☀' : '☾' }}</button>
          <div class="gx-user">
            <button type="button" class="gx-ava" :aria-expanded="userOpen" aria-haspopup="true" aria-label="Профиль" @click="userOpen = !userOpen">
              <Avatar :avatar="progress.data.profile.avatar" :size="40" />
              <span class="gx-chev" aria-hidden="true">⌄</span>
            </button>
            <div v-show="userOpen" class="gx-drop" role="menu">
              <RouterLink to="/korean/cabinet" class="gx-me" @click="userOpen = false">
                <Avatar :avatar="progress.data.profile.avatar" :size="44" />
                <span>
                  <b>{{ progress.unlocked ? progress.data.profile.name || 'Мой кабинет' : 'Гость' }}</b>
                  <small v-if="progress.unlocked">Уровень {{ progress.info.level }} · {{ progress.info.title }}</small>
                  <small v-else>Войти по токену</small>
                </span>
              </RouterLink>
              <button type="button" class="gx-di" @click="searchFromUser"><span class="gi">⌕</span> Поиск <kbd>⌘K</kbd></button>
              <button type="button" class="gx-di" @click="toggleTheme()"><span class="gi">{{ themeDark ? '☀' : '☾' }}</span> {{ themeDark ? 'Светлая тема' : 'Тёмная тема' }}</button>
              <div class="gx-sep"></div>
              <RouterLink v-for="l in userLinks" :key="l.to" :to="l.to" class="gx-di" @click="userOpen = false"><span class="gi">{{ l.i }}</span> {{ l.t }}</RouterLink>
            </div>
          </div>
        </div>
      </header>
      <div v-if="progress.unlocked" v-html="markup"></div>
      <AuthGate v-else />
    </div>
  </div>
</template>

<style>
.game {
  --panel: rgba(248, 247, 244, .92);
  --line: rgba(111, 105, 190, .22);
  --accent: #7863ff;
  --accent-ink: #fff;
  --accent-soft: rgba(143, 124, 240, .14);
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
.game .game-menu { position: relative; align-self: center; z-index: 60; }
.game .game-menu-list { position: absolute; top: calc(100% + 8px); left: 0; display: grid; gap: 2px; width: 240px; max-height: 70vh; overflow-y: auto; padding: 8px;
  background: #f6f1ff; border: 1px solid #fff; border-radius: 20px; box-shadow: 0 24px 60px rgba(60, 50, 130, .28); }
/* невидимый мостик между кнопкой и списком: курсор не «теряет» меню по дороге */
.game .game-menu-list::before { content: ''; position: absolute; left: 0; right: 0; top: -10px; height: 10px; }
.game .game-top .gm-item { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-radius: 12px; color: var(--ink); font-size: 14px; font-weight: 600; text-decoration: none; }
.game .game-top .gm-item:hover { background: #fff; color: var(--pink); text-decoration: none; }
.game .game-top .gm-item.on { background: linear-gradient(90deg, #f7d9f0, #e6e4ff); color: var(--pink); }
html[data-theme='dark'] .game .game-menu-list { background: #1d1f42; border-color: var(--line); }
html[data-theme='dark'] .game .game-top .gm-item:hover { background: rgba(255, 255, 255, .08); }
.game .game-links { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 10px; align-self: center; }
/* поиск, сад и словарь: одинаковые «таблетки» в одну линию */
.game .game-top .game-pill { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; font: inherit; font-size: 13px; font-weight: 600; line-height: 1; color: var(--ink);
  background: rgba(255, 255, 255, .92); border: 1px solid #fff; border-radius: 99px; box-shadow: 0 8px 22px rgba(100, 87, 170, .2); cursor: pointer; text-decoration: none; transition: .2s; }
.game .game-top .game-pill:hover { color: var(--pink); text-decoration: none; transform: translateY(-1px); }
.game .game-top .game-pill kbd { font: inherit; font-size: 11px; font-weight: 500; color: var(--muted); padding: 2px 7px; border-radius: 7px; background: #eee9ff; }
html[data-theme='dark'] .game .game-top .game-pill { background: rgba(37, 39, 78, .82); border-color: var(--line); }
html[data-theme='dark'] .game .game-top .game-pill kbd { background: rgba(255, 255, 255, .1); }
@media (max-width: 860px) { .game .game-top .game-pill kbd { display: none; } }
.game .game-top a:hover { text-decoration: underline; }
.game .game-title { text-align: center; }
.game .game-title h1 { margin: 2px 0 0; font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 34px; line-height: 1; }
.game h2, .game h3, .game .brand { font-family: 'Cormorant Garamond', serif; font-weight: 600; }
.game .brand { font-size: 26px; }
</style>
