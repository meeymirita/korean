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
.dr { position: fixed; inset: 0; z-index: 200; background: rgba(8,26,70,.6); backdrop-filter: blur(10px); }
.box { position: absolute; top: 0; right: 0; bottom: 0; width: min(520px, 92vw); overflow: auto; display: flex; flex-direction: column; gap: 14px;
  padding: 26px clamp(18px, 3vw, 32px) 30px; color: #fff; border-left: 2px solid rgba(255,255,255,.6); background: rgba(255,255,255,.04);
  font-family: 'Cormorant Garamond', 'Gowun Batang', serif; font-size: 17px; text-shadow: 0 1px 8px rgba(0,0,0,.45); scrollbar-width: thin; }
.box > * { flex: none; }
.hd { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.hd h2 { margin: 0; font-size: 38px; font-weight: 500; line-height: 1; }
.x { flex: none; width: 40px; height: 40px; border: 2px solid rgba(255,255,255,.6); background: transparent; color: #fff; font: inherit; font-size: 18px; cursor: pointer; transition: background .2s, border-color .2s; }
.x:hover { background: rgba(255,255,255,.16); border-color: #fff; }
.tabs { display: flex; flex-wrap: wrap; gap: 10px; }
.tabs button { padding: 7px 20px; border: 2px solid rgba(255,255,255,.6); background: transparent; color: #fff; font: inherit; font-size: 19px; cursor: pointer; transition: background .2s, border-color .2s; }
.tabs button:hover { background: rgba(255,255,255,.1); border-color: #fff; }
.tabs button.on { background: rgba(255,255,255,.16); border-color: #fff; }
.tl { display: flex; flex-direction: column; margin-top: 6px; padding-left: 8px; }
.step { position: relative; display: block; padding: 0 0 20px 24px; border-left: 2px solid rgba(255,255,255,.6); color: #fff; }
.step:last-child { padding-bottom: 4px; }
.step u { position: absolute; left: -8px; top: 6px; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; background: #17306b; transition: background .2s; }
.step:hover u { background: #fff; }
.step:hover { color: #fff; }
.step div { display: flex; flex-direction: column; gap: 2px; }
.step small { font-size: 13px; letter-spacing: .15em; opacity: .75; }
.step b { font-size: 27px; font-weight: 500; line-height: 1.15; }
.step b em { margin-left: 8px; font-style: normal; font-size: .6em; opacity: .85; }
.step span { font-size: 18px; line-height: 1.3; opacity: .9; }
.note { margin: 0; opacity: .8; }

.drawer-enter-active, .drawer-leave-active { transition: opacity .25s; }
.drawer-enter-active .box, .drawer-leave-active .box { transition: transform .3s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .box, .drawer-leave-to .box { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) { .drawer-enter-active, .drawer-leave-active, .drawer-enter-active .box, .drawer-leave-active .box { transition: none; } }
</style>
