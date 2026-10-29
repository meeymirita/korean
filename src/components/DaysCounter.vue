<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Avatar from '@/components/Avatar.vue'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
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
    <RouterLink v-if="progress.unlocked" to="/korean/cabinet" class="days-hello">
      <Avatar :avatar="progress.data.profile.avatar" :size="34" />
      <span>
        <b>Привет{{ progress.data.profile.name ? ', ' + progress.data.profile.name : '' }}!</b>
        <small>⭐ Уровень {{ progress.info.level }} · {{ progress.info.title }} · 🔥 {{ progress.streak }}</small>
      </span>
    </RouterLink>
    <RouterLink v-else to="/korean/cabinet" class="days-level">🔒 Войти по токену <span>· откроются задания и игра</span></RouterLink>
  </div>
</template>

<style>
.days { padding-top: 6px; }
.days-label { display: flex; align-items: center; gap: 10px; font-family: 'Space Mono', monospace; font-size: 11px;
  letter-spacing: .2em; text-transform: uppercase; color: var(--gold); }
.days-label::before { content: ""; width: 18px; height: 1px; background: var(--gold); }
.days-row { display: flex; align-items: baseline; gap: 10px; margin-top: 4px; }
.days-num { font-variant-numeric: lining-nums; font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 56px; line-height: 1; color: var(--gold); }
.days-text { font-size: 14px; color: var(--muted); }
.days-level { display: inline-block; margin-top: 8px; font-size: 14px; font-weight: 600; transition: color .2s; }
.days-level span { color: var(--muted); font-weight: 500; }
.days-level:hover { color: var(--gold); }
.days-hello { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.days-hello b { display: block; font-size: 15px; }
.days-hello small { display: block; font-size: 12.5px; color: var(--muted); }
.days-hello:hover b { color: var(--gold); }
</style>
