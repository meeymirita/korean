<script setup lang="ts">
import Avatar from '@/components/Avatar.vue'
import MusicButton from '@/components/music/MusicButton.vue'
import { useProgressStore } from '@/stores/progress'

/** Кнопки страницы игр: список игр (☰, только когда открыта игра), поиск, тема, кабинет. Стоят в шапке каталога и в строке «← К списку игр» у открытого тренажёра. */
defineProps<{ menu: boolean; folded: boolean; dark: boolean }>()
const emit = defineEmits<{ menu: []; search: []; theme: [] }>()
const progress = useProgressStore()
</script>

<template>
  <div class="gx-tools">
    <button v-if="menu" type="button" class="gx-round" :title="folded ? 'Показать список игр' : 'Спрятать список игр'" :aria-label="folded ? 'Показать список игр' : 'Спрятать список игр'" :aria-expanded="!folded" @click="emit('menu')">☰</button>
    <ClientOnly><MusicButton variant="game" /></ClientOnly>
    <button type="button" class="gx-round" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" aria-label="Поиск" @click="emit('search')">⌕</button>
    <button type="button" class="gx-round" :title="dark ? 'Светлая тема' : 'Тёмная тема'" :aria-label="dark ? 'Включить светлую тему' : 'Включить тёмную тему'" @click="emit('theme')">{{ dark ? '☀' : '☾' }}</button>
    <RouterLink to="/korean/cabinet" class="gx-ava" aria-label="Кабинет"><Avatar :avatar="progress.data.profile.avatar" :size="40" /></RouterLink>
  </div>
</template>
