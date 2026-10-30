<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { crumbsFor } from '@/data/korean/crumbs'

const route = useRoute()
const crumbs = computed(() => crumbsFor(route.path, route.query))
</script>

<template>
  <nav v-if="crumbs.length" class="crumbs" aria-label="Где я">
    <ol>
      <li v-for="(c, i) in crumbs" :key="i">
        <RouterLink v-if="c.to" :to="c.to">{{ c.label }}</RouterLink>
        <span v-else aria-current="page">{{ c.label }}</span>
      </li>
    </ol>
  </nav>
</template>
