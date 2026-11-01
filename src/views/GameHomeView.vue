<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthGate from '@/components/AuthGate.vue'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import Avatar from '@/components/Avatar.vue'
import { openSearch } from '@/composables/useSearchWindow'
import { usePersisted } from '@/composables/usePersisted'
import { ALL_GAMES, GAME_GROUPS, GAME_MIX, TOOL_IDS, findGames } from '@/data/games'
import { initGame } from '@/game/engine'
import markupRaw from '@/game/markup.html?raw'
import { iconImg } from '@/game/icons'
import TrainersView from '@/views/korean/TrainersView.vue'
import QuickView from '@/views/korean/QuickView.vue'
import ParticlesView from '@/views/korean/ParticlesView.vue'
import PairsView from '@/views/korean/PairsView.vue'
import TranslateView from '@/views/korean/TranslateView.vue'
import SyllablesView from '@/views/korean/SyllablesView.vue'
import { ICON } from '@/game/icons'
import { useProgressStore } from '@/stores/progress'
import { themeDark, toggleTheme } from '@/lib/theme'
import catSleep from '@/assets/game/cat-sleep.webp'
import catWow from '@/assets/game/cat-wow.webp'
import yunaStand from '@/assets/game/yuna-stand.webp'
import yunaSit from '@/assets/game/yuna-sit.webp'
import bg from '@/assets/game/bg.webp'
import '@/assets/home/fonts.css'
import '@/assets/sky.css'
import '@/game/game.css'
import '@/game/redesign.css'
import '@/game/shell.css'

const progress = useProgressStore()
/** Класс на body: глобальная кнопка поиска встаёт в одну линию с кнопками шапки (см. стили ниже). */
onMounted(() => document.body.classList.add('on-game-home'))
onBeforeUnmount(() => document.body.classList.remove('on-game-home'))
const bgStyle = { '--gx-bg': `url(${bg})` }
/** Ссылка «К списку игр» стоит в одной строке с кнопками режимов (внутри разметки игры, перед #modes). */
const markup = markupRaw
  .replace('<div class="modes" id="modes"></div>', '<div class="gh-modesrow"><a href="/game/home" class="gh-backlink" data-back>← К списку игр</a><div class="modes" id="modes"></div></div>')
  .replace('CAT_SLEEP', catSleep).replace(/ICON\((\w+)\)/g, (_, n: string) => iconImg(n))

/** Что открыто на странице: ничего (каталог), тренажёр (компонент Vue) или режим движка «Хлебушек». Выбор лежит в адресе ?game=… */
const route = useRoute()
const game = computed(() => (typeof route.query.game === 'string' ? route.query.game : ''))
const TOOLS = { match: TrainersView, quick: QuickView, particles: ParticlesView, pairs: PairsView, translate: TranslateView, syllables: SyllablesView }
const tool = computed(() => (TOOL_IDS as readonly string[]).includes(game.value) ? TOOLS[game.value as keyof typeof TOOLS] : null)
const engineOn = computed(() => !!game.value && !tool.value && ALL_GAMES.some(g => g.id === game.value))
const current = computed(() => ALL_GAMES.find(g => g.id === game.value))

