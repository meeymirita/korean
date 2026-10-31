<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import HomeGuideDrawer from '@/components/home/HomeGuideDrawer.vue'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { installApp, isInstalled } from '@/lib/pwa'
import { useToastStore } from '@/stores/toast'
import { HOME_LINKS, HOME_MORE, HOME_PHRASE, HOME_RULE, useHome } from '@/composables/useHome'

const { progress, days, daysWord, hello, due, dueText } = useHome()
const guide = ref(false)
/** Окно с видео-обзором платформы: видео грузится, только когда окно открыто. */
const demo = ref(false)
/** Файл лежит в public/: путь строкой, чтобы сборка не пыталась его подключать как модуль. */
const DEMO_SRC = '/demo.webm'
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') demo.value = false
}
const demoVideo = ref<HTMLVideoElement>()
/** Звук без нажатия браузеры не разрешают: если запуск со звуком отклонён, включаем без звука (звук включается значком в плеере). */
const mutedStart = ref(false)
watch(demo, open => {
  if (!open) return
  mutedStart.value = false
  void nextTick(async () => {
    const v = demoVideo.value
    if (!v) return
    try {
      await v.play()
    } catch {
      v.muted = true
      mutedStart.value = true
      void v.play().catch(() => undefined)
    }
  })
})
/** При заходе на главную видео открывается само, один раз за открытое окно браузера (после закрытия и обновления страницы не навязывается). */
const AUTO_KEY = 'demo_auto_shown'
function openOnArrival() {
  try {
    if (sessionStorage.getItem(AUTO_KEY)) return
    sessionStorage.setItem(AUTO_KEY, '1')
  } catch {
    /* без запоминания: откроем */
  }
  demo.value = true
}
onMounted(openOnArrival)
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
const toast = useToastStore()
const installed = isInstalled()
/** Окно установки браузера; если браузер его не даёт (Safari, iPhone), подсказываем, где искать. */
async function install() {
  if (await installApp()) toast.ok('Приложение установлено')
  else if (!isInstalled()) toast.ok('Chrome и Edge: значок установки в адресной строке. Safari на Mac: «Файл → Добавить в Dock». iPhone: «Поделиться → На экран „Домой“».')
}

/** Слово дня: другое после каждой перезагрузки страницы. */
const word = D[Math.floor(Math.random() * D.length)]!
/** Карточка слова переворачивается по нажатию: видно перевод. */
const flipped = ref(false)
const wordLink = computed(() => (word.k ? { path: '/korean/words', query: { q: word.k } } : '/korean/words'))
</script>

