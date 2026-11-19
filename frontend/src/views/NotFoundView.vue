<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import PinkShell from '@/components/site/PinkShell.vue'
import Cat from '@/components/Cat.vue'
import { openSearch } from '@/composables/useSearchWindow'
import SearchHost from '@/components/SearchHost.vue'

const route = useRoute()
const LINKS = [
  { to: '/korean/home', ko: '홈', text: 'Главная раздела' },
  { to: '/korean/words', ko: '단어', text: 'Слова' },
  { to: '/korean/grammar', ko: '문법', text: 'Грамматика' },
  { to: '/korean/ref', ko: '참고', text: 'Справочник' },
]
</script>

<template>
  <PinkShell sub="404">
    <main class="nf">
      <Cat name="think" />
      <h1 class="ko">404</h1>
      <p class="lead">Такой страницы нет</p>
      <p class="path">{{ route.fullPath }}</p>
      <p class="pk-lead hint">Возможно, адрес набран с ошибкой или страница переехала. Попробуй поиск или перейди в раздел.</p>
      <div class="row">
        <button class="pk-btn" type="button" @click="openSearch">Найти по платформе</button>
        <RouterLink to="/" class="pk-ghost">На главную</RouterLink>
      </div>
      <nav class="links">
        <RouterLink v-for="l in LINKS" :key="l.to" :to="l.to"><span class="ko">{{ l.ko }}</span>{{ l.text }}</RouterLink>
      </nav>
    </main>
    <SearchHost />
  </PinkShell>
</template>

<style scoped>
.nf { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 0; text-align: center; }
h1 { margin: 0; font-size: clamp(88px, 20vw, 200px); font-weight: 500; letter-spacing: -.04em; line-height: .95; color: var(--pk-pink-2); }
.lead { margin: 6px 0 0; font-size: clamp(24px, 3vw, 36px); font-weight: 500; letter-spacing: -.02em; }
.path { margin: 0; max-width: 90vw; overflow-wrap: anywhere; font: 400 12px/1.5 var(--pk-mono); color: var(--pk-label); }
.hint { margin: 10px 0 18px; max-width: 460px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.links { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 30px; }
.links a { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 110px; padding: 14px 16px; border: 1px solid var(--pk-line); border-radius: 20px; background: var(--pk-glass); color: #fff; font: 400 12px/1.3 var(--pk-mono); transition: border-color .2s, transform .2s; }
.links a .ko { font-size: 20px; color: var(--pk-pink-2); }
.links a:hover { transform: translateY(-2px); border-color: var(--pk-pink-2); }
</style>
