<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { themed } from '@/lib/themed'
import catWow from '@/assets/game/cat-wow.webp'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AuthGate from '@/components/AuthGate.vue'
import GrammarModal from '@/components/korean/GrammarModal.vue'
import GameTools from '@/components/korean/GameTools.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { openSearch } from '@/composables/useSearchWindow'
import { usePersisted } from '@/composables/usePersisted'
import { ALL_GAMES, CATALOG_SECTIONS, GAME_GROUPS, GAME_MIX, QUICK_COLORS, TOOL_IDS, findGames } from '@/data/games'
import { searchGamesRemote } from '@/data/korean/search'
import { weakRules } from '@/data/charts'
import { initGame } from '@/game/engine'
import GameShell from '@/components/game/GameShell.vue'
import { createGameView } from '@/game/view'
import TrainersView from '@/views/korean/TrainersView.vue'
import QuickView from '@/views/korean/QuickView.vue'
import ParticlesView from '@/views/korean/ParticlesView.vue'
import PairsView from '@/views/korean/PairsView.vue'
import TranslateView from '@/views/korean/TranslateView.vue'
import ExplainTranslateView from '@/views/korean/ExplainTranslateView.vue'
import PartOfSpeechView from '@/views/korean/PartOfSpeechView.vue'
import ReadView from '@/views/korean/ReadView.vue'
import SyllablesView from '@/views/korean/SyllablesView.vue'
import KeyboardView from '@/views/korean/KeyboardView.vue'
import RuleView from '@/views/korean/RuleView.vue'
import { ICON } from '@/game/icons'
import { newRound, useProgressStore } from '@/stores/progress'
import { formatClock, useTimerStore } from '@/stores/timer'
import { useShopStore } from '@/stores/shop'
import '@/assets/home/fonts.css'
import '@/assets/sky.css'
import '@/game/game.css'
import '@/game/redesign.css'
import '@/game/shell.css'
import UiSearch from '@/components/ui/UiSearch.vue'
import UiPlay from '@/components/ui/UiPlay.vue'

const progress = useProgressStore()
const shop = useShopStore()
const timer = useTimerStore()
const { open: openGrammar } = useGrammarModal()
/** Класс на body: глобальная кнопка поиска встаёт в одну линию с кнопками шапки (см. стили ниже). */
onMounted(() => document.body.classList.add('on-game-home'))
onBeforeUnmount(() => document.body.classList.remove('on-game-home', 'gh-cat'))
/** Что движок «Хлебушек» показывает оболочке игры (счёт, списки, блиц, окна); пишет его `initGame`. */
const gameView = createGameView()

/** Что открыто на странице: ничего (каталог), тренажёр (компонент Vue) или режим движка «Хлебушек». Выбор лежит в адресе ?game=… */
const route = useRoute()
const game = computed(() => (typeof route.query.game === 'string' ? route.query.game : ''))
const TOOLS = { match: TrainersView, quick: QuickView, particles: ParticlesView, pairs: PairsView, translate: TranslateView, explain: ExplainTranslateView, speech: PartOfSpeechView, read: ReadView, syllables: SyllablesView, rule: RuleView, keyboard: KeyboardView }
const tool = computed(() => (TOOL_IDS as readonly string[]).includes(game.value) ? TOOLS[game.value as keyof typeof TOOLS] : null)
const engineOn = computed(() => !!game.value && !tool.value && ALL_GAMES.some(g => g.id === game.value))
const current = computed(() => ALL_GAMES.find(g => g.id === game.value))
/** Открыта игра (тренажёр или режим движка), а не каталог: тогда вместо шапки каталога одна строка `.gh-back`. */
const inGame = computed(() => !!game.value && (!!tool.value || engineOn.value))

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
/** Тестовая сборка для бота-игрока (docs/bot.md): читается в setup, там доступен контекст Nuxt. */
const testHooks = !!useRuntimeConfig().public.testHooks
let dispose: (() => void) | undefined
function startEngine() {
  dispose?.()
  // номер занятия для отчёта: один на каждый запуск режима игры
  const round = newRound()
  dispose = initGame({
    record: (o: { word: string | null; ok: boolean; xp?: number; mode?: string; detail?: { q?: string; a?: string; y?: string; g?: string } }) => progress.record({ ...o, source: 'game', detail: { ...o.detail, r: round } }),
    importXp: (n: number) => progress.importXp(n),
    state: () => ({ ...progress.info, todayOk: progress.todayOk, goal: progress.goal }),
    cats: () => progress.data.settings.gameCats,
    mode: () => game.value,
    fam: () => (typeof route.query.fam === 'string' ? route.query.fam : ''),
    weak: () => weakRules(progress.data.log).map(r => ({ game: r.game, family: r.family })),
    saveCats: (c: Record<string, number>) => progress.setSettings({ gameCats: { ...c } }),
    grammar: (id: string) => openGrammar(id),
    probe: testHooks,
    // предметы Юны только у владельца (docs/shop.md)
    items: {
      count: (id: string) => (progress.unlocked && !progress.isGuest ? shop.count(id) : 0),
      use: async (id: string) => !shop.busy && !!(await shop.use(id)),
    },
  }, gameView)
}
/** Запас предметов нужен к первому вопросу, но игра не ждёт медленный сервер дольше двух секунд. */
const loadShop = () =>
  progress.unlocked && !progress.isGuest ? Promise.race([shop.load(), new Promise<void>(resolve => setTimeout(resolve, 2000))]) : Promise.resolve()
