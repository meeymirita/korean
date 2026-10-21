<script setup lang="ts">
defineProps<{ count: number; active: number }>()
defineEmits<{ select: [index: number] }>()
</script>

<template>
  <div class="dots">
    <button
        v-for="index in count"
        :key="index"
        :class="{ active: index - 1 === active }"
        :aria-label="`Цитата ${index}`"
        @click="$emit('select', index - 1)"
    ></button>
  </div>
</template>
