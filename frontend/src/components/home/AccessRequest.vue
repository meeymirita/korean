<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'

/**
 * Окно «Запросить доступ» для тех, у кого нет токена: открывается вместо перехода на закрытую страницу из окна «Что здесь есть»
 * и со страницы «О платформе». Токен выдаёт автор, поэтому здесь Telegram; «У меня есть токен» ведёт на вход (`AuthGate`).
 */
defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  e.stopImmediatePropagation() // закрывается только это окно, а не шторка под ним
  emit('close')
}
// capture: раньше обработчиков шторки «Что здесь есть»
onMounted(() => document.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))

function haveToken() {
  emit('close')
  void router.push('/korean/home')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ar">
      <div v-if="open" class="ar" @click.self="emit('close')">
        <section class="ar-box" role="dialog" aria-modal="true" aria-labelledby="ar-title">
          <button type="button" class="ar-x" aria-label="Закрыть" @click="emit('close')">✕</button>
          <span class="ar-lock"><Icon name="lock" /></span>
          <h2 id="ar-title">Запросить доступ</h2>
          <p v-if="title">Раздел «{{ title }}» открывается по личному токену.</p>
          <p v-else>Эта страница открывается по личному токену.</p>
          <p>Токен выдаёт автор платформы: напиши ему в Telegram, и доступ откроют.</p>
          <a class="ar-tg" href="https://t.me/meeymirita" target="_blank" rel="noopener">Написать в Telegram: @meeymirita</a>
          <button type="button" class="ar-have" @click="haveToken">У меня уже есть токен</button>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ar { position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 18px; background: rgba(11, 5, 8, .75); backdrop-filter: blur(6px); }
.ar-box { position: relative; display: flex; flex-direction: column; align-items: center; gap: 12px; width: min(440px, 100%); padding: 34px 30px 28px; text-align: center; color: #fff;
  background: #2a0a18; border: 1px solid rgba(255, 190, 220, .18); border-radius: 28px; box-shadow: 0 30px 70px rgba(0, 0, 0, .6); font-family: 'Archivo', 'Noto Sans KR', sans-serif; }
.ar-x { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; font: inherit; font-size: 15px; color: #fff; cursor: pointer; background: rgba(255, 255, 255, .1); border: 0; border-radius: 50%; }
.ar-x:hover { color: #2a0a18; background: #fff; }
.ar-lock { display: grid; place-items: center; width: 58px; height: 58px; font-size: 26px; background: rgba(255, 255, 255, .1); border-radius: 50%; }
.ar-box h2 { margin: 4px 0 0; font-size: 26px; font-weight: 700; }
.ar-box p { margin: 0; font-size: 15px; line-height: 1.55; color: #ffd1e3; }
.ar-tg { margin-top: 8px; padding: 13px 24px; font-size: 15px; font-weight: 600; color: #2a0a18; text-decoration: none; background: #fff; border-radius: 16px; transition: background .2s; }
.ar-tg:hover { background: #ffd1e3; }
.ar-have { padding: 8px 14px; font: inherit; font-size: 14px; color: #ffb3d1; cursor: pointer; background: none; border: 0; text-decoration: underline; }
.ar-have:hover { color: #fff; }
.ar-enter-active, .ar-leave-active { transition: opacity .2s; }
.ar-enter-active .ar-box, .ar-leave-active .ar-box { transition: transform .25s ease; }
.ar-enter-from, .ar-leave-to { opacity: 0; }
.ar-enter-from .ar-box, .ar-leave-to .ar-box { transform: translateY(14px) scale(.97); }
@media (prefers-reduced-motion: reduce) { .ar-enter-active, .ar-leave-active, .ar-enter-active .ar-box, .ar-leave-active .ar-box { transition: none; } }
</style>
