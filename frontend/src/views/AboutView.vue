<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
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
  <main class="about">
    <header class="top">
      <RouterLink to="/" class="brand"><span class="mark">✳︎</span><span class="name ko">우리말</span><span class="sub">о платформе</span></RouterLink>
      <RouterLink to="/history" class="hl">История изменений</RouterLink>
      <RouterLink to="/korean/home" class="enter">{{ progress.unlocked ? 'Платформа →' : 'Войти →' }}</RouterLink>
    </header>

    <section class="hero">
      <div class="kicker">О платформе</div>
      <h1>Корейский с нуля, <span>всё в одном месте</span></h1>
      <p class="lead">
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
      <div class="kicker">Игры и тренажёры</div>
      <h2>{{ GAMES.length }} режимов игры на слова</h2>
      <p class="lead">Каждая игра берёт слова и правила только из пройденного. Нажми на карточку, чтобы открыть режим.</p>
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
</template>

<style scoped>
.about { --ink: #1e2350; --soft: #8b8fc4; --line: rgba(120, 110, 200, .16); --accent: #d64da9; --accent2: #6a5cd0;
  position: fixed; inset: 0; overflow: auto; display: flex; flex-direction: column; gap: clamp(40px, 7vh, 88px); padding: clamp(22px, 3vh, 38px) clamp(18px, 4vw, 72px) 72px;
  color: var(--ink); background: #fbf8ff; font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all; scroll-behavior: smooth; }
.about::before { content: ""; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 92% 4%, rgba(201, 228, 255, .55) 0, transparent 30%), radial-gradient(circle at 4% 96%, rgba(255, 209, 236, .5) 0, transparent 28%); }
.about > * { position: relative; max-width: 1560px; width: 100%; margin: 0 auto; }
.about a { color: inherit; text-decoration: none; }
/* сброс стилей кнопок с нулевой специфичностью (:where): иначе он перебивал фон у кнопок .open, .card и .shot (у закрытых страниц это кнопки, а не ссылки) */
:where(.about) button { font: inherit; cursor: pointer; border: 0; color: inherit; background: none; text-align: left; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }

.top { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 12px; }
.brand .mark { font-size: 26px; color: var(--accent2); line-height: 1; }
.brand .name { font-size: 18px; letter-spacing: 3px; font-weight: 700; }
.brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--soft); text-transform: uppercase; }
.hl { margin-left: auto; margin-right: 22px; font-size: 13px; color: var(--soft); transition: .2s; }
.hl:hover { color: var(--ink); }
.enter { padding: 10px 20px; border: 1px solid var(--ink); border-radius: 22px; font-weight: 600; font-size: 13px; transition: .22s; }
.enter:hover { background: var(--ink); color: #fff; }

.kicker { display: flex; align-items: center; gap: 12px; font-size: 12px; letter-spacing: 2.4px; text-transform: uppercase; color: var(--soft); }
.kicker::before { content: ""; width: 32px; height: 1px; background: var(--accent); }

.hero { display: flex; flex-direction: column; gap: 20px; padding-top: clamp(8px, 3vh, 32px); }
.hero h1 { margin: 0; max-width: 1100px; font-size: clamp(40px, 6.4vw, 92px); line-height: 1.02; letter-spacing: -.035em; font-weight: 800; }
.hero h1 span { color: var(--accent); }
.lead { margin: 0; max-width: 860px; font-size: clamp(16px, 1.5vw, 20px); line-height: 1.7; color: #6c70a8; }
.facts { display: flex; flex-wrap: wrap; gap: 14px 38px; font-size: 15px; color: #6c70a8; }
.facts b { margin-right: 6px; font-size: 34px; font-weight: 800; letter-spacing: -.02em; color: var(--ink); }
.jump { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
.jump button { padding: 9px 18px; font-size: 13.5px; font-weight: 600; color: #6c70a8; background: rgba(255, 255, 255, .85); border: 1px solid #fff; border-radius: 99px; box-shadow: 0 4px 12px rgba(100, 87, 170, .08); transition: .2s; }
.jump button:hover { color: var(--accent); transform: translateY(-1px); }
.jump .games-jump { color: #fff; background: linear-gradient(100deg, #e86bc0, #d64da9); }
.jump .games-jump:hover { color: #fff; filter: brightness(1.06); }

.row { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(300px, 1fr); gap: clamp(28px, 5vw, 88px); align-items: center; scroll-margin-top: 24px; }
.row.flip { grid-template-columns: minmax(300px, 1fr) minmax(0, 1.55fr); }
.row.flip .shot { order: 2; }
.shot { display: block; overflow: hidden; border: 1px solid #fff; border-radius: 26px; background: #fff; box-shadow: 0 40px 90px -36px rgba(80, 70, 160, .5); aspect-ratio: 16 / 10; transition: transform .35s, box-shadow .35s; }
button.shot { padding: 0; width: 100%; }
.shot:hover { transform: translateY(-4px); box-shadow: 0 50px 100px -34px rgba(80, 70, 160, .6); }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.info { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; }
.no { font-size: 12px; letter-spacing: 2.4px; color: var(--soft); }
.info h2 { margin: 0; font-size: clamp(32px, 3.8vw, 56px); line-height: 1.04; letter-spacing: -.03em; font-weight: 800; }
.info p { margin: 0; max-width: 620px; line-height: 1.75; font-size: clamp(16px, 1.25vw, 19px); color: #6c70a8; }
.info .lock { font-size: 14px; }
.open { display: inline-flex; margin-top: 8px; font: inherit; cursor: pointer; border: 0; padding: 15px 30px; border-radius: 3px; background: var(--ink); color: #fff !important; font-size: 14px; font-weight: 600; transition: .22s; }
.open:hover { background: var(--accent2); transform: translateY(-2px); }

.games { display: flex; flex-direction: column; gap: 16px; padding-top: 12px; scroll-margin-top: 24px; }
.games h2 { margin: 0; font-size: clamp(32px, 3.8vw, 56px); line-height: 1.04; letter-spacing: -.03em; font-weight: 800; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 22px; margin-top: 12px; }
.card { display: flex; flex-direction: column; gap: 8px; padding: 12px 12px 20px; background: rgba(255, 255, 255, .8); border: 1px solid #fff; border-radius: 22px; box-shadow: 0 10px 26px rgba(100, 87, 170, .1); transition: transform .2s, box-shadow .2s; }
.card:hover { transform: translateY(-4px); box-shadow: 0 18px 36px rgba(100, 87, 170, .22); }
.ph { display: block; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 16px; background: linear-gradient(135deg, #f3e4fa, #e1e5ff); }
.ph img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform .35s; }
.card:hover .ph img { transform: scale(1.04); }
.card b { padding: 8px 8px 0; font-size: 19px; font-weight: 700; line-height: 1.2; }
.card:hover b { color: var(--accent); }
.tx { padding: 0 8px; font-size: 14.5px; line-height: 1.55; color: #6c70a8; }

.foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; padding-top: 28px; border-top: 1px solid var(--line); }
.foot .hl { margin: 0; }

@media (max-width: 960px) {
  .row, .row.flip { grid-template-columns: 1fr; }
  .row.flip .shot { order: 0; }
}
@media (prefers-reduced-motion: reduce) { .about { scroll-behavior: auto; } .shot, .card, .ph img { transition: none; } }
</style>
