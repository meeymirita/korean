<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { GAMES, PAGES } from '@/data/guide'
import { shotUrl } from '@/lib/aboutShots'
import { useProgressStore } from '@/stores/progress'

/**
 * «Что здесь есть» на главной: всё, что есть на платформе, сразу при открытии. Разделы идут карточками со скриншотами,
 * игры спрятаны в выпадающий список (картинки игр грузятся только после раскрытия). Те же скриншоты на странице «О платформе».
 */
const open = defineModel<boolean>({ default: false })
const progress = useProgressStore()
const box = ref<HTMLElement>()
/** Игры: выпадающий список; картинки не запрашиваются, пока список ни разу не раскрывали. */
const gamesOpen = ref(false)
const gamesSeen = ref(false)
watch(gamesOpen, v => v && (gamesSeen.value = true))
watch(open, v => v && box.value?.scrollTo({ top: 0 }))

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Transition name="drawer">
    <div v-if="open" class="dr" @click.self="open = false">
      <aside ref="box" class="box" role="dialog" aria-modal="true" aria-label="Что здесь есть">
        <header class="hd">
          <div>
            <h2>Что здесь есть</h2>
            <p class="sub">{{ PAGES.length }} разделов и {{ GAMES.length }} игр. Нажми на карточку, чтобы открыть.</p>
          </div>
          <button class="x" aria-label="Закрыть" @click="open = false">✕</button>
        </header>
        <p v-if="!progress.unlocked" class="note"><Icon name="lock" /> Закрытое открывается после входа по токену</p>

        <h3 class="sec">Разделы <small>{{ PAGES.length }}</small></h3>
        <div class="grid">
          <RouterLink v-for="c in PAGES" :key="c.title" :to="c.to" class="card" @click="open = false">
            <span class="ph">
              <img v-if="shotUrl(c.to)" :src="shotUrl(c.to)" :alt="`Страница «${c.title}»`" loading="lazy" decoding="async" />
              <em v-if="c.private && !progress.unlocked" class="lk" title="Откроется после входа"><Icon name="lock" /></em>
            </span>
            <b>{{ c.title }}</b>
            <span class="tx">{{ c.text }}</span>
          </RouterLink>
        </div>

        <button type="button" class="sec acc-btn" :class="{ on: gamesOpen }" :aria-expanded="gamesOpen" aria-controls="guide-games" @click="gamesOpen = !gamesOpen">
          <span class="chev" aria-hidden="true">▸</span>Игры <small>{{ GAMES.length }}</small>
        </button>
        <div id="guide-games" class="acc" :class="{ open: gamesOpen }" :inert="!gamesOpen">
          <div class="acc-in">
            <div v-if="gamesSeen" class="grid">
              <RouterLink v-for="c in GAMES" :key="c.title" :to="c.to" class="card" @click="open = false">
                <span class="ph">
                  <img v-if="shotUrl(c.to)" :src="shotUrl(c.to)" :alt="`Игра «${c.title}»`" loading="lazy" decoding="async" />
                  <em v-if="c.private && !progress.unlocked" class="lk" title="Откроется после входа"><Icon name="lock" /></em>
                </span>
                <b>{{ c.title }}</b>
                <span class="tx">{{ c.text }}</span>
              </RouterLink>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.dr { position: fixed; inset: 0; z-index: 200; background: rgba(32, 38, 92, .45); backdrop-filter: blur(8px); }
.box { position: absolute; top: 0; right: 0; bottom: 0; width: min(1180px, 100vw); overflow: auto; display: flex; flex-direction: column; gap: 16px;
  padding: 26px clamp(18px, 3vw, 40px) 40px; color: #20265c; border-left: 1px solid #fff; background: linear-gradient(160deg, #fbeefc, #eaedff 60%, #fff3f8);
  box-shadow: -20px 0 50px rgba(100, 87, 170, .2); font-family: 'Archivo', 'Noto Sans KR', sans-serif; font-size: 15px; scrollbar-width: thin; }
.box > * { flex: none; }
.hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.hd h2 { margin: 0; font-size: clamp(26px, 3vw, 38px); font-weight: 700; line-height: 1.05; }
.sub { margin: 8px 0 0; color: #6c70a8; font-size: 15px; }
.x { flex: none; width: 42px; height: 42px; border: 1px solid #fff; border-radius: 50%; background: rgba(255, 255, 255, .8); color: #20265c; font: inherit; font-size: 16px; cursor: pointer; transition: .2s; }
.x:hover { background: #fff; color: #d64da9; }
.note { margin: 0; color: #6c70a8; }
.sec { margin: 8px 0 0; font-size: 22px; font-weight: 700; color: #20265c; }
.sec small { margin-left: 6px; font-size: 14px; font-weight: 600; color: #8f7cf0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 16px; }
.card { display: flex; flex-direction: column; gap: 6px; padding: 10px 10px 16px; color: #20265c; background: rgba(255, 255, 255, .75); border: 1px solid #fff; border-radius: 20px;
  box-shadow: 0 8px 22px rgba(100, 87, 170, .1); transition: transform .2s, box-shadow .2s; }
.card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(100, 87, 170, .22); }
.ph { position: relative; display: block; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 14px; background: linear-gradient(135deg, #f3e4fa, #e1e5ff); }
.ph img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform .35s; }
.card:hover .ph img { transform: scale(1.04); }
.lk { position: absolute; right: 8px; top: 8px; display: grid; place-items: center; width: 28px; height: 28px; font-style: normal; font-size: 14px; background: rgba(255, 255, 255, .92); border-radius: 50%; box-shadow: 0 4px 10px rgba(100, 87, 170, .25); }
.card b { padding: 6px 8px 0; font-size: 17px; font-weight: 700; line-height: 1.2; transition: color .2s; }
.card:hover b { color: #d64da9; }
.tx { padding: 0 8px; font-size: 13.5px; line-height: 1.45; color: #6c70a8; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.acc-btn { display: inline-flex; align-items: center; gap: 10px; align-self: flex-start; margin-top: 10px; padding: 11px 24px; font: inherit; font-size: 18px; font-weight: 700; color: #fff; cursor: pointer;
  background: linear-gradient(100deg, #e86bc0, #d64da9); border: 0; border-radius: 99px; box-shadow: 0 6px 16px rgba(214, 77, 169, .3); }
.acc-btn small { margin: 0; font-size: 14px; color: #ffe6f6; }
.acc-btn:hover { filter: brightness(1.06); }
.chev { display: inline-block; transition: transform .2s; }
.acc-btn.on .chev { transform: rotate(90deg); }
.acc { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s ease; }
.acc.open { grid-template-rows: 1fr; }
.acc-in { min-height: 0; overflow: hidden; }
.acc.open .acc-in { padding-bottom: 6px; }

.drawer-enter-active, .drawer-leave-active { transition: opacity .25s; }
.drawer-enter-active .box, .drawer-leave-active .box { transition: transform .3s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .box, .drawer-leave-to .box { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) { .drawer-enter-active, .drawer-leave-active, .drawer-enter-active .box, .drawer-leave-active .box, .acc, .chev, .ph img, .card { transition: none; } }
</style>