const router = useRouter()
/** Откуда пришли: страница игры (например «Найди пару»), если мы перешли с неё на другую; иначе «К списку игр» ведёт в каталог. */
const cameFrom = ref('')
watch(
  () => route.fullPath,
  (now, old) => {
    const g = (path?: string) => new URL(path ?? '', 'http://x').searchParams.get('game')
    // смена режима внутри одной игры («Найди пару» → «Напиши перевод») не считается переходом
    if (old?.startsWith('/game/home?game=') && g(old) !== g(now)) cameFrom.value = old
    else if (g(now) === null || g(old) === g(now)) cameFrom.value = g(now) === null ? '' : cameFrom.value
    else cameFrom.value = ''
  },
)
const backTo = computed(() => (cameFrom.value && cameFrom.value !== route.fullPath ? cameFrom.value : '/game/home'))
const backLabel = computed(() => (backTo.value === '/game/home' ? '← К списку игр' : '← Назад'))
function goBack() {
  const to = backTo.value
  cameFrom.value = ''
  void router.push(to)
}
/** «К списку игр» внутри разметки движка: обычная ссылка, переход без перезагрузки страницы. */
function onMarkupClick(e: MouseEvent) {
  if ((e.target as HTMLElement).closest?.('[data-back]')) {
    e.preventDefault()
    goBack()
  }
}
let dispose: (() => void) | undefined
function startEngine() {
  dispose?.()
  dispose = initGame({
    record: (o: { word: string | null; ok: boolean; xp?: number; mode?: string; detail?: { q?: string; a?: string; y?: string } }) => progress.record({ ...o, source: 'game' }),
    importXp: (n: number) => progress.importXp(n),
    state: () => ({ ...progress.info, todayOk: progress.todayOk, goal: progress.goal }),
    cats: () => progress.data.settings.gameCats,
    mode: () => game.value,
    saveCats: (c: Record<string, number>) => progress.setSettings({ gameCats: { ...c } }),
  })
}
function stopEngine() {
  dispose?.()
  dispose = undefined
}
/** Движок стартует, когда открыт его режим и страница открыта токеном; при возврате к списку или уходе останавливается. */
watch([engineOn, game, () => progress.unlocked], async ([on, , open]) => {
  stopEngine()
  if (on && open) {
    await nextTick()
    startEngine()
  }
}, { flush: 'post' })
onMounted(async () => {
  if (engineOn.value && progress.unlocked) {
    await nextTick()
    startEngine()
  }
})
onBeforeUnmount(stopEngine)

const q = ref('')
/** Что показывать: все группы, одна группа или «Микс». Запоминается при обновлении страницы. */
const view = usePersisted('gh_view', 'all', v => typeof v === 'string')
/** Свёрнутые группы: отдельно в каталоге и в боковом меню (по умолчанию все свёрнуты, под Юной остаётся место). */
const closed = usePersisted<string[]>('gh_closed', [], v => Array.isArray(v))
const sideClosed = usePersisted<string[]>('gh_side_closed', GAME_GROUPS.map(g => g.id), v => Array.isArray(v))
const isOpen = (id: string) => !closed.value.includes(id)
const toggle = (id: string) => (closed.value = isOpen(id) ? [...closed.value, id] : closed.value.filter(x => x !== id))
/** Открытая сейчас игра подсвечена в меню слева, её группа раскрыта. */
const isActive = (x: { id: string; to: string }) => !!game.value && x.to === `/game/home?game=${game.value}${route.query.mode === 'type' ? '&mode=type' : ''}`
const hasActive = (g: { games: { id: string; to: string }[] }) => g.games.some(isActive)
const sideOpen = (id: string) => hasActive(GAME_GROUPS.find(g => g.id === id)!) || !sideClosed.value.includes(id)
const sideToggle = (id: string) => (sideClosed.value = sideOpen(id) ? [...sideClosed.value, id] : sideClosed.value.filter(x => x !== id))

const found = computed(() => findGames(ALL_GAMES, q.value).length)
const groups = computed(() =>
  GAME_GROUPS.filter(g => view.value === 'all' || view.value === g.id)
    .map(g => ({ ...g, list: findGames(g.games, q.value) }))
    .filter(g => g.list.length),
)
const mix = computed(() => (view.value === 'all' || view.value === 'mix' ? findGames(GAME_MIX, q.value) : []))
const icon = (n: string) => ICON[n] ?? ICON.star
const tabs = [{ id: 'all', t: 'Все игры' }, { id: 'mix', t: 'Микс' }, ...GAME_GROUPS.map(g => ({ id: g.id, t: g.title }))]
</script>

