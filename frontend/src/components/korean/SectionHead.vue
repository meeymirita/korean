<script setup lang="ts">
import { computed } from 'vue'
import { sectionById } from '@/data/korean/sections'

const props = defineProps<{ id: string; sub?: string; big?: string | number }>()
const s = computed(() => sectionById(props.id))
</script>

<template>
  <header class="page-head">
    <div>
      <div class="kicker">{{ s.num }} — {{ s.kicker }}</div>
      <h1>{{ s.title }}</h1>
      <div class="sub">{{ sub ?? s.sub }}</div>
    </div>
    <div v-if="big !== undefined" class="big">{{ big }}</div>
  </header>
</template>