<template>
  <main class="home">
    <div class="frame"></div>

    <div class="stage">
      <header class="topbar">
        <div class="brand">
          <span class="mark">✳︎</span>
          <span class="name ko">우리말</span>
          <span class="sub">korean space</span>
        </div>
        <nav class="nav">
          <RouterLink to="/about">О платформе</RouterLink>
          <RouterLink to="/history" class="hide-sm">История изменений</RouterLink>
          <RouterLink v-for="l in HOME_LINKS" :key="l.to" :to="l.to" class="hide-sm">{{ l.title }}</RouterLink>
          <RouterLink to="/korean/home" class="enter">{{ progress.unlocked ? 'Платформа →' : 'Войти →' }}</RouterLink>
        </nav>
      </header>

      <aside class="rail">
        <span class="num">— {{ days }} {{ daysWord }}</span>
        <div class="dots"><span class="on"></span><span></span><span></span><span></span></div>
      </aside>

      <section class="center">
        <div class="kick-row">
          <div class="kicker">личное пространство · с 1 июня</div>
          <button type="button" class="demo-link" aria-haspopup="dialog" @click="demo = true">▶ посмотреть видео-демонстрацию</button>
        </div>

        <h1 class="title">
          <span class="line">Тихое</span>
          <span class="line">пространство</span>
          <span class="line">для <span class="it">корейского</span></span>
          <span class="line ko">한국어</span>
        </h1>

        <p class="desc">
          <b>Слова, грамматика, справочник и игры</b> в одном мягком кабинете.
          Маленькие шаги каждый день приводят к большой уверенности. ♡
        </p>

        <div class="actions">
          <RouterLink to="/korean/home" class="btn-main">Продолжить <span class="arrow">→</span></RouterLink>
          <button class="link" aria-haspopup="dialog" @click="guide = true">что здесь есть</button>
          <RouterLink to="/korean/cabinet" class="link">{{ hello.title }}</RouterLink>
          <button v-if="!installed" class="link" @click="install">скачать приложение</button>
        </div>

        <RouterLink v-if="due" to="/korean/review" class="due">
          <span class="due-dot"></span>Пора повторить {{ dueText }}<span class="arrow">→</span>
        </RouterLink>

        <div class="more">
          <RouterLink to="/history" class="link show-sm">История изменений</RouterLink>
          <RouterLink v-for="l in HOME_LINKS" :key="l.to" :to="l.to" class="link show-sm">{{ l.title }}</RouterLink>
          <RouterLink v-for="m in HOME_MORE" :key="m.to" :to="m.to" class="link">
            {{ m.title }}<span v-if="!progress.unlocked" class="lock">🔒</span>
          </RouterLink>
        </div>
      </section>

      <aside class="notes">
        <div class="note">
          <span class="lbl">✳︎ Фраза дня</span>
          <span class="val ko">{{ HOME_PHRASE.ko }}</span>
          <span class="hint">{{ HOME_PHRASE.ru }}</span>
        </div>

        <div class="note flip" :class="{ on: flipped }">
          <button type="button" class="flip-btn" :aria-pressed="flipped" aria-label="Слово дня: нажми, чтобы перевернуть карточку" @click="flipped = !flipped">
            <span class="face front">
              <span class="lbl">▤ Слово дня · нажми</span>
              <span class="val ko">{{ word.k }}</span>
              <span class="hint">{{ word.r }}</span>
            </span>
            <span class="face back">
              <span class="lbl">▤ Перевод</span>
              <span class="val">{{ word.t }}</span>
              <span class="hint">{{ word.r }}</span>
            </span>
          </button>
          <RouterLink :to="wordLink" class="flip-more">в словарь →</RouterLink>
        </div>

        <RouterLink :to="HOME_RULE.to" class="note">
          <span class="lbl">◉ {{ HOME_RULE.label }}</span>
          <span class="val ko">{{ HOME_RULE.rule }}</span>
          <span class="hint ko">{{ HOME_RULE.examples }}</span>
        </RouterLink>
      </aside>

      <footer class="footer">
        <div class="meta">
          <span><b>{{ D.length }}</b> слов</span>
          <span><b>{{ G.length }}</b> правил</span>
          <span>вопросы — <a href="https://t.me/meeymirita" target="_blank" rel="noopener">@meeymirita</a></span>
        </div>
        <p class="foot-note">* Отображается только пройденный материал автором, новое появляется по мере изучения.</p>
        <span class="seal"><i></i>made with 🌸 · <span class="ko">우리말</span></span>
      </footer>
    </div>

    <HomeGuideDrawer v-model="guide" />

    <Teleport to="body">
      <div v-if="demo" class="demo-back" @click.self="demo = false">
        <div class="demo-box" role="dialog" aria-modal="true" aria-label="Видео-демонстрация платформы">
          <button type="button" class="demo-x" aria-label="Закрыть" @click="demo = false">✕</button>
          <video ref="demoVideo" class="demo-video" :src="DEMO_SRC" controls autoplay playsinline preload="auto"></video>
          <p class="demo-cap">Обзор платформы: все страницы и вкладки (кабинет, «Сегодня», словарь, грамматика, справочник, тренажёры, игра), а в конце тёмная тема и скрытие бокового меню. Данные в видео демонстрационные, со звуком (музыка).<span v-if="mutedStart"> Браузер включил видео без звука: нажми на значок динамика в плеере.</span></p>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
.home { --ink: #1e2350; --soft: #8b8fc4; --line: rgba(120, 110, 200, .16); --accent: #d64da9; --accent2: #6a5cd0; --cream: #fbf8ff;
  position: fixed; inset: 0; overflow: auto; color: var(--ink); background: var(--cream); word-break: keep-all;
  font-family: 'Inter', 'Archivo', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.home::before { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(circle at 92% 4%, rgba(201, 228, 255, .55) 0, transparent 30%),
    radial-gradient(circle at 4% 96%, rgba(255, 209, 236, .5) 0, transparent 28%),
    radial-gradient(circle at 50% 50%, rgba(224, 212, 255, .35) 0, transparent 60%); }
.home :lang(ko), .home .ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }
.home a { color: inherit; text-decoration: none; }
.home button { font: inherit; cursor: pointer; border: 0; color: inherit; background: none; }

