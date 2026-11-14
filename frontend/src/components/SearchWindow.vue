<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import SearchResults from '@/components/SearchResults.vue'
import { closeSearch, searchOpen, searchQuery as q } from '@/composables/useSearchWindow'
import { useSiteSearch } from '@/composables/useSiteSearch'

const input = ref<HTMLInputElement>()
const site = useSiteSearch(q)
const { result, more, run, stop } = site

watch(searchOpen, async o => {
  document.body.style.overflow = o ? 'hidden' : ''
  if (o) {
    await nextTick()
    input.value?.focus()
    input.value?.select()
  }
}, { immediate: true }) // окно подгружается при первом открытии: searchOpen уже true
watch(q, value => {
  Object.keys(more).forEach(k => delete more[k])
  run(value)
})


onBeforeUnmount(() => {
  stop()
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="sw">
      <div v-if="searchOpen" class="study sky study-modal sw" @click.self="closeSearch()">
        <section class="sw-box" role="dialog" aria-modal="true" aria-label="Поиск по платформе">
          <header class="sw-head">
            <h2>Поиск по платформе</h2>
            <button class="sw-x" aria-label="Закрыть" @click="closeSearch()">✕</button>
          </header>
          <div class="sb">
            <input ref="input" v-model="q" type="text" autocomplete="off" placeholder="Слово, правило, фраза, буква, пример…" />
            <button title="Очистить" aria-label="Очистить" @click="((q = ''), input?.focus())">✕</button>
          </div>
          <p class="sw-meta">
            <span v-if="result">Найдено: {{ result.total }}</span>
            <span v-else>ищет в словаре, грамматике, справочнике, примерах и буквах · Ctrl/⌘ + K или «/» — открыть и закрыть</span>
          </p>

          <div v-if="result" class="sw-res">
            <div v-if="!result.total" class="empty">Ничего не нашлось. Попробуй другое слово или русскую форму («ем» → «есть»).</div>

            <SearchResults :search="site" :q="q" mode="inline" />
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* z-index ниже окна грамматики (50): правило из результатов открывается поверх поиска */
.sw.study-modal { z-index: 45; align-items: flex-start; padding-top: 7vh; overflow-y: auto; }
.sw-box { width: min(860px, 100%); max-height: 86vh; overflow-y: auto; padding: 22px 26px 26px; background: #f6f1ff; border: 1px solid #fff; border-radius: 26px;
  box-shadow: 0 40px 80px -30px rgba(32, 38, 92, .5); }
.sw-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.sw-head h2 { margin: 0; font-size: 22px; }
.sw-x { width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: #fff; color: #20265c; cursor: pointer; }
.sw-x:hover { color: #d64da9; }
.sw .sb { margin: 0; }
.sw-meta { margin: 10px 4px 0; font-size: 12.5px; color: #6c70a8; }
.sw-res { margin-top: 8px; }
.sw .empty { padding: 28px 8px; color: #6c70a8; }
.sw-enter-active, .sw-leave-active { transition: opacity .18s; }
.sw-enter-from, .sw-leave-to { opacity: 0; }
@media (max-width: 700px) { .sw.study-modal { padding: 10px; } .sw-box { padding: 16px; max-height: 94vh; } }
</style>
