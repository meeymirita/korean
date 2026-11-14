<script setup lang="ts">
// Лёгкая оболочка окна поиска: держит только клавиши (⌘/Ctrl+K, «/», Esc) и подгружает само окно (SearchWindow.vue со словарём,
// грамматикой и переводами) при первом открытии, чтобы оно не тянулось на каждую страницу.
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { closeSearch, searchOpen, toggleSearch } from '@/composables/useSearchWindow'

const SearchWindow = defineAsyncComponent(() => import('@/components/SearchWindow.vue'))
/** Окно загружено и остаётся в разметке: закрытие не должно обрывать его анимацию */
const loaded = ref(searchOpen.value)
watch(searchOpen, o => { if (o) loaded.value = true })

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    toggleSearch()
  } else if (e.key === 'Escape' && searchOpen.value) closeSearch()
  else if (e.key === '/' && !searchOpen.value && !e.ctrlKey && !e.metaKey && !e.altKey && canOpenByKey(e.target)) {
    e.preventDefault()
    toggleSearch()
  }
}
/** «/» открывает окно поиска, если человек не печатает, нет другого окна и на странице нет своего поля поиска (оно ловит «/» само). */
function canOpenByKey(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return false
  if (document.querySelector('[data-page-search], [role="dialog"]') || location.pathname.startsWith('/game')) return false
  return true
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <SearchWindow v-if="loaded" />
</template>
