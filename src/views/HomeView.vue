<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import '@/assets/home/fonts-serif.css'
import bg from '@/assets/home/bg.jpg'
import dona from '@/assets/home/dona.jpg'
import photo1 from '@/assets/home/photo-1.jpg'
import photo2 from '@/assets/home/photo-2.jpg'
import photo3 from '@/assets/home/photo-3.jpg'
import photo4 from '@/assets/home/photo-4.jpg'
import photo5 from '@/assets/home/photo-5.jpg'
import photo6 from '@/assets/home/photo-6.jpg'
import Avatar from '@/components/Avatar.vue'
import HomeGuideDrawer from '@/components/home/HomeGuideDrawer.vue'
import { HOME_LINKS, HOME_MORE, HOME_RULE, useHome } from '@/composables/useHome'

const { progress, days, daysWord, hello } = useHome()
const guide = ref(false)

</script>

<template>
  <main class="home">
    <img class="bg" :src="bg" alt="">
    <div class="fade"></div>

    <div class="photos">
      <div class="slot s1"><img :src="photo1" alt="" /></div>
      <div class="slot s2"><img :src="photo2" alt="" /></div>
      <div class="slot s3"><img :src="photo3" alt="" /></div>
      <div class="slot s4"><img :src="photo4" alt="" /></div>
      <div class="slot s5"><img :src="photo5" alt="" /></div>
      <div class="slot s6"><img :src="photo6" alt="" /></div>
    </div>

    <div class="col">
      <div>
        <div class="kicker">오늘의 문장</div>
        <div class="phrase">조금씩, 매일.</div>
        <div class="tr">Понемногу, каждый день.</div>
      </div>
      <div class="mid">
        <nav class="links">
          <RouterLink v-for="l in HOME_LINKS" :key="l.to" :to="l.to">{{ l.title }}<span class="arr">→</span></RouterLink>
        </nav>
        <nav class="more">
          <RouterLink v-for="m in HOME_MORE" :key="m.to" :to="m.to">
            {{ m.title }}<span v-if="!progress.unlocked" class="lock">🔒</span>
          </RouterLink>
        </nav>
        <div class="days">
          <span class="days-num">{{ days }}</span>
          <span class="days-text">{{ daysWord }} с начала пути · с 1 июня</span>
        </div>
        <div class="guide">
          <button class="guide-btn" aria-haspopup="dialog" @click="guide = true">Что здесь есть</button>
        </div>
      </div>
      <div class="foot">
        <RouterLink :to="HOME_RULE.to" class="rule-link">
          <small>{{ HOME_RULE.label }} ↗</small>
          <span class="rule">{{ HOME_RULE.rule }}</span>
        </RouterLink>
        <span class="foot-ex">{{ HOME_RULE.examples }}</span>
      </div>
    </div>

    <RouterLink to="/korean/cabinet" class="hello">
      <Avatar v-if="progress.unlocked" :avatar="progress.data.profile.avatar" :size="32" />
      <span class="hello-txt">
        <b>{{ hello.title }}</b>
        <small>{{ hello.sub }}</small>
      </span>
    </RouterLink>

    <HomeGuideDrawer v-model="guide" />

    <footer class="contact">
      <img :src="dona" alt="">
      <p>По всем вопросам пишите в Telegram:
        <a href="https://t.me/meeymirita" target="_blank" rel="noopener">@meeymirita</a>
      </p>
    </footer>
  </main>
</template>