function stopEngine() {
  dispose?.()
  dispose = undefined
}
/** Движок стартует, когда открыт его режим и страница открыта токеном; при возврате к списку или уходе останавливается. */
watch([engineOn, game, () => progress.unlocked], async ([on, , open]) => {
  stopEngine()
  if (on && open) {
    await nextTick()
    await loadShop()
    startEngine()
  }
}, { flush: 'post' })
onMounted(async () => {
  if (engineOn.value && progress.unlocked) {
    await nextTick()
    await loadShop()
    startEngine()
  }
})
onBeforeUnmount(stopEngine)

const q = ref('')
const remoteGameIds = ref<string[] | null>(null)
let gameSearchTimer: ReturnType<typeof setTimeout> | undefined
let gameSearchVersion = 0
watch(q, value => {
  clearTimeout(gameSearchTimer)
  const version = ++gameSearchVersion
  if (!value.trim()) { remoteGameIds.value = null; return }
  gameSearchTimer = setTimeout(async () => {
    const ids = await searchGamesRemote(value)
    if (version === gameSearchVersion) remoteGameIds.value = ids
  }, 220)
})
onBeforeUnmount(() => clearTimeout(gameSearchTimer))
// локальный поиск главный, индекс только добавляет найденное с опечатками
const findCatalogGames = (games: typeof ALL_GAMES) => {
  const local = findGames(games, q.value)
  if (!remoteGameIds.value?.length) return local
  const have = new Set(local.map(game => game.id))
  return [...local, ...games.filter(game => remoteGameIds.value!.includes(game.id) && !have.has(game.id))]
}
/** Пока открыта игра, список игр слева свёрнут: больше места под задание. Кнопка «☰» в шапке показывает его (помнится до закрытия вкладки). */
const navOpen = usePersisted('gh_nav_open', false, v => typeof v === 'boolean')
const folded = computed(() => !!game.value && !navOpen.value)
/** Раскрытые разделы каталога: по умолчанию все свёрнуты; пока идёт поиск, всё раскрыто, чтобы найденное было видно. Помнится при обновлении страницы. */
const openSecs = usePersisted<string[]>('gh_open_secs', [], v => Array.isArray(v))
const secOpen = (id: string) => !!q.value.trim() || openSecs.value.includes(id)
const secToggle = (id: string) => (openSecs.value = openSecs.value.includes(id) ? openSecs.value.filter(x => x !== id) : [...openSecs.value, id])
/** Свёрнутые группы в боковом меню (по умолчанию все свёрнуты, под Юной остаётся место). */
const sideClosed = usePersisted<string[]>('gh_side_closed', GAME_GROUPS.map(g => g.id), v => Array.isArray(v))
/** Открытая сейчас игра подсвечена в меню слева, её группа раскрыта. */
const isActive = (x: { id: string; to: string }) => !!game.value && x.to === `/game/home?game=${game.value}${route.query.mode === 'type' ? '&mode=type' : ''}`
const hasActive = (g: { games: { id: string; to: string }[] }) => g.games.some(isActive)
const sideOpen = (id: string) => hasActive(GAME_GROUPS.find(g => g.id === id)!) || !sideClosed.value.includes(id)
const sideToggle = (id: string) => (sideClosed.value = sideOpen(id) ? [...sideClosed.value, id] : sideClosed.value.filter(x => x !== id))

