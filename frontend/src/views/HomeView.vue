<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import PinkShell from '@/components/site/PinkShell.vue'
import HomeGuideDrawer from '@/components/home/HomeGuideDrawer.vue'
import { D } from '@/data/korean/words'
import { RULES_COUNT } from '@/data/korean/grammar'
import { installApp, isInstalled } from '@/lib/pwa'
import { useToastStore } from '@/stores/toast'
import { HOME_LINKS, HOME_MORE, useHome, useHomePicks } from '@/composables/useHome'
import { withSeed } from '@/lib/seeded'

const { progress, days, daysWord, hello, due, dueText } = useHome()
/** Без входа в меню главной только «Большой словарь»; остальные ссылки (Словарь, Грамматика, Памятка, Чтение) видны вошедшим. */
const homeLinks = computed(() => (progress.unlocked ? HOME_LINKS : HOME_LINKS.filter(l => l.to === '/dict')))
const { seed, rule: HOME_RULE, phrase: HOME_PHRASE } = useHomePicks()
const guide = ref(false)
/**
 * Кнопка видео-обзора скрыта по просьбе владельца (2026-11-14): вместо неё ссылка на «О платформе». Окно и видео оставлены:
 * чтобы вернуть кнопку, поставь `SHOW_DEMO = true`.
 */
const SHOW_DEMO = false
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
/** Видео-обзор открывается только по ссылке «посмотреть видео-демонстрацию»: само при заходе не показывается (решение владельца, 2026-11-09). */
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
const toast = useToastStore()
/** Сайт открыт как установленное приложение: узнаём только в браузере, после оживления страницы. */
const installed = ref(false)
onMounted(() => (installed.value = isInstalled()))
/** Окно установки браузера; если браузер его не даёт (Safari, iPhone), подсказываем, где искать. */
async function install() {
  if (await installApp()) toast.ok('Приложение установлено')
  else if (!isInstalled()) toast.ok('Chrome и Edge: значок установки в адресной строке. Safari на Mac: «Файл → Добавить в Dock». iPhone: «Поделиться → На экран „Домой“».')
}

/** Слово дня: другое после каждой перезагрузки страницы (от того же зерна, что и фраза: одинаково на сервере и в браузере). */
const word = withSeed(seed + ':word', () => D[Math.floor(Math.random() * D.length)]!)
/** Карточка слова переворачивается по нажатию: видно перевод. */
const flipped = ref(false)
const wordLink = computed(() => (word.k ? { path: '/korean/words', query: { q: word.k } } : '/korean/words'))
</script>

<template>
  <PinkShell>
    <main class="home">
      <div class="pk-kick">личное пространство · с 1 июня</div>
      <h1 class="title">Тихое пространство для <span class="it">корейского</span></h1>
      <p class="pk-lead desc">
        Слова, грамматика, справочник и игры в одном мягком кабинете.
        Маленькие шаги каждый день приводят к большой уверенности. ♡
      </p>

      <div class="actions">
        <RouterLink to="/korean/home" class="pk-btn">Продолжить
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </RouterLink>
        <button type="button" class="pk-ghost" aria-haspopup="dialog" @click="guide = true">Что здесь есть</button>
        <RouterLink to="/korean/cabinet" class="pk-ghost"><Icon v-if="hello.locked" name="lock" /> {{ hello.title }}</RouterLink>
        <button v-if="!installed" type="button" class="pk-ghost" @click="install">Скачать приложение</button>
        <button v-if="SHOW_DEMO" type="button" class="pk-ghost" aria-haspopup="dialog" @click="demo = true">▶ Видео-демонстрация</button>
      </div>

      <RouterLink v-if="due" to="/korean/review" class="due"><span class="due-dot"></span>Пора повторить {{ dueText }} →</RouterLink>

      <div class="more">
        <RouterLink to="/about" class="link">О платформе</RouterLink>
        <RouterLink to="/growth" class="link">Рост платформы</RouterLink>
        <RouterLink v-for="l in homeLinks" :key="l.to" :to="l.to" class="link">{{ l.title }}</RouterLink>
        <RouterLink v-for="m in HOME_MORE" :key="m.to" :to="m.to" class="link">
          {{ m.title }}<span v-if="!progress.unlocked" class="lock"><Icon name="lock" /></span>
        </RouterLink>
      </div>
    </main>

    <div class="bottom">
      <dl class="facts">
        <dt>Слов</dt><dd><span v-count="D.length">{{ D.length }}</span></dd>
        <dt>Правил</dt><dd><span v-count="RULES_COUNT">{{ RULES_COUNT }}</span></dd>
        <dt>В пути</dt><dd>{{ days }} {{ daysWord }}</dd>
        <dt>Вопросы</dt><dd><a href="https://t.me/meeymirita" target="_blank" rel="noopener">@meeymirita</a></dd>
      </dl>
      <dl class="daily">
        <dt>Фраза дня</dt>
        <dd><span class="ko">{{ HOME_PHRASE.ko }}</span> — {{ HOME_PHRASE.ru }}</dd>
        <dt>Слово дня</dt>
        <dd>
          <button type="button" class="flip" :aria-pressed="flipped" aria-label="Слово дня: нажми, чтобы увидеть перевод" @click="flipped = !flipped">
            <span class="ko">{{ word.k }}</span> — {{ flipped ? word.t : word.r }}
          </button>
          <RouterLink :to="wordLink" class="more-w">в словарь →</RouterLink>
        </dd>
        <dt>{{ HOME_RULE.label }}</dt>
        <dd><RouterLink :to="HOME_RULE.to" class="ko">{{ HOME_RULE.rule }}</RouterLink></dd>
      </dl>
    </div>
    <p class="foot-note">* Отображается только пройденный материал автором, новое появляется по мере изучения.</p>

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
  </PinkShell>
