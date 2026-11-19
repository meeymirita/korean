<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import PinkShell from '@/components/site/PinkShell.vue'
import AccessRequest from '@/components/home/AccessRequest.vue'
import '@/assets/home/fonts.css'
import { ABOUT_SLIDES } from '@/data/about'
import { GAMES, PAGES } from '@/data/guide'
import { shotUrl } from '@/lib/aboutShots'
import { useProgressStore } from '@/stores/progress'

/**
 * «О платформе»: широкая страница, по строке на каждую страницу сайта (крупный скриншот и описание, строки чередуются слева и справа)
 * и сетка всех игр. Скриншоты те же, что в окне «Что здесь есть» на главной (`lib/aboutShots.ts`, `scripts/about-shots.mjs`).
 */
const progress = useProgressStore()
/** Закрытая страница без токена: вместо перехода окно «Запросить доступ» с Telegram автора. */
type Link = { to: string; title: string; private?: boolean }
const ask = ref<Link | null>(null)
const locked = (c: Link) => !!c.private && !progress.unlocked
const target = (c: Link) => ({ is: locked(c) ? 'button' : RouterLink, to: locked(c) ? undefined : c.to, type: locked(c) ? 'button' : undefined })
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
</script>

<template>
  <PinkShell sub="о платформе">
  <main class="about">
    <section class="hero">
      <div class="pk-kick kicker">О платформе</div>
      <h1>Корейский с нуля, <span>всё в одном месте</span></h1>
      <p class="pk-lead lead">
        우리말 это личный учебник корейского: словарь, грамматика, справочник, тренажёры и игра «Хлебушек», заметки и календарь занятий, музыка для учёбы.
        Ниже каждая страница платформы с живым скриншотом и описанием, а в конце все игры.
      </p>
      <div class="facts">
        <span><b>{{ ABOUT_SLIDES.length }}</b> страниц в обзоре</span>
        <span><b>{{ PAGES.length }}</b> разделов</span>
        <span><b>{{ GAMES.length }}</b> игр и режимов</span>
      </div>
      <nav class="jump" aria-label="Страницы обзора">
        <button v-for="s in ABOUT_SLIDES" :key="s.id" type="button" @click="jump(s.id)">{{ s.title }}</button>
        <button type="button" class="games-jump" @click="jump('games')">Игры</button>
      </nav>
    </section>

    <section v-for="(s, n) in ABOUT_SLIDES" :id="s.id" :key="s.id" class="row" :class="{ flip: n % 2 === 1 }">
      <component :is="target(s).is" :to="target(s).to" :type="target(s).type" class="shot" :aria-label="`Открыть: ${s.title}`" @click="locked(s) && (ask = s)">
        <img :src="shotUrl(s.to)" :alt="`Страница «${s.title}»`" loading="lazy" decoding="async" />
      </component>
      <div class="info">
        <div class="no">{{ String(n + 1).padStart(2, '0') }} / {{ ABOUT_SLIDES.length }}</div>
        <h2>{{ s.title }}</h2>
        <p>{{ s.text }}</p>
        <p v-if="s.private && !progress.unlocked" class="lock"><Icon name="lock" /> Откроется после входа по токену</p>
        <component :is="target(s).is" :to="target(s).to" :type="target(s).type" class="open" @click="locked(s) && (ask = s)">Открыть страницу →</component>
      </div>
    </section>

    <section id="games" class="games">
      <div class="pk-kick kicker">Игры и тренажёры</div>
      <h2>{{ GAMES.length }} режимов игры на слова</h2>
      <p class="pk-lead lead">Каждая игра берёт слова и правила только из пройденного. Нажми на карточку, чтобы открыть режим.</p>
      <div class="grid">
        <component :is="target(g).is" v-for="g in GAMES" :key="g.title" :to="target(g).to" :type="target(g).type" class="card" @click="locked(g) && (ask = g)">
          <span class="ph"><img v-if="shotUrl(g.to)" :src="shotUrl(g.to)" :alt="`Игра «${g.title}»`" loading="lazy" decoding="async" /></span>
          <b>{{ g.title }}</b>
          <span class="tx">{{ g.text }}</span>
        </component>
      </div>
    </section>

    <AccessRequest :open="!!ask" :title="ask?.title" @close="ask = null" />

    <footer class="foot">
      <RouterLink to="/korean/home" class="open">{{ progress.unlocked ? 'Перейти на платформу →' : 'Войти по токену →' }}</RouterLink>
      <RouterLink to="/history" class="hl">История изменений</RouterLink>
    </footer>
  </main>
  </PinkShell>