/** Каталог: быстрый старт и семь разделов (`CATALOG_SECTIONS`), поиск фильтрует и то и другое. */
const byId = new Map(ALL_GAMES.map(g => [g.id, g]))
const quick = computed(() => findCatalogGames(GAME_MIX).map(x => ({ ...x, ...QUICK_COLORS[x.id] })))
const sections = computed(() =>
  CATALOG_SECTIONS.map(sec => ({ ...sec, list: findCatalogGames(sec.ids.map(id => byId.get(id)).filter((g): g is (typeof ALL_GAMES)[number] => !!g)) })).filter(sec => sec.list.length),
)
/** Разделы лежат в независимых колонках (по числу строк поровну): раскрыл или свернул один, остальные не двигаются. */
const colCount = ref(3)
const secCols = computed(() => {
  const cols: (typeof sections.value)[] = Array.from({ length: colCount.value }, () => [])
  const heights: number[] = Array(colCount.value).fill(0)
  for (const sec of sections.value) {
    const i = heights.indexOf(Math.min(...heights))
    cols[i]?.push(sec)
    heights[i] = (heights[i] ?? 0) + sec.list.length + 2
  }
  return cols
})
let colQueries: MediaQueryList[] = []
const updateCols = () => (colCount.value = colQueries[0]?.matches ? 1 : colQueries[1]?.matches ? 2 : 3)
onMounted(() => {
  colQueries = [window.matchMedia('(max-width: 640px)'), window.matchMedia('(max-width: 1100px)')]
  colQueries.forEach(m => m.addEventListener('change', updateCols))
  updateCols()
})
onBeforeUnmount(() => colQueries.forEach(m => m.removeEventListener('change', updateCols)))
const found = computed(() => quick.value.length + sections.value.reduce((n, sec) => n + sec.list.length, 0))
const icon = (n: string) => ICON[n] ?? ICON.star
/** Таймер стоит в шапке каталога, плавающая кнопка на этой странице прячется (класс `gh-cat` на body). */
function syncCatalogClass() {
  document.body.classList.toggle('gh-cat', !inGame.value)
}
onMounted(syncCatalogClass)
watch(inGame, syncCatalogClass)
</script>

