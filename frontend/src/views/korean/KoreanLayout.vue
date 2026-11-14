<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { visit } from '@/composables/useLastVisited'
import '@/assets/home/fonts.css'
import '@/assets/sky.css'
import Avatar from '@/components/Avatar.vue'
import AuthGate from '@/components/AuthGate.vue'
import SearchHost from '@/components/SearchHost.vue'
import { openSearch } from '@/composables/useSearchWindow'
import Breadcrumbs from '@/components/korean/Breadcrumbs.vue'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import NotificationsBell from '@/components/korean/NotificationsBell.vue'
import MusicButton from '@/components/music/MusicButton.vue'
import { MENU_ICONS, sections } from '@/data/korean/sections'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { themeDark, toggleTheme } from '@/lib/theme'
import { comboFromEvent } from '@/lib/shortcuts'
import { useProgressStore } from '@/stores/progress'
import { useShortcutsStore } from '@/stores/shortcuts'

const counts: Record<string, number> = { words: D.length, grammar: G.length }
const progress = useProgressStore()
const route = useRoute()
const router = useRouter()
const shortcuts = useShortcutsStore()
watch(() => route.path, visit, { immediate: true })
watch(() => route.fullPath, () => (peek.value = false))

/** Режим «только задание»: боковое меню спрятано, страница на всю ширину. Выбор помнится на устройстве; клавиша F переключает. */
/** Страница без бокового меню, на всю ширину (отчёт): назад ведёт кнопка на самой странице. */
const bare = computed(() => route.path === '/korean/report')
const FOCUS_KEY = 'focus_mode'
const focus = ref(false)
try {
  focus.value = localStorage.getItem(FOCUS_KEY) === '1'
} catch {
  /* без запоминания */
}
/** Меню спрятано: при наведении на «☰ Меню» оно выезжает поверх страницы и прячется, когда курсор уходит. */
const peek = ref(false)
let peekTimer: ReturnType<typeof setTimeout> | undefined
function peekOpen() {
  clearTimeout(peekTimer)
  if (focus.value) peek.value = true
}
function peekClose(delay = 250) {
  clearTimeout(peekTimer)
  peekTimer = setTimeout(() => (peek.value = false), delay)
}
/** На странице «Магазин» меню прячется само (только на время визита, выбор на устройстве не меняется). */
let autoHidden = false
watch(
  () => route.path,
  path => {
    if (path === '/korean/shop' && !focus.value) {
      focus.value = true
      autoHidden = true
    } else if (path !== '/korean/shop' && autoHidden) {
      focus.value = false
      autoHidden = false
    }
  },
  { immediate: true },
)
function setFocus(v: boolean) {
  autoHidden = false
  peek.value = false
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
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  clearTimeout(peekTimer)
})
</script>

<template>
  <div class="study study-shell sky" :class="{ focus, peek, bare, pinned: route.path === '/korean/shop' }">
    <aside v-if="!bare" class="study-side" @mouseenter="peekOpen" @mouseleave="peekClose()">
      <RouterLink to="/" class="brand brand-row brand-home" title="На главную страницу">
        <span class="brand-mark">✳︎</span>
        <div>
          <h1 class="ko">우리말</h1>
          <div class="course">서울대 한국어+ 1A</div>
        </div>
      </RouterLink>
      <div class="study-links" role="navigation">
        <template v-for="s in sections.filter(s => !s.group && !(s.owner && progress.isGuest))" :key="s.id">
        <RouterLink :to="`/korean/${s.id}`">
          <span class="line"></span>
          <span class="ic"><Icon :name="MENU_ICONS[s.id] ?? 'star'" /></span>
          <span>{{ s.menu }}</span>
          <kbd v-if="shortcuts.labelOf('nav:' + s.id)" class="kb">{{ shortcuts.labelOf('nav:' + s.id) }}</kbd>
          <span v-if="s.private && !progress.unlocked" class="lock" title="Откроется после входа по токену"><Icon name="lock" /></span>
          <span v-else-if="s.id === 'shop' && progress.data.ready" class="ct rdy" title="Есть награды, которые можно получить">{{ progress.data.ready }}</span>
          <span v-else-if="counts[s.id]" class="ct">{{ counts[s.id] }}</span>
          <span v-else class="num">{{ s.num }}</span>
        </RouterLink>
        <RouterLink v-if="s.id === 'today'" to="/game/home">
          <span class="line"></span>
          <span class="ic"><Icon :name="MENU_ICONS.game!" /></span>
          <span>Игра на слова</span>
          <kbd v-if="shortcuts.labelOf('nav:game')" class="kb">{{ shortcuts.labelOf('nav:game') }}</kbd>
          <span v-if="!progress.unlocked" class="lock" title="Откроется после входа по токену"><Icon name="lock" /></span>
        </RouterLink>
        </template>
      </div>
      <RouterLink v-if="progress.unlocked" to="/korean/cabinet" class="study-level">
        <span class="lv-who">
          <Avatar :avatar="progress.data.profile.avatar" :size="26" />
          <b>{{ progress.data.profile.name || 'Мой кабинет' }}</b>
        </span>
        <span><Icon name="star" /> Уровень {{ progress.info.level }} · {{ progress.info.title }}</span>
        <span class="lv-bar"><i :style="{ width: progress.info.pct + '%' }"></i></span>
        <small><Icon name="fire" /> дней занятий {{ progress.studyDays }} · <Icon name="target" /> {{ Math.min(progress.todayOk, progress.goal) }} / {{ progress.goal }} сегодня</small>
      </RouterLink>
      <RouterLink v-else to="/korean/cabinet" class="study-level">
        <span><Icon name="lock" /> Войти по токену</span>
        <small>откроются задания, тренажёры, игра и кабинет</small>
      </RouterLink>
      <div class="foot">
        <button v-if="focus" class="theme-btn" title="Вернуть меню на место (клавиша F)" aria-label="Закрепить меню" @click="setFocus(false)"><span aria-hidden="true">⇥</span> Закрепить меню</button>
        <button v-else class="theme-btn" title="Спрятать меню (клавиша F)" aria-label="Спрятать меню" @click="setFocus(true)"><span aria-hidden="true">⇤</span> Спрятать меню</button>
        <button class="theme-btn" :title="themeDark ? 'Светлая тема' : 'Тёмная тема'" :aria-label="themeDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleTheme()"><span aria-hidden="true">{{ themeDark ? '☀' : '☾' }}</span> {{ themeDark ? 'Светлая' : 'Тёмная' }}</button>
      </div>
    </aside>
    <button v-if="focus && !bare" class="side-show" title="Наведи, чтобы открыть меню; нажми, чтобы закрепить (клавиша F)" aria-label="Показать меню" @mouseenter="peekOpen" @mouseleave="peekClose()" @focus="peekOpen" @click="setFocus(false)">☰ Меню</button>
    <main class="study-main">
      <Breadcrumbs />
      <AuthGate v-if="route.meta.private && !progress.unlocked" />
      <NuxtPage v-else />
    </main>
    <div class="topbar-fixed">
      <ClientOnly><MusicButton /></ClientOnly>
      <NotificationsBell v-if="progress.unlocked" />
      <!-- на главной раздела своё поле поиска: кнопку не дублируем (⌘K и «/» работают везде) -->
      <button v-if="route.path !== '/korean/home'" class="sw-btn" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" @click="openSearch()">
        <span class="ic">⌕</span><span class="t">Поиск</span><kbd>⌘K</kbd>
      </button>
    </div>
    <SearchHost />
    <GrammarModal />
  </div>
</template>