</template>

<style scoped>
.about { width: 100%; max-width: 1220px; margin: 0 auto; display: flex; flex-direction: column; gap: clamp(48px, 8vh, 104px); padding: clamp(32px, 6vw, 80px) 0 24px; }
:where(.about) button { font: inherit; cursor: pointer; border: 0; color: inherit; background: none; text-align: left; }

.hero { display: flex; flex-direction: column; gap: 22px; }
.hero h1 { margin: 0; max-width: 14ch; font-weight: 500; font-size: clamp(40px, 6.4vw, 96px); line-height: .98; letter-spacing: -.035em; text-wrap: balance; }
.hero h1 span { color: var(--pk-pink-2); font-style: italic; }
.lead { margin: 0; max-width: 720px; }
.facts { display: flex; flex-wrap: wrap; gap: 14px 40px; font: 400 14px/1.4 var(--pk-mono); color: var(--pk-label); }
.facts b { margin-right: 8px; font: 500 34px/1 var(--pk-head); letter-spacing: -.02em; color: #fff; }
.jump { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.jump button { padding: 10px 18px; font-size: 14px; font-weight: 600; color: #fff; background: var(--pk-panel); border: 1px solid var(--pk-line); border-radius: 999px; transition: background .2s, color .2s; }
.jump button:hover { background: rgba(255, 255, 255, .16); }
.jump .games-jump { color: var(--pk-plum); background: #fff; border-color: #fff; }
.jump .games-jump:hover { background: var(--pk-soft); }

.row { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr); gap: clamp(28px, 5vw, 80px); align-items: center; scroll-margin-top: 100px; }
.row.flip { grid-template-columns: minmax(300px, 1fr) minmax(0, 1.55fr); }
.row.flip .shot { order: 2; }
.shot { display: block; overflow: hidden; border: 1px solid var(--pk-line); border-radius: 24px; background: var(--pk-glass); box-shadow: 0 40px 90px -36px rgba(0, 0, 0, .7); aspect-ratio: 16 / 10; transition: transform .35s, border-color .35s; }
button.shot { padding: 0; width: 100%; }
.shot:hover { transform: translateY(-4px); border-color: rgba(255, 190, 220, .5); }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.info { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.no { font: 400 12px/1 var(--pk-mono); letter-spacing: .16em; color: var(--pk-label); }
.info h2 { margin: 0; font-weight: 500; font-size: clamp(32px, 3.8vw, 56px); line-height: 1.04; letter-spacing: -.03em; }
.info p { margin: 0; max-width: 560px; font: 400 14px/1.75 var(--pk-mono); color: var(--pk-soft); }
.info .lock { font-size: 13px; color: var(--pk-label); }
.open { display: inline-flex; align-items: center; height: 52px; margin-top: 8px; padding: 0 24px; border: 0; border-radius: 16px; background: #fff; color: var(--pk-plum) !important; font: 600 16px/1 var(--pk-head); cursor: pointer; transition: background .2s; }
.open:hover { background: var(--pk-soft); }

.games { display: flex; flex-direction: column; gap: 16px; scroll-margin-top: 100px; }
.games h2 { margin: 0; font-weight: 500; font-size: clamp(32px, 3.8vw, 56px); line-height: 1.04; letter-spacing: -.03em; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 20px; margin-top: 12px; }
.card { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px 20px; background: var(--pk-glass); border: 1px solid var(--pk-line); border-radius: 24px; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); transition: transform .2s, border-color .2s; }
.card:hover { transform: translateY(-4px); border-color: rgba(255, 190, 220, .5); }
.ph { display: block; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 16px; background: linear-gradient(135deg, #5a1537, #2a0a18); }
.ph img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform .35s; }
.card:hover .ph img { transform: scale(1.04); }
.card b { padding: 8px 8px 0; font-size: 19px; font-weight: 600; line-height: 1.2; }
.card:hover b { color: var(--pk-pink-2); }
.tx { padding: 0 8px; font: 400 12.5px/1.65 var(--pk-mono); color: var(--pk-soft); }

.foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; padding-top: 28px; border-top: 1px solid var(--pk-line); }
.hl { font: 400 13px/1 var(--pk-mono); color: var(--pk-label); }
.hl:hover { color: #fff; }

@media (max-width: 960px) {
  .row, .row.flip { grid-template-columns: 1fr; }
  .row.flip .shot { order: 0; }
}
@media (prefers-reduced-motion: reduce) { .shot, .card, .ph img { transition: none; } }
</style>