<template>
  <div class="study game sky gx gh" :class="{ folded }">
    <GrammarModal />
    <aside class="gx-nav">
      <RouterLink to="/korean/home" class="gx-brand" title="На платформу">
        <span class="gx-flower">✳︎</span>
        <div>
          <div class="gx-logo ko">우리말</div>
          <div class="gx-sub">Учим корейский вместе ♡</div>
        </div>
      </RouterLink>
      <button v-if="game" type="button" class="gh-hide" @click="navOpen = false">↑ Спрятать список игр</button>
      <img class="gx-cat gx-cat-nav" :src="themed(catWow)" alt="" aria-hidden="true" />
      <label class="gx-find"><span aria-hidden="true">⌕</span><input v-model="q" type="search" autocomplete="off" placeholder="Поиск игр…" aria-label="Поиск игры по названию" /></label>
      <div class="gx-navbox">
        <!-- движок «Хлебушек» ждёт эти два элемента: прячем, меню слева у страницы одно (группы) -->
        <template v-if="engineOn">
          <input id="gameFind" type="search" style="display: none" aria-hidden="true" tabindex="-1" />
          <nav id="sideModes" style="display: none" aria-hidden="true"></nav>
        </template>
        <nav class="gh-groups" aria-label="Группы игр">
          <div v-for="g in GAME_GROUPS" :key="g.id" class="gh-grp" :class="{ on: hasActive(g) }">
            <button type="button" class="gh-gbtn" :aria-expanded="sideOpen(g.id)" @click="sideToggle(g.id)">
              <img class="gi-img" :src="icon(g.icon)" alt="" aria-hidden="true" /><span>{{ g.title }}</span><i aria-hidden="true">{{ sideOpen(g.id) ? '⌄' : '›' }}</i>
            </button>
            <div class="gh-fold" :class="{ open: sideOpen(g.id) }" :inert="!sideOpen(g.id)">
              <div class="gh-in"><div class="gh-glist">
                <RouterLink v-for="x in findGames(g.games, q)" :key="x.id" :to="x.to" :class="{ cur: isActive(x) }"><img class="gi-img" :src="icon(x.icon)" alt="" aria-hidden="true" />{{ x.name }}</RouterLink>
              </div></div>
            </div>
          </div>
        </nav>
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
      <template v-if="inGame">
        <h1 v-if="!tool" class="gx-sr">Игры на слова</h1>
        <div class="gh-back"><a :href="backTo" class="gh-backlink" @click.prevent="goBack">{{ backLabel }}</a><b v-if="current" class="gh-name">{{ current.name }}</b><GameTools menu :folded="folded" @menu="navOpen = !navOpen" @search="openSearch()" /></div>
      </template>
      <header v-else class="game-top gx-top">
        <h1 class="gx-sr">Игры на слова</h1>
        <GameTools :menu="false" :folded="folded" @menu="navOpen = !navOpen" @search="openSearch()" />
      </header>

      <AuthGate v-if="!progress.unlocked" />
      <template v-else-if="inGame">
        <section v-if="tool" class="gh-panel gh-tool"><component :is="tool" :key="game" /></section>
        <GameShell v-else :view="gameView" />
      </template>
      <section v-else class="gh-panel gh-cat-panel">
        <header class="gh-top">
          <h2 class="gh-h">Все игровые режимы <small>{{ found }} игр</small></h2>
          <UiSearch v-model="q" class="gh-search" autocomplete="off" placeholder="Найти режим" aria-label="Найти режим" />
          <button v-if="timer.available" type="button" class="gh-timer" :class="{ on: timer.running }" :title="timer.running ? 'Остановить таймер' : 'Запустить таймер'" @click="timer.toggle()">
            <UiPlay :pause="timer.running" /><b>{{ timer.running ? formatClock(timer.session) : 'Таймер' }}</b><small>сегодня {{ formatClock(timer.today) }}</small>
          </button>
        </header>

        <div v-if="quick.length" class="gh-quick" aria-label="Быстрый старт">
          <RouterLink v-for="x in quick" :key="x.id" :to="x.to" class="gh-q"><span class="gh-qi" :style="{ background: x.bg }"><img class="gi-img" :src="icon(x.icon)" alt="" aria-hidden="true" /></span><span class="gh-qt"><b>{{ x.name }}</b><small>{{ x.desc }}</small></span><UiPlay :color="x.fg" /></RouterLink>
        </div>

        <div class="gh-secs">
          <div v-for="(col, ci) in secCols" :key="ci" class="gh-col">
          <section v-for="sec in col" :key="sec.id" class="gh-sec" :style="{ background: sec.bg }">
            <button type="button" class="gh-sh" :aria-expanded="secOpen(sec.id)" @click="secToggle(sec.id)">
              <span class="gh-si" :style="{ background: sec.fg }"><img class="gi-img" :src="icon(sec.icon)" alt="" aria-hidden="true" /></span><h3>{{ sec.title }}</h3><span class="ko">{{ sec.ko }}</span><em>{{ sec.list.length }}</em><i class="gh-chev" :class="{ open: secOpen(sec.id) }" aria-hidden="true"></i>
            </button>
            <div class="gh-fold" :class="{ open: secOpen(sec.id) }" :inert="!secOpen(sec.id)"><div class="gh-in">
              <div class="gh-rows">
                <RouterLink v-for="x in sec.list" :key="x.id" :to="x.to" class="gh-row" :title="x.desc"><img class="gi-img" :src="icon(x.icon)" alt="" aria-hidden="true" /><span>{{ x.name }}</span><UiPlay :size="26" /></RouterLink>
              </div>
            </div></div>
          </section>
          </div>
        </div>
        <p v-if="!found" class="gh-empty">Ничего не нашлось. Попробуй другое слово.</p>
      </section>
    </div>
  </div>
</template>

