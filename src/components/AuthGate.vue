<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const token = ref('')
const busy = ref(false)

async function submit() {
  if (!token.value.trim() || busy.value) return
  busy.value = true
  await progress.connect(token.value)
  busy.value = false
  if (progress.unlocked) token.value = ''
}
</script>

<template>
  <div class="gate">
    <div class="gate-card">
      <div class="gate-ico">🔒</div>
      <h2>Этот раздел открывается по токену</h2>
      <p>
        Справочники открыты всем: слова, грамматика, шпаргалка, разговорник, хангыль, алфавит, правила чтения, примеры и числа.
        Задания, тренажёры, игра, повторение и личный кабинет работают после входа по токену.
      </p>
      <form class="gate-form" @submit.prevent="submit">
        <input v-model="token" type="password" placeholder="токен" autocomplete="current-password" aria-label="Токен" />
        <button type="submit" :disabled="busy">{{ busy ? 'Проверяю…' : 'Открыть' }}</button>
      </form>
      <p v-if="progress.sync === 'error' && progress.syncMessage" class="gate-err">{{ progress.syncMessage }}</p>
      <RouterLink to="/korean/words" class="gate-back">← К справочникам</RouterLink>
    </div>
  </div>
</template>

<style>
.gate { display: grid; place-items: center; min-height: 60vh; padding: 36px 20px; }
.gate-card { width: min(520px, 100%); padding: 32px 30px; text-align: center; background: rgba(248, 247, 244, .92);
  border: 1px solid rgba(168, 130, 47, .3); border-radius: 22px; box-shadow: 0 30px 60px -34px rgba(40, 38, 34, .45); }
.gate-ico { font-size: 40px; line-height: 1; }
.gate-card h2 { margin: 12px 0 0; font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 600; line-height: 1.1; }
.gate-card p { margin: 12px 0 0; font-size: 14.5px; line-height: 1.55; color: var(--muted); }
.gate-form { display: flex; gap: 8px; margin-top: 20px; }
.gate-form input { flex: 1; min-width: 0; padding: 12px 14px; font: inherit; background: var(--bg); border: 1px solid rgba(168, 130, 47, .35);
  border-radius: 12px; outline: none; color: var(--ink); }
.gate-form input:focus { border-color: var(--gold); }
.gate-form button { padding: 0 22px; font: inherit; font-weight: 600; color: #fff; background: var(--gold); border: 0; border-radius: 12px; cursor: pointer; }
.gate-form button:disabled { opacity: .6; cursor: default; }
.gate-card .gate-err { color: #a4402f; font-weight: 600; }
.gate-back { display: inline-block; margin-top: 18px; font-size: 14px; font-weight: 600; color: var(--gold); }
.gate-back:hover { text-decoration: underline; }
</style>
