<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { formatClock, useTimerStore } from '@/stores/timer'

const timer = useTimerStore()
const route = useRoute()
onMounted(() => timer.watchReminder())
</script>

<template>
  <div v-if="timer.available && !['/', '/about'].includes(route.path)" class="stm">
    <Transition name="stm-pop">
      <div v-if="timer.reminder" class="stm-note" role="status">
        <span>⏱ Не забывай нажимать таймер: время занятий запишется в кабинет.</span>
        <button class="go" @click="timer.start()">Запустить</button>
        <button class="x" aria-label="Закрыть" @click="timer.dismiss()">✕</button>
      </div>
    </Transition>
    <button class="stm-btn" :class="{ on: timer.running }" :title="timer.running ? 'Остановить таймер' : 'Запустить таймер'" @click="timer.toggle()">
      <span class="ic">{{ timer.running ? '⏸' : '▶' }}</span>
      <span class="t">{{ timer.running ? formatClock(timer.session) : 'Таймер' }}</span>
      <small>сегодня {{ formatClock(timer.today) }}</small>
    </button>
  </div>
</template>

<style scoped>
.stm { position: fixed; right: 18px; bottom: 18px; z-index: 40; display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
  font-family: 'Archivo', 'Noto Sans KR', sans-serif; }
.stm-btn { display: inline-flex; align-items: center; gap: 10px; padding: 10px 18px; font: inherit; font-size: 14px; font-weight: 600; color: #20265c;
  background: rgba(255, 255, 255, .92); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 10px 28px rgba(100, 87, 170, .25); cursor: pointer; transition: .2s; }
.stm-btn:hover { transform: translateY(-2px); }
.stm-btn.on { color: #37378f; background: linear-gradient(100deg, #f8b9e9, #9de4ff); }
.stm-btn .t { font-variant-numeric: tabular-nums; min-width: 2.6em; }
.stm-btn small { font-size: 11px; font-weight: 500; color: #6c70a8; }
.stm-note { display: flex; align-items: center; gap: 10px; max-width: 340px; padding: 12px 14px; font-size: 13px; line-height: 1.4; color: #fff;
  background: rgba(33, 43, 105, .96); border-radius: 18px; box-shadow: 0 14px 36px rgba(32, 38, 92, .4); }
.stm-note .go { flex: none; padding: 7px 12px; font: inherit; font-size: 12px; font-weight: 600; color: #37378f; background: linear-gradient(100deg, #f8b9e9, #9de4ff); border: 0; border-radius: 99px; cursor: pointer; }
.stm-note .x { flex: none; padding: 2px 4px; color: #fff; background: none; border: 0; opacity: .7; cursor: pointer; }
.stm-pop-enter-active, .stm-pop-leave-active { transition: opacity .25s, transform .25s; }
.stm-pop-enter-from, .stm-pop-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 560px) { .stm { right: 10px; bottom: 10px; } .stm-btn small { display: none; } }
</style>