<style>
/* ===== /game/home: Юны и каталог (двигай здесь) ===== */
.gh { --sit-h: 220px; --sit-right: 100px; --sit-top: -8px; }
.gh .gh-sit { position: absolute; z-index: 1; right: var(--sit-right); top: var(--sit-top); height: var(--sit-h); width: auto; pointer-events: none; user-select: none; }
.gh .game-top.gx-top { position: relative; display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 16px; }
.gh .gx-tools { flex: none; margin-left: auto; }
/* заголовок страницы виден только читалкам экрана */
.gh .gx-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
/* игра открыта: список слева свёрнут, страница занимает всю ширину */
/* плавно: колонка списка сужается до нуля, сам список уезжает влево и гаснет */
.gh.game.gx { transition: grid-template-columns .45s cubic-bezier(.4, 0, .2, 1), column-gap .45s cubic-bezier(.4, 0, .2, 1); }
.gh.folded.game.gx { grid-template-columns: 0px minmax(0, 1fr); column-gap: 0; }
.gh .gx-nav { min-width: 0; overflow: hidden; transition: opacity .3s ease, transform .45s cubic-bezier(.4, 0, .2, 1), visibility .45s; }
.gh.folded .gx-nav { opacity: 0; transform: translateX(-28px); visibility: hidden; pointer-events: none; }
.gh .gh-hide { display: none; }
@media (max-width: 1100px) {
  /* узкий экран: список над игрой плавно сворачивается по высоте */
  /* пока список открыт над игрой, кнопка «☰» ушла бы под него: своя кнопка в самом списке */
  .gh .gh-hide { display: block; width: 100%; padding: 10px 14px; border: 0; border-radius: 14px; background: rgba(255, 255, 255, .75); color: inherit; font: inherit; font-weight: 700; cursor: pointer; }
  .gh.folded.game.gx { grid-template-columns: minmax(0, 1fr); }
  .gh .gx-nav { max-height: 1800px; transition: max-height .45s ease, opacity .3s ease, padding .45s ease, border-width .45s ease; }
  .gh.folded .gx-nav { max-height: 0; padding-top: 0; padding-bottom: 0; border-width: 0; transform: none; }
}
@media (prefers-reduced-motion: reduce) { .gh.game.gx, .gh .gx-nav { transition: none; } }
.gh .game-title { flex: 1; min-width: 0; }
.gh .gh-groups { display: grid; gap: 6px; align-content: start; min-height: 0; overflow-y: auto; padding-right: 2px; }
.gh .gh-grp { border-radius: 16px; background: rgba(255, 255, 255, .6); }
.gh .gh-grp.on { background: linear-gradient(90deg, #f7d9f0, #e6e4ff); }
.gh .gh-gbtn { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; cursor: pointer; font-weight: 700; font-size: 13px; }
.gh .gh-gbtn span { flex: 1; }
.gh .gh-gbtn .gi-img, .gh .gh-glist .gi-img { width: 22px; height: 22px; object-fit: contain; }
/* раскрытие групп плавно: высота 0fr → 1fr */
.gh .gh-fold { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows .35s cubic-bezier(.4, 0, .2, 1), opacity .25s ease; }
.gh .gh-fold.open { grid-template-rows: 1fr; opacity: 1; }
.gh .gh-fold > .gh-in { min-height: 0; overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .gh .gh-fold { transition: none; } }
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
/* каталог (дизайн 2026-11-25): шапка, быстрый старт, семь цветных разделов; значки наши */
body.gh-cat .stm { display: none; }
.gh .gh-top { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
.gh .gh-top .gh-h { flex: 1 1 auto; margin: 0; }
.gh .gh-search { flex: 0 1 300px; min-width: 200px; }
.gh .gh-timer { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 16px 0 6px; border-radius: 999px; border: 0; background: #fff; color: #2A2340; font: inherit; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 10px rgba(124, 92, 255, .12); }
.gh .gh-timer small { font-size: 14px; font-weight: 600; color: #6E6585; }
.gh .gh-timer.on { background: linear-gradient(100deg, #f8b9e9, #9de4ff); }
.gh .gh-quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(196px, 1fr)); gap: 10px; margin-top: 16px; }
.gh .gh-q { display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 10px; border-radius: 18px; background: #fff; color: #2A2340; text-decoration: none; box-shadow: 0 2px 10px rgba(124, 92, 255, .10); transition: transform .15s ease, box-shadow .15s ease; }
.gh .gh-q:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(124, 92, 255, .18); }
.gh .gh-qi { display: grid; place-items: center; width: 40px; height: 40px; flex: none; border-radius: 12px; }
.gh .gh-qi .gi-img { width: 26px; height: 26px; object-fit: contain; }
.gh .gh-qt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.gh .gh-qt b { font-size: 15px; font-weight: 800; }
.gh .gh-qt small { font-size: 12px; font-weight: 600; color: #6E6585; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* независимые колонки: свёрнутый раздел не оставляет дыру в строке и не двигает соседей */
.gh .gh-secs { display: flex; align-items: flex-start; gap: 10px; margin-top: 14px; }
.gh .gh-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.gh .gh-sec { display: flex; flex-direction: column; padding: 6px; border-radius: 20px; box-shadow: 0 2px 12px rgba(124, 92, 255, .08); }
.gh .gh-sh { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; color: #2A2340; cursor: pointer; border-radius: 14px; }
.gh .gh-sh:focus-visible { outline: 2px solid #7C5CFF; outline-offset: -2px; }
.gh .gh-sh em { font-style: normal; font-size: 12px; font-weight: 700; color: #6E6585; }
/* стрелка нарисована рамкой, а не символом ⌄: символ стоял ниже центра */
.gh .gh-chev { flex: none; width: 12px; height: 16px; display: grid; place-items: center; font-style: normal; transition: transform .3s ease; transform: rotate(-90deg); }
.gh .gh-chev::after { content: ''; width: 7px; height: 7px; margin-top: -3px; border: solid #6E6585; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.gh .gh-chev.open { transform: none; }
.gh .gh-sec .gh-fold.open { padding-top: 2px; }
@media (prefers-reduced-motion: reduce) { .gh .gh-chev { transition: none; } }
.gh .gh-si { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border-radius: 11px; }
.gh .gh-si .gi-img { width: 24px; height: 24px; object-fit: contain; }
.gh .gh-sh h3 { flex: 1; min-width: 0; margin: 0; font-size: 15.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gh .gh-sh .ko { font-size: 14px; color: #6E6585; }
.gh .gh-rows { display: flex; flex-direction: column; gap: 6px; padding-bottom: 2px; }
.gh .gh-row { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 10px; border-radius: 12px; background: rgba(255, 255, 255, .5); color: #2A2340; text-decoration: none; transition: background .12s ease; }
.gh .gh-row:hover, .gh .gh-row:focus-visible { background: rgba(255, 255, 255, .88); outline: none; }
.gh .gh-row .gi-img { width: 26px; height: 26px; object-fit: contain; flex: none; }
.gh .gh-row span { flex: 1; min-width: 0; font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gh .gh-row > .ui-play { opacity: 0; transition: opacity .12s; }
.gh .gh-row:hover > .ui-play, .gh .gh-row:focus-visible > .ui-play { opacity: 1; }
@media (hover: none) { .gh .gh-row > .ui-play { opacity: 1; } }
.gh .gh-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; padding: 8px 10px 18px; }
.gh .gh-mix .gh-cards { grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
.gh .gh-mix .gh-card small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gh .gh-card { display: flex; align-items: center; gap: 10px; padding: 12px; background: #fff; border: 1px solid #efeafd; border-radius: 16px; color: var(--ink); text-decoration: none; transition: .2s; }
.gh .gh-card:hover { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(100, 87, 170, .2); }
.gh .gh-card .gi-img { width: 38px; height: 38px; object-fit: contain; flex: none; }
.gh .gh-card span { flex: 1; min-width: 0; display: grid; gap: 2px; }
.gh .gh-card b { font-size: 14px; line-height: 1.2; }
.gh .gh-card small { font-size: 11px; color: var(--muted); line-height: 1.3; }
.gh .gh-card i { font-style: normal; font-size: 11px; color: #fff; background: #7863ff; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; flex: none; }
.gh .gh-empty { margin: 18px 4px; color: var(--muted); }
@media (max-width: 1100px) { .gh .gh-sit { display: none; } }
/* поиск (sw-btn) и кнопки шапки (gx-tools) стоят в одну линию: сначала поиск, справа за ним кнопки */
body.on-game-home .study.sky .sw-btn { top: 52px; right: 236px; }
@media (max-width: 860px) { body.on-game-home .study.sky .sw-btn { top: auto; right: auto; } }
.gh .gh-back { display: flex; align-items: center; gap: 14px; margin: 10px clamp(0px, 1.4vw, 6px) 0; }
.gh .gh-back .gx-tools { margin-left: auto; flex: none; }
.gh :is(.gh-backlink, .gh-name) { padding: 8px 16px; font-size: 13px; font-weight: 700; color: var(--ink); text-decoration: none; background: rgba(255, 255, 255, .9); border: 1px solid #fff; border-radius: 99px; box-shadow: 0 6px 18px rgba(100, 87, 170, .16); }
.gh .gh-backlink:hover { color: var(--pink); }
.gh .gh-tool { margin-top: 10px; }
/* узкий экран: шапка переносится на вторую строку и кнопки мельче, иначе страница уезжает вправо */
@media (max-width: 560px) {
  .gh .gh-back { flex-wrap: wrap; gap: 8px 10px; }
  .gh .game-top.gx-top { flex-wrap: wrap; }
  .gh.game .gx-tools { gap: 6px; }
  .gh.game .gx-round { width: 40px; height: 40px; font-size: 16px; }
  .gh :is(.gh-backlink, .gh-name) { padding: 6px 12px; font-size: 12px; }
}
</style>
