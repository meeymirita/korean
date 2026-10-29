<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Avatar from '@/components/Avatar.vue'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
</script>

<template>
  <RouterLink to="/korean/cabinet" class="hello-card">
    <template v-if="progress.unlocked">
      <Avatar :avatar="progress.data.profile.avatar" :size="42" />
      <span class="hello-txt">
        <b>Привет{{ progress.data.profile.name ? ', ' + progress.data.profile.name : '' }}!</b>
        <small>⭐ Уровень {{ progress.info.level }} · {{ progress.info.title }} · 🔥 {{ progress.streak }}</small>
      </span>
      <span class="hello-arrow">→</span>
    </template>
    <template v-else>
      <span class="hello-lock">🔒</span>
      <span class="hello-txt">
        <b>Войти по токену</b>
        <small>откроются задания, игра и кабинет</small>
      </span>
      <span class="hello-arrow">→</span>
    </template>
  </RouterLink>
</template>

<style>
.hello-card { position: absolute; right: 48px; top: 48px; display: flex; align-items: center; gap: 12px; min-width: 280px; max-width: 420px;
  padding: 14px 18px; border-radius: 16px; background: rgba(248, 247, 244, .9); box-shadow: 0 30px 60px -30px rgba(40, 38, 34, .45); }
.hello-txt { display: flex; flex-direction: column; min-width: 0; }
.hello-txt b { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 600; line-height: 1.1; overflow-wrap: anywhere; }
.hello-txt small { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
.hello-lock { display: grid; place-items: center; width: 42px; height: 42px; flex: none; border-radius: 50%; font-size: 18px;
  border: 1px solid rgba(168, 130, 47, .4); background: rgba(168, 130, 47, .12); }
.hello-arrow { margin-left: auto; color: var(--gold); font-size: 18px; transition: transform .2s; }
.hello-card:hover .hello-arrow { transform: translateX(4px); }
.hello-card:hover b { color: var(--gold); }
@media (max-width: 720px) {
  .hello-card { position: relative; right: auto; top: auto; max-width: none; margin: 16px 16px 0; }
}
</style>
