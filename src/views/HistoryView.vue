<script setup lang="ts">
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import { HISTORY, HISTORY_STATS } from '@/data/history'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const when = (d: string) => fmt.format(new Date(d + 'T12:00:00'))
</script>

<template>
  <main class="hist">
    <header class="top">
      <RouterLink to="/" class="brand"><span class="mark">✳</span><span class="name ko">우리말</span><span class="sub">история изменений</span></RouterLink>
      <nav class="nav">
        <RouterLink to="/about">О платформе</RouterLink>
        <RouterLink to="/korean/home" class="enter">{{ progress.unlocked ? 'Платформа →' : 'Войти →' }}</RouterLink>
      </nav>
    </header>

    <section class="intro">
      <div class="kicker">как росла платформа</div>
      <h1>История изменений</h1>
      <p>Что и когда добавляли: от первой версии на Vue до защиты, поиска и автоматических проверок. {{ HISTORY_STATS.stages }} этапов, {{ HISTORY_STATS.items }} изменений. Новое сверху.</p>
    </section>

    <ol class="line">
      <li v-for="(e, i) in HISTORY" :key="e.date + e.title" class="stage">
        <span class="dot" :class="{ now: i === 0 }"></span>
        <article class="card">
          <time :datetime="e.date">{{ when(e.date) }}</time>
          <h2>{{ e.title }}</h2>
          <p class="sum">{{ e.summary }}</p>
          <ul>
            <li v-for="it in e.items" :key="it">{{ it }}</li>
          </ul>
        </article>
      </li>
    </ol>
  </main>
</template>

<style scoped>
.hist { --ink: #1e2350; --soft: #8b8fc4; --line: rgba(120, 110, 200, .16); --accent: #d64da9; --accent2: #6a5cd0;
  position: fixed; inset: 0; overflow: auto; padding: clamp(24px, 4vh, 44px) clamp(20px, 4vw, 64px) 64px;
  color: var(--ink); background: #fbf8ff; font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all; }
.hist::before { content: ""; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 92% 4%, rgba(201, 228, 255, .55) 0, transparent 30%), radial-gradient(circle at 4% 96%, rgba(255, 209, 236, .5) 0, transparent 28%); }
.hist > * { position: relative; max-width: 860px; width: 100%; margin-left: auto; margin-right: auto; }
.hist a { color: inherit; text-decoration: none; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }

.top { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 12px; }
.brand .mark { font-size: 26px; color: var(--accent2); line-height: 1; }
.brand .name { font-size: 18px; letter-spacing: 3px; font-weight: 700; }
.brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--soft); text-transform: uppercase; }
.nav { display: flex; align-items: center; gap: 22px; font-size: 12.5px; color: var(--soft); }
.nav a { transition: .2s; }
.nav a:hover { color: var(--ink); }
.nav .enter { padding: 9px 18px; border: 1px solid var(--ink); border-radius: 22px; color: var(--ink); font-weight: 600; font-size: 12px; }
.nav .enter:hover { background: var(--ink); color: #fff; }

.intro { padding: 36px 0 10px; }
.kicker { display: flex; align-items: center; gap: 10px; font-size: 10.5px; letter-spacing: 2px; text-transform: uppercase; color: var(--soft); }
.kicker::before { content: ""; width: 24px; height: 1px; background: var(--accent); }
.intro h1 { margin: 14px 0 12px; font-size: clamp(34px, 5vw, 56px); line-height: 1; letter-spacing: -.035em; font-weight: 800; }
.intro p { margin: 0; max-width: 560px; line-height: 1.7; font-size: 15px; color: #6c70a8; }

.line { list-style: none; margin: 26px auto 0; padding: 0 0 0 26px; border-left: 2px solid rgba(143, 124, 240, .3); }
.stage { position: relative; padding-bottom: 22px; }
.dot { position: absolute; left: -35px; top: 22px; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid #8f7cf0; }
.dot.now { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 5px rgba(214, 77, 169, .18); }
.card { padding: 22px 24px; background: rgba(255, 255, 255, .8); border: 1px solid #fff; border-radius: 22px; box-shadow: 0 18px 45px rgba(100, 87, 170, .12); }
.card time { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--accent); font-weight: 600; }
.card h2 { margin: 6px 0 4px; font-size: 21px; letter-spacing: -.01em; }
.sum { margin: 0 0 10px; font-size: 14px; color: #6c70a8; }
.card ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; line-height: 1.6; }
.card li::marker { color: #b7a8ee; }

@media (max-width: 600px) { .line { padding-left: 18px; } .dot { left: -27px; } .card { padding: 18px; } .top .brand .sub { display: none; } }
</style>
