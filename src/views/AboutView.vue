<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import { usePersisted } from '@/composables/usePersisted'
import { ABOUT_SLIDES } from '@/data/about'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const images = import.meta.glob('@/assets/about/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const src = (name: string) => Object.entries(images).find(([p]) => p.endsWith(`/${name}.webp`))?.[1] ?? ''

const i = usePersisted('about_slide', 0, v => Number.isInteger(v) && (v as number) >= 0 && (v as number) < ABOUT_SLIDES.length)
const slide = computed(() => ABOUT_SLIDES[i.value]!)
const go = (n: number) => (i.value = (n + ABOUT_SLIDES.length) % ABOUT_SLIDES.length)

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') go(i.value - 1)
  else if (e.key === 'ArrowRight') go(i.value + 1)
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <main class="about">
    <header class="top">
      <RouterLink to="/" class="brand"><span class="mark">✳︎</span><span class="name ko">우리말</span><span class="sub">о платформе</span></RouterLink>
      <RouterLink to="/history" class="hl">История изменений</RouterLink>
      <RouterLink to="/korean/home" class="enter">{{ progress.unlocked ? 'Платформа →' : 'Войти →' }}</RouterLink>
    </header>

    <section class="stage">
      <div class="shot">
        <img :key="slide.id" :src="src(slide.img)" :alt="`Страница «${slide.title}»`" />
        <button class="arrow prev" aria-label="Назад" @click="go(i - 1)">←</button>
        <button class="arrow next" aria-label="Дальше" @click="go(i + 1)">→</button>
      </div>

      <div class="info">
        <div class="kicker">{{ String(i + 1).padStart(2, '0') }} / {{ ABOUT_SLIDES.length }}</div>
        <h1 :key="slide.id + 't'">{{ slide.title }}</h1>
        <p :key="slide.id + 'p'">{{ slide.text }}</p>
        <p v-if="slide.private && !progress.unlocked" class="lock">🔒 Откроется после входа по токену</p>
        <RouterLink :to="slide.to" class="open">Открыть страницу →</RouterLink>
      </div>
    </section>

    <nav class="dots" aria-label="Страницы">
      <button v-for="(s, n) in ABOUT_SLIDES" :key="s.id" :class="{ on: n === i }" :aria-label="s.title" :title="s.title" @click="go(n)"></button>
    </nav>
  </main>
</template>

<style scoped>
.about { --ink: #1e2350; --soft: #8b8fc4; --line: rgba(120, 110, 200, .16); --accent: #d64da9; --accent2: #6a5cd0;
  position: fixed; inset: 0; overflow: auto; display: flex; flex-direction: column; gap: 24px; padding: clamp(24px, 4vh, 44px) clamp(20px, 4vw, 64px);
  color: var(--ink); background: #fbf8ff; font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all; }
.about::before { content: ""; position: fixed; inset: 0; pointer-events: none;
  background: radial-gradient(circle at 92% 4%, rgba(201, 228, 255, .55) 0, transparent 30%), radial-gradient(circle at 4% 96%, rgba(255, 209, 236, .5) 0, transparent 28%); }
.about > * { position: relative; max-width: 1280px; width: 100%; margin: 0 auto; }
.about a { color: inherit; text-decoration: none; }
.about button { font: inherit; cursor: pointer; border: 0; color: inherit; background: none; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }

.top { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 12px; }
.brand .mark { font-size: 26px; color: var(--accent2); line-height: 1; }
.brand .name { font-size: 18px; letter-spacing: 3px; font-weight: 700; }
.brand .sub { font-size: 10px; letter-spacing: 1.5px; color: var(--soft); text-transform: uppercase; }
.hl { margin-left: auto; margin-right: 22px; font-size: 12.5px; color: var(--soft); transition: .2s; }
.hl:hover { color: var(--ink); }
.enter { padding: 9px 18px; border: 1px solid var(--ink); border-radius: 22px; font-weight: 600; font-size: 12px; transition: .22s; }
.enter:hover { background: var(--ink); color: #fff; }

.stage { flex: 1; display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: clamp(24px, 4vw, 56px); align-items: center; }
.shot { position: relative; border: 1px solid #fff; border-radius: 22px; overflow: hidden; background: #fff; box-shadow: 0 30px 70px -30px rgba(80, 70, 160, .45); aspect-ratio: 16 / 10; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; animation: fade .35s ease both; }
@keyframes fade { from { opacity: 0; transform: scale(1.015); } to { opacity: 1; transform: none; } }
.arrow { position: absolute; top: 50%; width: 42px; height: 42px; margin-top: -21px; display: grid; place-items: center; font-size: 18px; color: var(--ink);
  background: rgba(255, 255, 255, .9); border-radius: 50%; box-shadow: 0 6px 18px rgba(80, 70, 160, .25); transition: .2s; }
.arrow:hover { background: var(--ink); color: #fff; }
.prev { left: 14px; }
.next { right: 14px; }

.kicker { display: flex; align-items: center; gap: 10px; font-size: 10.5px; letter-spacing: 2px; color: var(--soft); }
.kicker::before { content: ""; width: 24px; height: 1px; background: var(--accent); }
.info h1 { margin: 14px 0 12px; font-size: clamp(30px, 3.6vw, 48px); line-height: 1.05; letter-spacing: -.03em; font-weight: 800; animation: fade .35s ease both; }
.info p { margin: 0; max-width: 460px; line-height: 1.7; font-size: 15px; color: #6c70a8; animation: fade .35s ease both; }
.info .lock { margin-top: 12px; font-size: 13px; }
.open { display: inline-flex; margin-top: 26px; padding: 14px 26px; border-radius: 2px; background: var(--ink); color: #fff !important; font-size: 13px; font-weight: 600; transition: .22s; }
.open:hover { background: var(--accent2); transform: translateY(-2px); }

.dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; padding-bottom: 8px; }
.dots button { width: 8px; height: 8px; padding: 0; border-radius: 50%; background: #d9d3f0; transition: .2s; }
.dots button:hover { background: var(--accent2); }
.dots button.on { background: var(--accent); transform: scale(1.4); }

@media (max-width: 860px) {
  .stage { grid-template-columns: 1fr; align-items: start; }
}
@media (prefers-reduced-motion: reduce) { .shot img, .info h1, .info p { animation: none; } }
</style>
