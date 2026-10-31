<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import { fetchT } from '@/lib/http'

interface PublicCard {
  name: string
  avatar: string
  level: number
  title: string
  streak: number
  learned: number
  answers: number
  days: number
  cover: boolean
}

const card = ref<PublicCard | null>(null)
const state = ref<'loading' | 'open' | 'closed' | 'error'>('loading')
const isPhoto = (a: string) => a.startsWith('data:image/')

/** Пока владелец не включил визитку, страница закрыта: не показываем ничего и просим поисковики не индексировать. */
function robots(content: string) {
  let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (!el) {
    el = document.createElement('meta')
    el.name = 'robots'
    document.head.appendChild(el)
  }
  el.content = content
}

onMounted(async () => {
  try {
    const res = await fetchT('/api/public/me')
    if (res.status === 404) {
      state.value = 'closed'
      robots('noindex, nofollow')
      return
    }
    if (!res.ok) throw new Error(String(res.status))
    card.value = (await res.json()) as PublicCard
    state.value = 'open'
  } catch {
    state.value = 'error'
  }
})
</script>

<template>
  <main class="me">
    <header class="top">
      <RouterLink to="/" class="brand"><span class="mark">✳︎</span><span class="name ko">우리말</span></RouterLink>
    </header>

    <p v-if="state === 'loading'" class="msg">Загружаю…</p>
    <section v-else-if="state === 'closed'" class="closed">
      <div class="big ko">✳︎</div>
      <h1>Эта страница закрыта</h1>
      <p>Владелец пока не показывает свою визитку. Загляни позже.</p>
      <RouterLink to="/" class="btn">На главную</RouterLink>
    </section>
    <p v-else-if="state === 'error'" class="msg">Не получилось загрузить страницу. Попробуй позже.</p>

    <article v-else-if="card" class="card">
      <div class="cover" :class="{ photo: card.cover }" :style="card.cover ? { backgroundImage: 'url(/api/public/cover)' } : undefined"></div>
      <div class="who">
        <img v-if="isPhoto(card.avatar)" :src="card.avatar" alt="" class="ava" />
        <span v-else class="ava emoji">{{ card.avatar || '🌸' }}</span>
        <div>
          <h1>{{ card.name || 'Изучаю корейский' }}</h1>
          <p>уровень {{ card.level }} · {{ card.title }}</p>
        </div>
      </div>
      <div class="stats">
        <div><b>{{ card.days }}</b><small>дней в пути</small></div>
        <div><b>{{ card.streak }}</b><small>дней подряд</small></div>
        <div><b>{{ card.learned }}</b><small>слов выучено</small></div>
        <div><b>{{ card.answers }}</b><small>ответов</small></div>
      </div>
      <RouterLink to="/korean/home" class="btn">Заглянуть на платформу →</RouterLink>
    </article>
  </main>
</template>

<style scoped>
.me { --ink: #1e2350; --soft: #8b8fc4; --accent: #d64da9; --accent2: #6a5cd0;
  position: fixed; inset: 0; overflow: auto; padding: clamp(24px, 4vh, 44px) 20px 64px; color: var(--ink);
  background: radial-gradient(circle at 92% 4%, rgba(201, 228, 255, .55) 0, transparent 30%), radial-gradient(circle at 4% 96%, rgba(255, 209, 236, .5) 0, transparent 28%), #fbf8ff;
  font-family: 'Inter', 'Archivo', 'Noto Sans KR', sans-serif; word-break: keep-all; }
.me > * { max-width: 640px; margin-left: auto; margin-right: auto; }
.ko { font-family: 'Noto Sans KR', 'Archivo', sans-serif; }
.me a { color: inherit; text-decoration: none; }
.top { padding-bottom: 16px; }
.brand { display: inline-flex; align-items: baseline; gap: 10px; }
.brand .mark { font-size: 26px; color: var(--accent2); line-height: 1; }
.brand .name { font-size: 18px; letter-spacing: 3px; font-weight: 700; }
.msg { margin-top: 40px; text-align: center; color: var(--soft); }
.closed { margin-top: 40px; text-align: center; }
.closed .big { font-size: 64px; color: var(--accent); line-height: 1; }
.closed h1 { margin: 10px 0 6px; font-size: 26px; }
.closed p { margin: 0 0 20px; color: var(--soft); }
.card { margin-top: 12px; overflow: hidden; background: rgba(255, 255, 255, .78); border: 1px solid rgba(120, 110, 200, .18); border-radius: 28px; box-shadow: 0 30px 60px -36px rgba(80, 70, 160, .5); }
.cover { height: 150px; background: linear-gradient(120deg, #c9e4ff, #e8d5ff 50%, #ffd1ec); background-size: cover; background-position: center; }
.who { display: flex; align-items: center; gap: 16px; margin: -36px 28px 0; position: relative; }
.ava { width: 84px; height: 84px; border-radius: 50%; border: 4px solid #fff; background: #fff; object-fit: cover; box-shadow: 0 8px 20px -10px rgba(80, 70, 160, .6); }
.ava.emoji { display: grid; place-items: center; font-size: 42px; }
.who h1 { margin: 36px 0 0; font-size: 26px; overflow-wrap: anywhere; }
.who p { margin: 2px 0 0; color: var(--soft); font-size: 14px; }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 24px 28px; }
.stats div { padding: 14px 8px; text-align: center; background: #f6f1ff; border-radius: 16px; }
.stats b { display: block; font-size: 26px; font-variant-numeric: lining-nums; background: linear-gradient(135deg, var(--accent), var(--accent2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stats small { font-size: 11px; color: var(--soft); }
.btn { display: inline-block; margin: 0 28px 28px; padding: 11px 22px; border: 1px solid var(--ink); border-radius: 22px; font-size: 13px; font-weight: 600; transition: .2s; }
.btn:hover { background: var(--ink); color: #fff; }
.closed .btn { margin: 0; }
@media (max-width: 520px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .who, .stats { margin-left: 18px; margin-right: 18px; } .btn { margin-left: 18px; } }
</style>
