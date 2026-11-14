<script setup lang="ts">
import { ICON } from '@/game/icons'

/** Картинка-иконка игры «Хлебушек» по имени (файлы в `assets/game/icons`). */
defineProps<{ name: string }>()
</script>

<template><img class="gi-img" :src="ICON[name] ?? ''" alt="" aria-hidden="true" /></template>
