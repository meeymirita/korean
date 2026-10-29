<script setup lang="ts">
const START = new Date(2026, 5, 1)

const today = new Date()
const days = Math.max(
  0,
  Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - START.getTime()) / 86_400_000),
)

const plural = (n: number, forms: [string, string, string]) =>
  forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2]
</script>

<template>
  <div class="days">
    <div class="days-label">С 1 июня</div>
    <div class="days-row">
      <span class="days-num">{{ days }}</span>
      <span class="days-text">{{ plural(days, ['день', 'дня', 'дней']) }} с начала пути</span>
    </div>
  </div>
</template>

<style>
.days { padding-top: 6px; }
.days-label { display: flex; align-items: center; gap: 10px; font-family: 'Space Mono', monospace; font-size: 11px;
  letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
.days-label::before { content: ""; width: 18px; height: 1px; background: var(--gold); }
.days-row { display: flex; align-items: baseline; gap: 10px; margin-top: 4px; }
.days-num { font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 56px; line-height: 1; color: var(--gold); }
.days-text { font-size: 14px; color: var(--muted); }
</style>
