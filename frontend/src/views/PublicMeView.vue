<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import PinkShell from '@/components/site/PinkShell.vue'
import '@/assets/home/fonts.css'
import Icon from '@/components/Icon.vue'
import { EMOJI_ICON } from '@/lib/icons'

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

/**
 * Визитка грузится при отрисовке на сервере (useFetch): поисковик и превью ссылки сразу видят имя и счётчики, браузер получает
 * данные вместе со страницей и второй раз не спрашивает. На сервере запрос идёт прямо в NestJS (runtimeConfig.apiBase).
 */
const config = useRuntimeConfig()
const { data, error } = await useFetch<PublicCard>('/api/public/me', {
  baseURL: import.meta.server ? config.apiBase : undefined,
  timeout: 15_000,
  ignoreResponseError: false,
})
const card = computed(() => data.value ?? null)
/** 404: владелец не включил визитку. */
const state = computed<'open' | 'closed' | 'error'>(() => (card.value ? 'open' : error.value?.statusCode === 404 ? 'closed' : 'error'))
const isPhoto = (a: string) => a.startsWith('data:image/')

// пока визитка закрыта, страницу не индексируем
useSeoMeta({ robots: () => (state.value === 'open' ? 'index, follow, max-image-preview:large' : 'noindex, nofollow') })
</script>

<template>
  <PinkShell sub="визитка">
  <main class="me">

    <section v-if="state === 'closed'" class="closed">
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
        <span v-else class="ava emoji"><Icon v-if="EMOJI_ICON[card.avatar || '🌸']" :name="EMOJI_ICON[card.avatar || '🌸']!" /><template v-else>{{ card.avatar }}</template></span>
        <div>
          <h1>{{ card.name || 'Изучаю корейский' }}</h1>
          <p>уровень {{ card.level }} · {{ card.title }}</p>
        </div>
      </div>
      <div class="stats">
        <div><b>{{ card.days }}</b><small>дней в пути</small></div>
        <div><b>{{ card.streak }}</b><small>дней занятий</small></div>
        <div><b>{{ card.learned }}</b><small>слов выучено</small></div>
        <div><b>{{ card.answers }}</b><small>ответов</small></div>
      </div>
      <RouterLink to="/korean/home" class="btn">Заглянуть на платформу →</RouterLink>
    </article>
  </main>
  </PinkShell>
</template>

<style scoped>
.me { width: 100%; max-width: 640px; margin: 0 auto; padding: clamp(32px, 5vw, 64px) 0 24px; }
.msg { margin-top: 40px; text-align: center; font: 400 14px/1.7 var(--pk-mono); color: var(--pk-soft); }
.closed { margin-top: 40px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.closed .big { font-size: 64px; color: var(--pk-pink); line-height: 1; }
.closed h1 { margin: 0; font-size: 34px; font-weight: 500; letter-spacing: -.02em; }
.closed p { margin: 0 0 12px; font: 400 14px/1.7 var(--pk-mono); color: var(--pk-soft); }
.card { overflow: hidden; border: 1px solid var(--pk-line); border-radius: 28px; background: var(--pk-glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
.cover { height: 150px; background: linear-gradient(120deg, #ffb3d6, #d9dcff 70%, #fff4fa); background-size: cover; background-position: center; }
.who { display: flex; align-items: center; gap: 16px; margin: -36px 28px 0; position: relative; }
.ava { width: 84px; height: 84px; border-radius: 50%; border: 4px solid #fff; background: #fff; object-fit: cover; }
.ava.emoji { display: grid; place-items: center; font-size: 42px; }
.who h1 { margin: 36px 0 0; font-size: 28px; font-weight: 600; overflow-wrap: anywhere; }
.who p { margin: 2px 0 0; font: 400 13px/1.5 var(--pk-mono); color: var(--pk-label); }
.stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 24px 28px; }
.stats div { padding: 16px 8px; text-align: center; background: var(--pk-panel); border: 1px solid var(--pk-line); border-radius: 18px; }
.stats b { display: block; font-size: 28px; font-weight: 600; font-variant-numeric: lining-nums; color: var(--pk-pink-2); }
.stats small { font: 400 11px/1.3 var(--pk-mono); color: var(--pk-label); }
.btn { display: inline-flex; align-items: center; height: 48px; margin: 0 28px 28px; padding: 0 22px; border-radius: 14px; background: var(--pk-ink); color: #fff !important; font-size: 15px; font-weight: 600; transition: background .2s; }
.btn:hover { background: #6a5cd0; }
.closed .btn { margin: 0; }
@media (max-width: 520px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .who, .stats { margin-left: 18px; margin-right: 18px; } .btn { margin-left: 18px; } }
</style>
