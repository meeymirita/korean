<script setup lang="ts">
import Avatar from '@/components/Avatar.vue'
import MusicButton from '@/components/music/MusicButton.vue'
import VoiceButton from '@/components/voice/VoiceButton.vue'
import { useProgressStore } from '@/stores/progress'

/** Кнопки страницы игр: список игр (☰, только когда открыта игра), поиск, кабинет. Стоят в шапке каталога и в строке «← К списку игр» у открытого тренажёра. */
defineProps<{ menu: boolean; folded: boolean }>()
const emit = defineEmits<{ menu: []; search: [] }>()
const progress = useProgressStore()
</script>

<template>
  <div class="gx-tools">
    <button v-if="menu" type="button" class="gx-round" :title="folded ? 'Показать список игр' : 'Спрятать список игр'" :aria-label="folded ? 'Показать список игр' : 'Спрятать список игр'" :aria-expanded="!folded" @click="emit('menu')">☰</button>
    <ClientOnly><VoiceButton variant="game" /></ClientOnly>
    <ClientOnly><MusicButton variant="game" /></ClientOnly>
    <button type="button" class="gx-round" title="Поиск по платформе (Ctrl/⌘ + K или «/»)" aria-label="Поиск" @click="emit('search')">⌕</button>
    <RouterLink to="/korean/cabinet" class="gx-ava" aria-label="Кабинет"><Avatar :avatar="progress.data.profile.avatar" :size="40" /></RouterLink>
  </div>
</template>
