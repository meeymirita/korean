<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { GAMES, PAGES } from '@/data/guide'
import { useProgressStore } from '@/stores/progress'

const open = defineModel<boolean>({ default: false })
const progress = useProgressStore()
const tab = ref<'games' | 'pages'>('games')
const box = ref<HTMLElement>()
watch(tab, () => box.value?.scrollTo({ top: 0 }))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
const n = (i: number) => String(i + 1).padStart(2, '0')
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="dr" @click.self="open = false">
      <aside ref="box" class="box" role="dialog" aria-modal="true" aria-label="Что здесь есть">
        <header class="hd">
          <h2>Что здесь есть</h2>
          <button class="x" aria-label="Закрыть" @click="open = false">✕</button>
        </header>
        <nav class="tabs">
          <button :class="{ on: tab === 'games' }" @click="tab = 'games'">Игры · {{ GAMES.length }}</button>
          <button :class="{ on: tab === 'pages' }" @click="tab = 'pages'">Вкладки · {{ PAGES.length }}</button>
        </nav>
        <div class="tl">
          <RouterLink v-for="(c, i) in tab === 'games' ? GAMES : PAGES" :key="c.title" :to="c.to" class="step" @click="open = false">
            <u></u>
            <div>
              <small>{{ n(i) }}</small>
              <b>{{ c.title }}<em v-if="c.private && !progress.unlocked">🔒</em></b>
              <span>{{ c.text }}</span>
            </div>
          </RouterLink>
        </div>
        <p v-if="!progress.unlocked" class="note">🔒 открывается после входа по токену</p>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.dr { position: fixed; inset: 0; z-index: 200; background: rgba(32, 38, 92, .45); backdrop-filter: blur(8px); }
.box { position: absolute; top: 0; right: 0; bottom: 0; width: min(520px, 92vw); overflow: auto; display: flex; flex-direction: column; gap: 14px;
  padding: 26px clamp(18px, 3vw, 32px) 30px; color: #20265c; border-left: 1px solid #fff; background: linear-gradient(160deg, #fbeefc, #eaedff 60%, #fff3f8);
  box-shadow: -20px 0 50px rgba(100, 87, 170, .2); font-family: 'Archivo', 'Noto Sans KR', sans-serif; font-size: 15px; scrollbar-width: thin; }
.box > * { flex: none; }
.hd { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hd h2 { margin: 0; font-size: 26px; font-weight: 700; line-height: 1; }
.x { flex: none; width: 40px; height: 40px; border: 1px solid #fff; border-radius: 50%; background: rgba(255, 255, 255, .8); color: #20265c; font: inherit; font-size: 16px; cursor: pointer; transition: .2s; }
.x:hover { background: #fff; color: #d64da9; }
.tabs { display: flex; flex-wrap: wrap; gap: 10px; }
.tabs button { padding: 8px 18px; border: 1px solid #fff; border-radius: 99px; background: rgba(255, 255, 255, .7); color: #6c70a8; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; transition: .2s; }
.tabs button:hover { color: #d64da9; }
.tabs button.on { background: linear-gradient(100deg, #ffe0f5, #ece5ff); color: #d64da9; }
.tl { display: flex; flex-direction: column; margin-top: 6px; padding-left: 8px; }
.step { position: relative; display: block; padding: 0 0 20px 24px; border-left: 2px solid rgba(143, 124, 240, .35); color: #20265c; }
.step:last-child { padding-bottom: 4px; }
.step u { position: absolute; left: -8px; top: 6px; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #8f7cf0; background: #fff; transition: background .2s; }
.step:hover u { background: #d64da9; border-color: #d64da9; }
.step:hover b { color: #d64da9; }
.step div { display: flex; flex-direction: column; gap: 2px; }
.step small { font-size: 11px; letter-spacing: .15em; color: #8f7cf0; }
.step b { font-size: 18px; font-weight: 700; line-height: 1.2; transition: color .2s; }
.step b em { margin-left: 8px; font-style: normal; font-size: .7em; opacity: .85; }
.step span { font-size: 14px; line-height: 1.4; color: #6c70a8; }
.note { margin: 0; color: #6c70a8; }

.drawer-enter-active, .drawer-leave-active { transition: opacity .25s; }
.drawer-enter-active .box, .drawer-leave-active .box { transition: transform .3s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .box, .drawer-leave-to .box { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) { .drawer-enter-active, .drawer-leave-active, .drawer-enter-active .box, .drawer-leave-active .box { transition: none; } }
</style>