<style scoped>
.home { position: fixed; inset: 0; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column;
  background: #201e1d; color: #fff; font-family: 'Cormorant Garamond', 'Gowun Batang', serif; }
.home a:hover { color: #5b95e8; }
.home a:focus-visible { outline: 2px solid #5b95e8; outline-offset: 2px; }
.bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fade { position: fixed; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 35%); pointer-events: none; }
.col { position: relative; flex: 1 0 auto; margin: 0 0 0 3.9vw; padding: 5vh 0 1vh; display: flex; flex-direction: column;
  justify-content: space-between; gap: 24px; }
.kicker { font-size: 16px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; }
.phrase { font-size: clamp(28px, 4.4vh, 40px); font-weight: 500; margin: 6px 0; }
.tr { font-size: 23px; }
.links { display: grid; width: max-content; gap: 6px; }
.links a { display: flex; align-items: center; justify-content: space-between; gap: .7em; font-size: clamp(32px, 4.2vh, 38px); font-weight: 500; line-height: 1.15; }
.links .arr { font-size: .8em; opacity: .9; line-height: 1; }
.more { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-top: 18px; max-width: 520px; }
.more a { font-size: 25px; font-weight: 500; }
.lock { margin-left: 6px; font-size: 13px; opacity: .8; }
.days { display: flex; align-items: baseline; gap: 10px; margin-top: 18px; }
.days-num { font-variant-numeric: lining-nums; font-size: 44px; font-weight: 500; line-height: 1; color: #3b77d0; }
.days-text { font-size: 18px; }
.foot { display: flex; align-items: flex-end; gap: 24px; border-top: 2px solid #fff; padding-top: 12px; width: min(560px, 60vw); font-size: 21px; }
.rule-link { display: flex; flex-direction: column; gap: 2px; flex: 0 0 200px; }
.foot-ex { flex: 1; min-width: 0; word-break: keep-all; }
.rule-link small { font-size: 14px; opacity: .75; }
.rule { font-weight: 500; }

.guide { margin-top: 20px; }
.guide-btn { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border: 1px solid rgba(255,255,255,.55); border-radius: 0;
  background: rgba(0,0,0,.25); color: #fff; font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; }
.guide-btn:hover { border-color: #5b95e8; color: #5b95e8; }
.hello { position: fixed; right: 2.8vw; bottom: calc(56px + 1vh); z-index: 2; display: flex; align-items: center; gap: 10px;
  max-width: 60vw; text-align: right; }
.hello-txt { display: flex; flex-direction: column; align-items: flex-end; min-width: 0; }
.hello-txt b { font-size: 16px; font-weight: 500; line-height: 1.15; overflow-wrap: anywhere; }
.hello-txt small { margin-top: 2px; font-size: 13px; opacity: .8; }

.contact { position: fixed; right: 2.8vw; bottom: 1.2vh; z-index: 2; display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 0;
  font-size: 14px; }
.contact img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.contact p { margin: 0; }
.contact a { color: #ec3013; font-weight: 500; }
.contact a:hover { text-decoration: underline; }

/* Фото уголком: сверху три (s5, s1, s2), правее всех s2 в самом углу, под ним вниз s3, s4, s6.
   Размер блока крутить здесь:
   --pw  ширина всего блока (3 колонки)
   --ph  высота всего блока (4 ряда)
   --pgap  расстояние между фото
   Положение: top и right в .photos. У каждого фото свои --zoom, --x, --y (см. .s1 … .s6 ниже). */
.photos { --pw: min(53vw, 790px); --ph: 66vh; --pgap: 10px;
  position: fixed; z-index: 1; top: 1.4vh; right: .8vw; width: var(--pw); height: var(--ph); display: grid; gap: var(--pgap);
  grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(4, 1fr); }
.slot { overflow: hidden; min-height: 0; border: 2px solid rgba(255,255,255,.6); }
.slot img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: var(--x, 50%) var(--y, 50%);
  transform: scale(var(--zoom, 1)); transform-origin: var(--x, 50%) var(--y, 50%); }
.s5 { grid-column: 1; grid-row: 1; --x: 50%; --y: 50%; }
.s1 { grid-column: 2; grid-row: 1; --x: 55%; --y: 40%; }
.s2 { grid-column: 3; grid-row: 1; --x: 30%; --y: 30%; }
.s3 { grid-column: 3; grid-row: 2; --x: 50%; --y: 40%; }
.s4 { grid-column: 3; grid-row: 3; --x: 50%; --y: 30%; }
.s6 { grid-column: 3; grid-row: 4; --x: 50%; --y: 50%; }
@media (max-width: 900px) { .photos { display: none; } }
@media (max-width: 700px) {
  .hello { position: relative; right: auto; bottom: auto; order: 1; align-self: flex-end; margin: 0 16px 16px; }
  .col { margin-left: 16px; padding-top: 24px; }
  .foot { width: calc(100vw - 100px); flex-wrap: wrap; gap: 4px 16px; }
  .contact { position: relative; right: auto; bottom: auto; justify-content: center; padding: 10px 16px; order: 2; flex-wrap: wrap; text-align: center; }
}
</style>