</template>

<style scoped>
.home { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; padding: clamp(40px, 7vw, 96px) 0 32px; text-align: center; }
.title { margin: 0; max-width: 13ch; font-weight: 500; font-size: clamp(44px, 7.6vw, 118px); line-height: .98; letter-spacing: -.035em; text-wrap: balance; }
.title .it { color: var(--pk-pink-2); font-style: italic; }
.desc { margin: 0; max-width: 620px; }
.actions { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: clamp(20px, 4vw, 56px); }
.lock { margin-left: 5px; font-size: 11px; }
.due { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; background: rgba(255, 255, 255, .1); border: 1px solid var(--pk-line); color: #fff; font: 500 13px/1 var(--pk-mono); transition: background .2s; }
.due:hover { background: rgba(255, 255, 255, .18); }
.due-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pk-pink); }
.more { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 24px; }
.more .link { font: 400 13px/1 var(--pk-mono); color: var(--pk-label); padding-bottom: 3px; border-bottom: 1px solid var(--pk-line); transition: color .2s, border-color .2s; }
.more .link:hover { color: #fff; border-color: #fff; }

.bottom { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 32px; max-width: 1220px; width: 100%; margin: 0 auto; }
.facts, .daily { margin: 0; display: grid; grid-template-columns: auto auto; column-gap: 24px; row-gap: 14px; font: 400 14px/1.5 var(--pk-mono); }
.daily { text-align: right; align-items: baseline; }
dt { color: var(--pk-label); }
dd { margin: 0; color: #fff; }
dd a:hover, .flip:hover { color: var(--pk-pink-2); }
.flip { all: unset; cursor: pointer; transition: color .2s; }
.flip:focus-visible { outline: 2px solid var(--pk-pink-2); outline-offset: 3px; }
.more-w { margin-left: 10px; color: var(--pk-label); font-size: 12px; }
.foot-note { max-width: 1220px; width: 100%; margin: 18px auto 0; font: 400 12px/1.5 var(--pk-mono); color: rgba(255, 179, 209, .7); }
@media (max-width: 640px) { .daily { text-align: left; } .actions { flex-direction: column; } .pk-btn, .pk-ghost { width: 100%; justify-content: center; } }
</style>

<style>
/* окно с видео вынесено в body, поэтому стили без scoped */
.demo-back { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px; background: rgba(11, 5, 8, .75); backdrop-filter: blur(8px); }
.demo-box { position: relative; width: min(1100px, 100%); padding: 14px; background: #2a0a18; border: 1px solid rgba(255, 190, 220, .18); border-radius: 24px; box-shadow: 0 30px 80px rgba(0, 0, 0, .6); }
.demo-video { display: block; width: 100%; max-height: 74vh; background: #0b0508; border-radius: 14px; }
.demo-cap { margin: 10px 4px 2px; font-size: 13px; line-height: 1.5; color: #ffb3d1; }
.demo-x { position: absolute; top: -14px; right: -14px; width: 36px; height: 36px; font: inherit; color: #2a0a18; background: #fff; border: 0; border-radius: 50%; cursor: pointer; }
</style>
