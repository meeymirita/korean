<script setup lang="ts">
import { SERVICE_LINKS } from '@/data/korean/services'

defineProps<{ toPage?: boolean }>()
</script>

<template>
  <section class="svl">
    <div class="svl-grid">
      <a v-for="s in SERVICE_LINKS" :key="s.id" class="svl-card" :href="s.url" target="_blank" rel="noopener noreferrer">
        <b>{{ s.name }} <span aria-hidden="true">↗</span></b>
        <span>{{ s.desc }}</span>
        <small>{{ s.access }}</small>
      </a>
      <NuxtLink v-if="toPage" class="svl-card svl-page" to="/korean/services">
        <b>Страница «Сервисы» →</b>
        <span>Состояние контейнеров, журналы и поисковый индекс на отдельной странице</span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.svl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
.svl-card { display: grid; gap: 6px; align-content: start; padding: 14px 16px; border: 1px solid var(--line, #ddd); border-radius: 16px; background: var(--card, rgba(255, 255, 255, .7)); color: inherit; text-decoration: none; transition: border-color .15s, transform .15s; }
.svl-card:hover { border-color: var(--gold, #8f7cf0); transform: translateY(-2px); }
.svl-card b { font-size: 16px; }
.svl-card span { font-size: 14px; }
.svl-card small { color: var(--muted, #6c70a8); font-size: 12px; overflow-wrap: anywhere; }
.svl-page { border-style: dashed; }
</style>