<template>
  <div class="study game sky gx gh" :style="bgStyle">
    <GrammarModal />
    <aside class="gx-nav">
      <RouterLink to="/korean/home" class="gx-brand" title="На платформу">
        <span class="gx-flower">✳︎</span>
        <div>
          <div class="gx-logo ko">우리말</div>
          <div class="gx-sub">Учим корейский вместе ♡</div>
        </div>
      </RouterLink>
      <img class="gx-cat gx-cat-nav" :src="catWow" alt="" aria-hidden="true" />
      <label class="gx-find"><span aria-hidden="true">⌕</span><input v-model="q" type="search" autocomplete="off" placeholder="Поиск игр…" aria-label="Поиск игры по названию" /></label>
      <div class="gx-navbox">
        <!-- движок «Хлебушек» ждёт эти два элемента: прячем, меню слева у страницы одно (группы) -->
        <template v-if="engineOn">
          <input id="gameFind" type="search" style="display: none" aria-hidden="true" tabindex="-1" />
          <nav id="sideModes" style="display: none" aria-hidden="true"></nav>
        </template>
        <nav class="gh-groups" aria-label="Группы игр">
          <div v-for="g in GAME_GROUPS" :key="g.id" class="gh-grp" :class="{ on: view === g.id || hasActive(g) }">
            <button type="button" class="gh-gbtn" :aria-expanded="sideOpen(g.id)" @click="sideToggle(g.id)">
              <img class="gi-img" :src="icon(g.icon)" alt="" aria-hidden="true" /><span>{{ g.title }}</span><i aria-hidden="true">{{ sideOpen(g.id) ? '⌄' : '›' }}</i>
            </button>
            <div v-show="sideOpen(g.id)" class="gh-glist">
              <RouterLink v-for="x in findGames(g.games, q)" :key="x.id" :to="x.to" :class="{ cur: isActive(x) }"><img class="gi-img" :src="icon(x.icon)" alt="" aria-hidden="true" />{{ x.name }}</RouterLink>
            </div>
          </div>
        </nav>
      </div>
      <img v-if="!game" class="gh-stand" :src="yunaStand" alt="" aria-hidden="true" draggable="false" />
      <div v-if="!game" class="gh-cloud" aria-hidden="true">
        <svg viewBox="0 0 200 110" width="100%" height="100%">
          <defs><linearGradient id="ghc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset="1" stop-color="#f6e6ff" /></linearGradient></defs>
          <g fill="#e48cc8" stroke="#e48cc8" stroke-width="6" stroke-linejoin="round">
            <rect x="14" y="26" width="172" height="46" rx="23" /><circle cx="46" cy="30" r="20" /><circle cx="86" cy="22" r="22" /><circle cx="128" cy="24" r="20" /><circle cx="164" cy="38" r="18" />
            <circle cx="52" cy="90" r="7" /><circle cx="36" cy="102" r="4" />
          </g>
          <g fill="url(#ghc)">
            <rect x="14" y="26" width="172" height="46" rx="23" /><circle cx="46" cy="30" r="20" /><circle cx="86" cy="22" r="22" /><circle cx="128" cy="24" r="20" /><circle cx="164" cy="38" r="18" />
            <circle cx="52" cy="90" r="7" /><circle cx="36" cy="102" r="4" />
          </g>
        </svg>
        <span>Во что<br />поиграть?</span>
      </div>
      <RouterLink to="/korean/cabinet" class="gx-level">
        <template v-if="progress.unlocked">
          <span class="gx-lv-t"><span><img class="gi-img" :src="ICON.star" alt="" aria-hidden="true" /> Уровень {{ progress.info.level }} · {{ progress.info.title }}</span><b>{{ progress.info.into }} / {{ progress.info.span }}</b></span>
          <span class="lv-bar"><i :style="{ width: progress.info.pct + '%' }"></i></span>
        </template>
        <span v-else><Icon name="lock" /> Войти по токену</span>
      </RouterLink>
    </aside>

    <div class="gx-main">
      <header class="game-top gx-top">
        <div class="game-title">
          <h1><img class="gi-img gx-hstar" :src="ICON.star" alt="" aria-hidden="true" /> Игры на слова</h1>
          <p class="gh-sub">Игры, тренажёры и задания для изучения корейского ♡</p>
        </div>
        <div class="gx-tools">
          <button type="button" class="gx-round" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" aria-label="Поиск" @click="openSearch()">⌕</button>
          <button type="button" class="gx-round" :title="themeDark ? 'Светлая тема' : 'Тёмная тема'" :aria-label="themeDark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="toggleTheme()">{{ themeDark ? '☀' : '☾' }}</button>
          <RouterLink to="/korean/cabinet" class="gx-ava" aria-label="Кабинет"><Avatar :avatar="progress.data.profile.avatar" :size="40" /></RouterLink>
        </div>
        <img v-if="!game" class="gh-sit" :src="yunaSit" alt="" aria-hidden="true" draggable="false" />
      </header>

      <AuthGate v-if="!progress.unlocked" />
      <template v-else-if="game && (tool || engineOn)">
        <div v-if="tool" class="gh-back"><a :href="backTo" class="gh-backlink" @click.prevent="goBack">{{ backLabel }}</a><b v-if="tool && current">{{ current.name }}</b></div>
        <section v-if="tool" class="gh-panel gh-tool"><component :is="tool" :key="game" /></section>
        <div v-else v-html="markup" @click="onMarkupClick"></div>
      </template>
      <section v-else class="gh-panel">
        <div class="gh-tabs" role="tablist">
          <button v-for="t in tabs" :key="t.id" role="tab" :aria-selected="view === t.id" class="gh-tab" :class="{ on: view === t.id }" @click="view = t.id">{{ t.t }}</button>
        </div>
        <h2 class="gh-h">{{ view === 'all' ? 'Все игровые режимы' : view === 'mix' ? 'Микс' : GAME_GROUPS.find(g => g.id === view)?.title }} <small>{{ found }} игр</small></h2>

        <div v-if="mix.length" class="gh-block">
          <div class="gh-cards">
            <RouterLink v-for="x in mix" :key="x.id" :to="x.to" class="gh-card"><img class="gi-img" :src="icon(x.icon)" alt="" aria-hidden="true" /><span><b>{{ x.name }}</b><small>{{ x.desc }}</small></span><i aria-hidden="true">▶</i></RouterLink>
          </div>
        </div>
        <div v-for="g in groups" :key="g.id" class="gh-block">
          <button type="button" class="gh-bh" :aria-expanded="isOpen(g.id)" @click="toggle(g.id)">
            <img class="gi-img" :src="icon(g.icon)" alt="" aria-hidden="true" /><b>{{ g.title }}</b><span>{{ g.desc }}</span><em>{{ g.list.length }} {{ g.list.length === 1 ? 'игра' : g.list.length < 5 ? 'игры' : 'игр' }} {{ isOpen(g.id) ? '⌄' : '›' }}</em>
          </button>
          <div v-show="isOpen(g.id)" class="gh-cards">
            <RouterLink v-for="x in g.list" :key="x.id" :to="x.to" class="gh-card"><img class="gi-img" :src="icon(x.icon)" alt="" aria-hidden="true" /><span><b>{{ x.name }}</b><small>{{ x.desc }}</small></span><i aria-hidden="true">▶</i></RouterLink>
          </div>
        </div>
        <p v-if="!found" class="gh-empty">Ничего не нашлось. Попробуй другое слово.</p>
      </section>
    </div>
  </div>