.frame { position: fixed; inset: 18px; border: 1px solid var(--line); border-radius: 24px; pointer-events: none; z-index: 1; }
.frame::before, .frame::after { content: "✦"; position: absolute; font-size: 11px; color: #c9bff0; }
.frame::before { top: -8px; left: 24px; background: var(--cream); padding: 0 6px; }
.frame::after { bottom: -8px; right: 24px; background: var(--cream); padding: 0 6px; }

.stage { position: relative; z-index: 2; min-height: 100%; max-width: 1280px; margin: 0 auto; display: grid;
  grid-template-columns: auto 1fr auto; grid-template-rows: auto 1fr auto;
  padding: clamp(28px, 4vh, 52px) clamp(28px, 4vw, 64px); gap: clamp(18px, 3vh, 36px); }

.topbar { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding-bottom: clamp(14px, 2vh, 22px); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 12px; }
.brand .mark { font-size: clamp(22px, 2vw, 28px); color: var(--accent2); line-height: 1; }
.brand .name { font-size: clamp(16px, 1.5vw, 19px); letter-spacing: 3px; font-weight: 700; }
.brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--soft); text-transform: uppercase; }
.nav { display: flex; align-items: center; gap: clamp(14px, 2vw, 28px); font-size: 12.5px; color: var(--soft); }
.nav a { position: relative; transition: .2s; }
.nav a:hover { color: var(--ink); }
.nav a { white-space: nowrap; }
.nav .enter { padding: 9px 18px; border: 1px solid var(--ink); border-radius: 22px; color: var(--ink); font-weight: 600; font-size: 12px; transition: .22s; }
.nav .enter:hover { background: var(--ink); color: #fff; }

.rail { display: flex; flex-direction: column; justify-content: center; gap: 18px; padding-right: clamp(20px, 3vw, 44px); border-right: 1px solid var(--line); }
.rail .num { font-size: 11px; letter-spacing: 2px; color: var(--soft); writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; }
.rail .dots { display: flex; flex-direction: column; gap: 8px; }
.rail .dots span { width: 6px; height: 6px; border-radius: 50%; background: #d9d3f0; }
.rail .dots span.on { background: var(--accent); }

.center { display: flex; flex-direction: column; justify-content: center; min-height: 0; padding-left: clamp(10px, 2vw, 30px); }
.kick-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 18px; margin-bottom: clamp(14px, 2.4vh, 22px); }
.kicker { display: flex; align-items: center; gap: 10px; font-size: 10.5px; letter-spacing: 2px; text-transform: uppercase; color: var(--soft); }
.home .demo-link { padding: 0 0 3px; font: inherit; font-size: 10.5px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); background: none; border: 0; border-bottom: 1px solid currentColor; cursor: pointer; transition: .2s; }
.home .demo-link:hover { color: var(--accent2); }
.kicker::before { content: ""; width: 24px; height: 1px; background: var(--accent); }
.title { font-size: clamp(40px, min(7.4vw, 10.5vh), 104px); line-height: .92; letter-spacing: -.035em; font-weight: 800; margin: 0 0 clamp(14px, 2.2vh, 28px); }
.title .line { display: block; overflow: hidden; }
.title .it { font-style: italic; font-weight: 400; color: var(--accent); }
.title .ko { font-weight: 800; color: transparent; -webkit-text-stroke: 1.3px #b7a8ee; letter-spacing: .02em; }
.desc { max-width: 440px; margin: 0; line-height: 1.7; font-size: clamp(13px, 1.2vw, 15px); color: var(--soft); }
.desc b { color: var(--ink); font-weight: 600; }
.actions { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; margin-top: clamp(24px, 3.4vh, 38px); }
.btn-main { padding: 14px 28px; border-radius: 2px; background: var(--ink); color: #fff !important; font-size: 13px; font-weight: 600; letter-spacing: .4px;
  transition: .22s; display: inline-flex; align-items: center; gap: 10px; }
.btn-main:hover { background: var(--accent2); transform: translateY(-2px); }
.btn-main .arrow { transition: .22s; }
.btn-main:hover .arrow { transform: translateX(4px); }
.home .link { font-size: 12px; color: var(--soft); border-bottom: 1px solid var(--line); padding-bottom: 3px; transition: .2s; }
.home .link:hover { color: var(--ink); border-color: var(--ink); }
.more { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 18px; }
.lock { margin-left: 5px; font-size: 10px; }
.show-sm { display: none; }

.notes { display: flex; flex-direction: column; justify-content: center; gap: clamp(18px, 3vh, 32px); padding-left: clamp(20px, 3vw, 44px);
  border-left: 1px solid var(--line); min-width: clamp(200px, 18vw, 260px); max-width: 280px; }
.note { display: grid; gap: 6px; padding-bottom: clamp(16px, 2.4vh, 22px); border-bottom: 1px solid var(--line); transition: .2s; }
.note:last-child { border-bottom: 0; padding-bottom: 0; }
a.note:hover .val { color: var(--accent); }
.note .lbl { font-size: 9.5px; letter-spacing: 1.8px; text-transform: uppercase; color: var(--soft); }
.note .val { font-size: clamp(17px, 1.6vw, 21px); font-weight: 700; letter-spacing: -.01em; line-height: 1.15; overflow-wrap: anywhere; transition: color .2s; }
.note .val.ko { font-weight: 800; color: var(--accent2); }
.note .hint { font-size: 11.5px; color: var(--soft); line-height: 1.5; }
.flip { perspective: 800px; }
.flip-btn { all: unset; display: grid; cursor: pointer; transform-style: preserve-3d; transition: transform .5s; }
.flip-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.flip.on .flip-btn { transform: rotateY(180deg); }
.flip .face { grid-area: 1 / 1; display: grid; gap: 6px; align-content: start; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.flip .back { transform: rotateY(180deg); }
.flip-more { font-size: 11.5px; color: var(--soft); justify-self: start; }
.flip-more:hover { color: var(--accent); }
.due { display: inline-flex; align-items: center; gap: 8px; margin-top: 16px; padding: 7px 14px; border-radius: 99px; background: rgba(255, 183, 206, .28);
  color: var(--ink); font-size: 12.5px; font-weight: 600; transition: .2s; }
.due:hover { background: rgba(255, 183, 206, .5); }
.due .arrow { transition: .2s; }
.due:hover .arrow { transform: translateX(3px); }
.due-dot { width: 8px; height: 8px; border-radius: 50%; background: #e86f95; }
@media (prefers-reduced-motion: reduce) { .flip-btn { transition: none; } }

.footer { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
  padding-top: clamp(14px, 2vh, 20px); border-top: 1px solid var(--line); font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--soft); }
.footer .meta { display: flex; gap: clamp(14px, 2vw, 28px); flex-wrap: wrap; }
.footer .foot-note { flex: 1 1 auto; margin: 0; text-align: center; white-space: nowrap; text-transform: none; letter-spacing: 0; font-size: 11.5px; }
.footer .meta b { color: var(--ink); font-weight: 600; }
.footer a { color: var(--accent2); text-transform: none; letter-spacing: 0; font-weight: 600; }
.footer a:hover { color: var(--accent); }
.footer .seal { display: inline-flex; align-items: center; gap: 8px; }
.footer .seal i { width: 8px; height: 8px; border-radius: 50%; background: #b6e7c9; box-shadow: 0 0 0 3px rgba(182, 231, 201, .3); display: inline-block; }

@media (max-width: 1024px) {
  .stage { grid-template-columns: 1fr; grid-template-rows: auto auto auto auto auto; }
  .rail, .notes { border: 0; padding: 0; max-width: none; }
  .rail { flex-direction: row; align-items: center; justify-content: flex-start; }
  .rail .num { writing-mode: horizontal-tb; transform: none; }
  .rail .dots { flex-direction: row; }
  .center { padding-left: 0; }
  .notes { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding-top: 20px; border-top: 1px solid var(--line); }
  .note { border-bottom: 0; padding-bottom: 0; }
}
@media (max-width: 1100px) { .footer .foot-note { white-space: normal; flex-basis: 100%; order: 3; } }
@media (max-width: 640px) {
  .hide-sm { display: none; }
  .brand .sub { display: none; }
  .nav { gap: 14px; }
  .show-sm { display: inline; }
  .frame { display: none; }
  .stage { padding: 24px; }
  .notes { grid-template-columns: 1fr; }
}
</style>

<style>
/* окно с видео вынесено в body, поэтому стили без scoped */
.demo-back { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px; background: rgba(32, 38, 92, .55); backdrop-filter: blur(8px); }
.demo-box { position: relative; width: min(1100px, 100%); padding: 14px; background: #fbf8ff; border: 1px solid #fff; border-radius: 22px; box-shadow: 0 30px 80px rgba(30, 36, 100, .4); }
.demo-video { display: block; width: 100%; max-height: 74vh; background: #1e2350; border-radius: 14px; }
.demo-cap { margin: 10px 4px 2px; font-size: 13px; line-height: 1.5; color: #6c70a8; }
.demo-note { margin-top: 4px; font-size: 12px; opacity: .85; }
.demo-x { position: absolute; top: -14px; right: -14px; width: 36px; height: 36px; font: inherit; color: #1e2350; background: #fff; border: 1px solid #e3def7; border-radius: 50%; box-shadow: 0 6px 18px rgba(30, 36, 100, .25); cursor: pointer; }
html[data-theme='dark'] .demo-box { background: #1b1d40; border-color: rgba(255, 255, 255, .12); }
html[data-theme='dark'] .demo-cap { color: #a9acd8; }
</style>
