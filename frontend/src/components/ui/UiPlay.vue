<script setup lang="ts">
/**
 * Круглая кнопка-значок «играть» (или «пауза»): треугольник нарисован стилями, а не символом ▶ (у символа центр смещён и он «уезжал» вбок).
 * Сама ничего не нажимает: кладётся внутрь ссылки или кнопки. `color`: цвет круга, `size`: диаметр в px.
 */
withDefaults(defineProps<{ color?: string; size?: number; pause?: boolean }>(), { color: 'var(--ui-accent)', size: 32, pause: false })
</script>

<template>
  <i class="ui-play" :class="{ 'is-pause': pause }" :style="{ background: color, width: size + 'px', height: size + 'px' }" aria-hidden="true"></i>
</template>

<style scoped>
.ui-play { display: grid; place-items: center; flex: none; border-radius: 50%; }
.ui-play::after { content: ''; width: 36%; height: 40%; margin-left: 8%; background: #fff; clip-path: polygon(0 0, 100% 50%, 0 100%); }
.ui-play.is-pause::after { width: 34%; margin-left: 0; clip-path: none; background: linear-gradient(90deg, #fff 0 36%, transparent 36% 64%, #fff 64%); }
</style>