</template>

<style>
/* ===== /game/home: Юны и каталог (двигай здесь) ===== */
.gh { --stand-h: 240px; --stand-left: 54px; --stand-bottom: 75px; --sit-h: 220px; --sit-right: 100px; --sit-top: -8px; --cloud-x: 50px; --cloud-y: 0px; }
.gh .gh-stand { position: absolute; z-index: 3; left: var(--stand-left); bottom: var(--stand-bottom); height: var(--stand-h); width: auto; pointer-events: none; user-select: none; }
.gh .gh-cloud { position: absolute; z-index: 4; left: calc(var(--stand-left) + 20px + var(--cloud-x)); bottom: calc(var(--stand-bottom) + var(--stand-h) - 6px + var(--cloud-y)); width: 140px; height: 77px; pointer-events: none; filter: drop-shadow(0 8px 14px rgba(100, 87, 170, .22)); }
.gh .gh-cloud svg { position: absolute; inset: 0; }
.gh .gh-cloud span { position: absolute; left: 0; right: 0; top: 17px; text-align: center; font-weight: 800; font-size: 13px; line-height: 1.15; color: var(--ink); }
.gh .gh-sit { position: absolute; z-index: 1; right: var(--sit-right); top: var(--sit-top); height: var(--sit-h); width: auto; pointer-events: none; user-select: none; }
.gh .game-top.gx-top { position: relative; display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 16px; }
.gh .gx-tools { flex: none; }
.gh .game-title { flex: 1; min-width: 0; }
.gh .gh-sub { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.gh .gh-groups { display: grid; gap: 6px; align-content: start; min-height: 0; overflow-y: auto; padding-right: 2px; }
.gh .gh-grp { border-radius: 16px; background: rgba(255, 255, 255, .6); }
.gh .gh-grp.on { background: linear-gradient(90deg, #f7d9f0, #e6e4ff); }
.gh .gh-gbtn { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; cursor: pointer; font-weight: 700; font-size: 13px; }
.gh .gh-gbtn span { flex: 1; }
.gh .gh-gbtn .gi-img, .gh .gh-glist .gi-img { width: 22px; height: 22px; object-fit: contain; }
.gh .gh-glist { display: grid; gap: 2px; padding: 0 8px 8px; }
.gh .gh-glist a { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px; font-size: 12px; color: var(--ink); text-decoration: none; }
.gh .gh-glist a.cur { background: #fff; color: var(--pink); font-weight: 700; }
.gh .gh-glist a:hover { background: #fff; color: var(--pink); }
.gh .gh-panel { margin: 14px 16px 0; padding: 18px 20px 22px; background: rgba(255, 255, 255, .72); border: 1px solid #fff; border-radius: 26px; box-shadow: 0 20px 50px rgba(100, 87, 170, .18); position: relative; z-index: 2; }
.gh .gh-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.gh .gh-tab { padding: 8px 16px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); background: rgba(255, 255, 255, .85); border: 1px solid #fff; border-radius: 99px; cursor: pointer; }
.gh .gh-tab.on { color: #fff; background: #7863ff; }
.gh .gh-h { margin: 16px 0 6px; font-family: inherit; font-weight: 800; font-size: 22px; }
.gh .gh-h small { margin-left: 8px; font-size: 13px; font-weight: 500; color: var(--muted); }
.gh .gh-block { margin-top: 12px; padding: 8px; background: rgba(255, 255, 255, .5); border-radius: 20px; }
.gh .gh-bh { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; padding: 6px 10px; cursor: pointer; }
.gh .gh-bh b { font-size: 16px; }
.gh .gh-bh span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted); }
.gh .gh-bh em { flex: none; white-space: nowrap; font-style: normal; font-size: 13px; font-weight: 700; color: var(--pink); }
.gh .gh-bh .gi-img { width: 30px; height: 30px; object-fit: contain; }
.gh .gh-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; padding: 6px 4px 4px; }
.gh .gh-card { display: flex; align-items: center; gap: 10px; padding: 12px; background: #fff; border: 1px solid #efeafd; border-radius: 16px; color: var(--ink); text-decoration: none; transition: .2s; }
.gh .gh-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(100, 87, 170, .2); }
.gh .gh-card .gi-img { width: 38px; height: 38px; object-fit: contain; flex: none; }
.gh .gh-card span { flex: 1; min-width: 0; display: grid; gap: 2px; }
.gh .gh-card b { font-size: 14px; line-height: 1.2; }
.gh .gh-card small { font-size: 11px; color: var(--muted); line-height: 1.3; }
.gh .gh-card i { font-style: normal; font-size: 11px; color: #fff; background: #7863ff; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; flex: none; }
.gh .gh-empty { margin: 18px 4px; color: var(--muted); }
@media (max-width: 1100px) { .gh .gh-stand, .gh .gh-cloud, .gh .gh-sit { display: none; } }
/* поиск (sw-btn) и кнопки шапки (gx-tools) стоят в одну линию: сначала поиск, справа за ним кнопки */
body.on-game-home .study.sky .sw-btn { top: 52px; right: 236px; }
@media (max-width: 860px) { body.on-game-home .study.sky .sw-btn { top: auto; right: auto; } }
.gh .gh-back { display: flex; align-items: center; gap: 14px; margin: 10px clamp(16px, 2.4vw, 40px) 0; }
.gh .gh-backlink { padding: 8px 16px; font-size: 13px; font-weight: 700; color: var(--ink); text-decoration: none; background: rgba(255, 255, 255, .9); border: 1px solid #fff; border-radius: 99px; box-shadow: 0 6px 18px rgba(100, 87, 170, .16); }
.gh .gh-backlink:hover { color: var(--pink); }
.gh .gh-modesrow { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.gh .gh-modesrow .modes { margin: 0; flex: 1; min-width: 0; }
.gh .gh-modesrow .gh-backlink { flex: none; }
.gh .gh-tool { margin-top: 10px; }
</style>
