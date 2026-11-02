<script setup lang="ts">
defineProps<{ tip: { show: boolean; x: number; y: number; title: string; rows: { name: string; value: string; color?: string }[] } }>()
</script>

<template>
  <div class="ch-tip" :class="{ on: tip.show }" :style="{ left: tip.x + 'px', top: tip.y + 'px' }" role="presentation">
    <b>{{ tip.title }}</b>
    <div v-for="r in tip.rows" :key="r.name"><i v-if="r.color" :style="{ background: r.color }"></i>{{ r.name }}: <strong>{{ r.value }}</strong></div>
  </div>
</template>

<style>
.study .ch-tip { position: absolute; z-index: 5; min-width: 110px; padding: 8px 12px; font-size: 12.5px; line-height: 1.5; color: var(--ink); pointer-events: none;
  background: #fff; border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 24px -12px rgba(30, 35, 80, .35); opacity: 0;
  transform: translate(-50%, calc(-100% - 12px)); transition: opacity .12s, left .08s, top .08s; }
.study .ch-tip.on { opacity: 1; }
.study .ch-tip b { display: block; margin-bottom: 2px; }
.study .ch-tip i { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; }
</style>
