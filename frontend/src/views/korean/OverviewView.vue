<script setup lang="ts">
import Cat from '@/components/Cat.vue'
import Icon from '@/components/Icon.vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import DashboardHome from '@/components/korean/DashboardHome.vue'
import SearchResults from '@/components/SearchResults.vue'
import { useSiteSearch } from '@/composables/useSiteSearch'
import { useProgressStore } from '@/stores/progress'
import { lastVisited } from '@/composables/useLastVisited'

const progress = useProgressStore()

const q = ref(String(useRoute().query.q ?? ''))
const input = ref<HTMLInputElement>()
const site = useSiteSearch(q)
const { result, run, stop } = site

function onKey(e: KeyboardEvent) {
  if (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT') {
    e.preventDefault()
    input.value?.focus()
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKey)
  input.value?.focus()
  watch(q, run, { immediate: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  stop()
})
</script>

<template>
  <div class="wrap ov">
    <header class="greet">
      <div>
        <h1>Привет! 안녕 <Icon name="sparkle" /></h1>
        <p>{{ progress.unlocked && progress.data.profile.name ? progress.data.profile.name + ', сегодня' : 'Сегодня' }} ты ближе к своей цели, чем вчера.</p>
      </div>
      <div class="greet-r">
        <ClientOnly><RouterLink v-if="lastVisited" :to="lastVisited.path" class="chip">↩ {{ lastVisited.title }}</RouterLink></ClientOnly>
        <span v-if="progress.unlocked" class="streak"><Icon name="fire" /> <b v-count="progress.studyDays">{{ progress.studyDays }}</b> дн. занятий</span>
      </div>
    </header>

    <div class="ov-search">
      <div class="sb">
        <input ref="input" data-page-search v-model="q" type="text" autocomplete="off" placeholder="Слово, правило, фраза, буква… по всему сайту" />
        <button title="Очистить" aria-label="Очистить" @click="((q = ''), input?.focus())">✕</button>
      </div>
      <div class="meta">
        <span v-if="result">Найдено: {{ result.total }}</span>
        <span v-else>ищет в словаре, грамматике, справочнике, примерах и буквах</span>
        <span><b>/</b> — фокус на поиск</span>
      </div>
    </div>

    <template v-if="result">
      <div v-if="!result.total" class="empty">
        <Cat name="think" />
        Ничего не нашлось. Попробуй другое слово или русскую форму («ем» → «есть»).
      </div>

      <SearchResults :search="site" :q="q" mode="link" />
    </template>

    <DashboardHome v-else />
  </div>
</template>

<style scoped>
.study.sky .greet { padding-right: 0; } /* справа сверху осталась одна кнопка-колокольчик выше этой строки: отступ под поиск не нужен, плашки идут к самому краю */
.greet { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin: 8px 4px 6px; }
.greet h1 { font-size: 25px; margin: 0 0 6px; }
.greet p { margin: 0; color: var(--muted); font-size: 14px; }
.greet-r { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.streak { font-size: 13px; padding: 8px 12px; border-radius: 16px; background: var(--surface); white-space: nowrap; }
.streak b { font-size: 18px; }
.ov .chip { text-decoration: none; color: inherit; }
</style>
