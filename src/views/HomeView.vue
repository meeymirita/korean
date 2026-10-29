<script setup lang="ts">
import { RouterLink } from 'vue-router'
import '@/assets/home/fonts.css'
import bg from '@/assets/home/bg.jpg'
import dona from '@/assets/home/dona.jpg'
import Avatar from '@/components/Avatar.vue'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()

const START = new Date(2026, 5, 1)
const now = new Date()
const days = Math.max(
  0,
  Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - START.getTime()) / 86_400_000),
)
const plural = (n: number, forms: [string, string, string]) =>
  forms[n % 10 === 1 && n % 100 !== 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 1 : 2]

const more = [
  { title: 'Сегодня', to: '/korean/today' },
  { title: 'Тренажёры', to: '/korean/trainers' },
  { title: 'Игра на слова', to: '/game' },
  { title: 'Мой кабинет', to: '/korean/cabinet' },
]
</script>

<template>
  <main class="home">
    <img class="bg" :src="bg" alt="">
    <div class="fade"></div>
    <div class="vert">한국어</div>

    <div class="col">
      <div>
        <div class="kicker">오늘의 문장</div>
        <div class="phrase">조금씩, 매일.</div>
        <div class="tr">Понемногу, каждый день.</div>
      </div>
      <div class="mid">
        <nav class="links">
          <RouterLink to="/korean/words">Словарь ↗</RouterLink>
          <RouterLink to="/korean/grammar">Грамматика ↗</RouterLink>
          <RouterLink to="/korean/cheat">Памятка ↗</RouterLink>
          <RouterLink to="/korean/reading">Чтение ↗</RouterLink>
        </nav>
        <nav class="more">
          <RouterLink v-for="m in more" :key="m.to" :to="m.to">
            {{ m.title }}<span v-if="!progress.unlocked" class="lock">🔒</span>
          </RouterLink>
        </nav>
        <div class="days">
          <span class="days-num">{{ days }}</span>
          <span class="days-text">{{ plural(days, ['день', 'дня', 'дней']) }} с начала пути · с 1 июня</span>
        </div>
      </div>
      <div class="foot"><span class="rule">-아요/어요</span><span>가요 · 먹어요 · 해요</span></div>
    </div>

    <RouterLink to="/korean/cabinet" class="hello">
      <template v-if="progress.unlocked">
        <Avatar :avatar="progress.data.profile.avatar" :size="32" />
        <span class="hello-txt">
          <b>Привет{{ progress.data.profile.name ? ', ' + progress.data.profile.name : '' }}!</b>
          <small>⭐ Уровень {{ progress.info.level }} · {{ progress.info.title }} · 🔥 {{ progress.streak }}</small>
        </span>
      </template>
      <template v-else>
                  <span class="hello-txt">
          <b>🔒 Войти по токену →</b>
          <small>откроются задания, игра и кабинет</small>
        </span>
      </template>
      </RouterLink>

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
  background: #201e1d; color: #fff; font-family: 'Archivo', 'Noto Sans KR', sans-serif; }
.home a:hover { color: #5b95e8; }
.home a:focus-visible { outline: 2px solid #5b95e8; outline-offset: 2px; }
.bg { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fade { position: fixed; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 35%); pointer-events: none; }
.vert { position: fixed; right: 2.8vw; top: 4.4vh; bottom: 4.4vh; writing-mode: vertical-rl;
  font-size: min(22vh, 14vw); font-weight: 900; line-height: 1; letter-spacing: -.02em; pointer-events: none; }
.col { position: relative; flex: 1 0 auto; margin: 0 0 0 3.9vw; padding: 5vh 0 3vh; display: flex; flex-direction: column;
  justify-content: space-between; gap: 24px; }
.kicker { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; }
.phrase { font-size: clamp(28px, 4.4vh, 40px); font-weight: 800; margin: 6px 0; }
.tr { font-size: 20px; }
.links { display: flex; flex-direction: column; gap: 6px; }
.links a { font-size: clamp(24px, 4.2vh, 38px); font-weight: 900; line-height: 1.15; }
.more { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-top: 18px; max-width: 520px; }
.more a { font-size: 18px; font-weight: 600; }
.lock { margin-left: 6px; font-size: 13px; opacity: .8; }
.days { display: flex; align-items: baseline; gap: 10px; margin-top: 18px; }
.days-num { font-variant-numeric: lining-nums; font-size: 44px; font-weight: 900; line-height: 1; color: #3b77d0; }
.days-text { font-size: 15px; }
.foot { display: flex; gap: 24px; border-top: 2px solid #fff; padding-top: 16px; width: min(480px, 60vw); font-size: 18px; }
.rule { font-weight: 600; }

.hello { position: fixed; right: 2.8vw; bottom: calc(56px + 3vh); z-index: 2; display: flex; align-items: center; gap: 10px;
  max-width: 60vw; text-align: right; }
.hello-txt { display: flex; flex-direction: column; align-items: flex-end; min-width: 0; }
.hello-txt b { font-size: 16px; font-weight: 800; line-height: 1.15; overflow-wrap: anywhere; }
.hello-txt small { margin-top: 2px; font-size: 13px; opacity: .8; }

.contact { position: relative; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 10px 16px;
  font-size: 14px; }
.contact img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.contact p { margin: 0; }
.contact a { color: #ec3013; font-weight: 600; }
.contact a:hover { text-decoration: underline; }

@media (max-width: 700px) {
  .hello { position: relative; right: auto; bottom: auto; order: 1; align-self: flex-end; margin: 0 16px 16px; }
  .col { margin-left: 16px; padding-top: 24px; }
  .foot { width: calc(100vw - 100px); flex-wrap: wrap; gap: 4px 16px; }
  .contact { order: 2; flex-wrap: wrap; text-align: center; }
}
</style>
