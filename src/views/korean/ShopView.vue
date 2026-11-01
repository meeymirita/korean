<script setup lang="ts">
import coinImg from '@/assets/icons/coin.webp'
import yunaImg from '@/assets/icons/shop-yuna.webp'
import { sectionById } from '@/data/korean/sections'
import { useShopPage } from '@/composables/useShopPage'
import { ITEMS, LOG_KINDS, SURPRISES } from '@/data/shop'

const { shop, st, coins, rows, kind, when, pct, isActive, goalText, dailyDone, buy, turnOn } = useShopPage()
const s = sectionById('shop')
</script>

<template>
  <div class="wrap shx-wrap">
    <header class="page-head shx-head">
      <div>
        <div class="kicker">{{ s.num }} — {{ s.kicker }}</div>
        <div class="shx-titlerow">
          <h1>{{ s.title }}</h1>
          <span class="shx-sub">{{ s.sub }}</span>
          <span class="shx-help" tabindex="0" role="button" aria-label="Как пользоваться магазином">
            ?
            <span class="shx-tip" role="tooltip">
              <b>Как это работает</b>
              <span><i>Монетки.</i> Дают за верные ответы (2 монетки, до 300 в день), 5 и 10 верных подряд, завершённую серию, задания дня и достижения. Ошибка монетки не отнимает.</span>
              <span><i>Подсказка, 50/50, Повтор вопроса, Второй шанс.</i> Купи, и в задании над ответами появятся кнопки с этими предметами (только если они у тебя есть). «Второй шанс» предложит исправить неверный ответ, «Повтор» отложит вопрос в конец серии.</span>
              <span><i>Защита опыта и Двойная награда.</i> Нажми «Включить» здесь, потом пройди серию: защита отменит одно списание очков за ошибку, двойная удвоит монетки за верные ответы в одной серии.</span>
              <span><i>Где работают.</i> В тренажёрах: «5 минут», «Частицы и окончания», «Похожие, но разные», «Переведи предложение», «Мои ошибки». В «Найди пару», «Собери по слогам» и игре «Хлебушек» предметов пока нет.</span>
              <span><i>Сюрпризы.</i> Открываются сразу после покупки: набор из 3–5 предметов, сундук с 60–110 монетками или пять подсказок.</span>
            </span>
          </span>
          <span class="shx-hbal" title="Твой баланс"><img :src="coinImg" alt="" />{{ coins }}</span>
        </div>
      </div>
    </header>
    <div class="shx">
      <aside class="shx-side">
        <img class="shx-yuna" :src="yunaImg" alt="" />
      </aside>

      <div class="shx-main">
        <section class="shx-panel">
          <h2>Предметы для игры</h2>
          <div class="shx-grid">
            <article v-for="it in ITEMS" :key="it.id" class="shx-card">
              <img :src="it.icon" alt="" />
              <div>
                <h3>{{ it.name }}</h3>
                <p>{{ it.text }}</p>
              </div>
              <footer>
                <span class="shx-price"><img :src="coinImg" alt="" />{{ it.price }}</span>
                <small>у тебя: {{ shop.count(it.id) }}</small>
                <button v-if="it.id === 'shield' || it.id === 'double'" type="button" class="shx-btn ghost" :disabled="shop.pending === it.id || !shop.count(it.id) || isActive(it.id)" @click="turnOn(it.id)">{{ isActive(it.id) ? 'Включено' : 'Включить' }}</button>
                <button type="button" class="shx-btn" :disabled="shop.pending === it.id || coins < it.price" :aria-label="`Купить: ${it.name}`" @click="buy(it)">Купить</button>
              </footer>
            </article>
          </div>
          <p class="shx-rule"><b>Правила использования.</b> Подсказка, 50/50, повтор и второй шанс применяются в задании кнопками над ответами и показываются, только если предмет есть. Защиту опыта и двойную награду включай здесь перед серией. Работают в тренажёрах.</p>
        </section>

        <section class="shx-panel">
          <h2>Сюрпризы Юны</h2>
          <div class="shx-grid three">
            <article v-for="it in SURPRISES" :key="it.id" class="shx-card">
              <img :src="it.icon" alt="" />
              <div>
                <h3>{{ it.name }}</h3>
                <p>{{ it.text }}</p>
              </div>
              <footer>
                <span class="shx-price"><img :src="coinImg" alt="" />{{ it.price }}</span>
                <button type="button" class="shx-btn" :disabled="shop.pending === it.id || coins < it.price" @click="buy(it)">Открыть</button>
              </footer>
            </article>
          </div>
        </section>

        <div v-if="st" class="shx-two">
          <section class="shx-panel">
            <h2>Задания</h2>
            <ul class="shx-goals">
              <li v-for="g in st.daily" :key="g.id" :class="{ done: g.paid }">
                <div><b>{{ g.name }}</b><small>сегодня · +{{ g.coins }}</small></div>
                <div class="shx-bar"><i :style="{ width: pct(g) + '%' }"></i></div>
                <button v-if="g.ready" type="button" class="shx-claim" :disabled="shop.pending === g.ref" @click="shop.claim(g)">Получить</button><span v-else>{{ goalText(g) }}</span>
              </li>
              <li :class="{ done: st.dailyAll.paid }">
                <div><b>Все задания дня</b><small>бонус · +{{ st.dailyAll.coins }}</small></div>
                <div class="shx-bar"><i :style="{ width: st.dailyAll.paid ? '100%' : (dailyDone / 3) * 100 + '%' }"></i></div>
                <button v-if="st.dailyAll.ready" type="button" class="shx-claim" :disabled="shop.pending === st.dailyAll.ref" @click="shop.claim(st.dailyAll)">Получить</button><span v-else>{{ st.dailyAll.paid ? 'получено' : `${dailyDone} из 3` }}</span>
              </li>
              <li :class="{ done: st.week.paid }">
                <div><b>{{ st.week.name }}</b><small>неделя · +{{ st.week.coins }}</small></div>
                <div class="shx-bar"><i :style="{ width: pct(st.week) + '%' }"></i></div>
                <button v-if="st.week.ready" type="button" class="shx-claim" :disabled="shop.pending === st.week.ref" @click="shop.claim(st.week)">Получить</button><span v-else>{{ goalText(st.week) }}</span>
              </li>
            </ul>
          </section>
          <section class="shx-panel">
            <h2>Достижения</h2>
            <ul class="shx-goals">
              <li v-for="g in st.ach" :key="g.id" :class="{ done: g.paid }">
                <div><b>{{ g.name }}</b><small>{{ g.text }} · +{{ g.coins }}</small></div>
                <div class="shx-bar"><i :style="{ width: pct(g) + '%' }"></i></div>
                <button v-if="g.ready" type="button" class="shx-claim" :disabled="shop.pending === g.ref" @click="shop.claim(g)">Получить</button><span v-else>{{ goalText(g) }}</span>
              </li>
            </ul>
          </section>
        </div>

        <section class="shx-panel">
          <h2>История монеток</h2>
          <div class="shx-chips">
            <button v-for="[k, label] in LOG_KINDS" :key="k" type="button" :class="{ on: kind === k }" @click="kind = k">{{ label }}</button>
          </div>
          <p v-if="!rows.length" class="shx-empty">Здесь пока пусто.</p>
          <ul v-else class="shx-log">
            <li v-for="(r, i) in rows" :key="i">
              <span class="when">{{ when(r.t) }}</span>
              <span>{{ r.reason }}</span>
              <b :class="r.amount > 0 ? 'plus' : r.amount < 0 ? 'minus' : ''">{{ r.amount > 0 ? '+' : '' }}{{ r.amount || '·' }}</b>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style>
/* страница «Магазин»: стеклянные панели на фоне сакуры, фиолетовые акценты (как макет «Магазин Юны») */
.study .shx { --pur: #5b2f9a; display: grid; grid-template-columns: clamp(260px, 30vw, 480px) 1fr; gap: 20px; align-items: start; margin-top: 18px; padding: 20px; border-radius: 28px; }
.study .shx-side { position: sticky; top: 16px; display: grid; gap: 14px; justify-items: center; }
.study .shx-yuna { width: auto; max-width: 100%; max-height: 88vh; object-fit: contain; height: auto; filter: drop-shadow(0 10px 18px rgba(91, 47, 154, .25)); }
.study .shx-bal { width: 100%; display: grid; gap: 4px; justify-items: center; padding: 14px 16px; text-align: center; background: rgba(255, 255, 255, .72); border: 2px solid #fff; border-radius: 36px; box-shadow: 0 10px 28px rgba(91, 47, 154, .22); backdrop-filter: blur(10px); }
.study .shx-bal small { font-size: 15px; font-weight: 600; color: var(--pur); }
.study .shx-bal b { display: inline-flex; align-items: center; gap: 10px; font-size: 40px; font-weight: 700; line-height: 1; color: var(--pur); font-variant-numeric: lining-nums; }
.study .shx-bal b img { width: 46px; height: 46px; object-fit: contain; }
.study .shx-bal span { font-size: 12px; color: #7d5ab5; }
.study .shx-main { display: grid; gap: 18px; min-width: 0; }
.study .shx-panel { padding: 18px 20px; background: rgba(255, 255, 255, .68); border: 2px solid rgba(255, 255, 255, .9); border-radius: 26px; box-shadow: 0 12px 30px rgba(91, 47, 154, .16); backdrop-filter: blur(12px); }
.study .shx-panel h2 { margin: 0 0 14px; font-size: 26px; font-weight: 600; color: var(--pur); }
.study .shx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.study .shx-grid.three { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
.study .shx-card { display: grid; grid-template-columns: 76px 1fr; grid-template-rows: 1fr auto; gap: 6px 12px; align-items: start; padding: 14px; background: rgba(255, 255, 255, .85); border-radius: 20px; box-shadow: 0 4px 14px rgba(91, 47, 154, .1); }
.study .shx-card > img { width: 76px; height: 76px; object-fit: contain; }
.study .shx-card h3 { margin: 0 0 4px; font-size: 18px; font-weight: 600; color: #2d1559; }
.study .shx-card p { margin: 0; font-size: 12.5px; line-height: 1.45; color: #4a3a6a; }
.study .shx-card footer { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 6px 8px; background: rgba(237, 226, 255, .7); border-radius: 14px; }
.study .shx-price { display: inline-flex; align-items: center; gap: 6px; font-size: 18px; font-weight: 700; color: var(--pur); }
.study .shx-price img { width: 24px; height: 24px; object-fit: contain; }
.study .shx-card footer small { margin-right: auto; font-size: 12px; color: #7d5ab5; }
.study .shx-card footer .shx-btn:last-child { margin-left: auto; }
.study .shx-btn { padding: 6px 20px; font: inherit; font-size: 14px; font-weight: 600; color: #fff; background: linear-gradient(180deg, #9a6cf0, #7b4fd6); border: 0; border-radius: 12px; box-shadow: 0 3px 8px rgba(91, 47, 154, .35); cursor: pointer; }
.study .shx-btn.ghost { color: var(--pur); background: rgba(154, 108, 240, .18); box-shadow: none; }
.study .shx-btn:disabled { opacity: .45; cursor: default; }
.study .shx-rule { margin: 14px 0 0; padding: 10px 16px; font-size: 13px; line-height: 1.5; color: #3b2a60; background: rgba(255, 255, 255, .7); border-radius: 18px; }
.study .shx-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.study .shx-goals { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.study .shx-goals li { display: grid; grid-template-columns: 1fr 70px; gap: 4px 10px; align-items: center; padding: 8px 12px; background: rgba(255, 255, 255, .85); border-radius: 14px; }
.study .shx-goals li.done { background: rgba(200, 238, 214, .85); }
.study .shx-goals b { display: block; font-size: 14px; font-weight: 600; color: #2d1559; }
.study .shx-goals small { font-size: 11.5px; color: #7d5ab5; }
.study .shx-goals li > span { font-size: 12px; text-align: right; color: #7d5ab5; }
.study .shx-bar { grid-column: 1 / -1; order: 3; height: 7px; background: rgba(154, 108, 240, .2); border-radius: 7px; overflow: hidden; }
.study .shx-bar i { display: block; height: 100%; background: linear-gradient(90deg, #f8b9e9, #9a6cf0); border-radius: 7px; }
.study .shx-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.study .shx-chips button { padding: 5px 14px; font: inherit; font-size: 13px; color: var(--pur); background: rgba(255, 255, 255, .7); border: 1px solid rgba(154, 108, 240, .35); border-radius: 18px; cursor: pointer; }
.study .shx-chips button.on { color: #fff; background: #7b4fd6; border-color: #7b4fd6; }
.study .shx-empty { margin: 0; font-size: 14px; color: #4a3a6a; }
.study .shx-log { list-style: none; margin: 0; padding: 0; display: grid; max-height: 380px; overflow: auto; }
.study .shx-log li { display: grid; grid-template-columns: 120px 1fr auto; gap: 12px; padding: 8px 4px; font-size: 14px; color: #2d1559; border-bottom: 1px solid rgba(154, 108, 240, .2); }
.study .shx-log .when { font-size: 12px; color: #7d5ab5; }
.study .shx-log .plus { color: #2f8f5b; }
.study .shx-log .minus { color: #c0508a; }
@media (max-height: 900px) { .study .shx-side { position: static; } }
@media (max-width: 980px) { .study .shx { grid-template-columns: 1fr; } .study .shx-side { position: static; grid-template-columns: 130px 1fr; align-items: center; } .study .shx-two { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .study .shx { padding: 12px; } .study .shx-grid, .study .shx-grid.three { grid-template-columns: 1fr; } .study .shx-side { grid-template-columns: 1fr; } .study .shx-log li { grid-template-columns: 1fr auto; } .study .shx-log .when { grid-column: 1 / -1; } }

.study .shx-head .shx-titlerow { position: relative; display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; }
.study .shx-head h1 { margin: 0; }
.study .shx-sub { font-size: 15px; color: var(--muted); }
.study .shx-help { position: static; display: inline-flex; align-items: center; justify-content: center; align-self: center; width: 28px; height: 28px; font-size: 16px; font-weight: 700; color: #5b2f9a; background: rgba(154, 108, 240, .16); border: 1px solid rgba(154, 108, 240, .4); border-radius: 50%; cursor: help; outline: none; }
.study .shx-tip { position: absolute; z-index: 40; left: 0; top: calc(100% + 10px); display: none; flex-direction: column; gap: 8px; width: min(460px, 100%); box-sizing: border-box; padding: 14px 16px; font-size: 13px; font-weight: 400; line-height: 1.5; text-align: left; color: #2d1559; background: #fff; border: 1px solid rgba(154, 108, 240, .35); border-radius: 16px; box-shadow: 0 16px 40px rgba(91, 47, 154, .28); }
.study .shx-tip b { font-size: 15px; font-weight: 600; }
.study .shx-tip i { font-style: normal; font-weight: 600; color: #5b2f9a; }
.study .shx-help:hover .shx-tip, .study .shx-help:focus .shx-tip, .study .shx-help:focus-within .shx-tip { display: flex; }
html[data-theme='dark'] .study .shx-tip { color: #efe6ff; background: #25214a; }
html[data-theme='dark'] .study .shx-tip i { color: #cdb4ff; }
/* на этой странице общие отступы и скругление обёртки не нужны: как было до правки */
.study-shell.sky .study-main .wrap.shx-wrap { border: 1px solid #fff; border-radius: 28px; -webkit-backdrop-filter: none; backdrop-filter: none; padding: 18px 8px 64px; margin: 0 auto; }
.study .shx-claim { justify-self: end; padding: 4px 14px; font: inherit; font-size: 13px; font-weight: 600; color: #fff; background: linear-gradient(180deg, #9a6cf0, #7b4fd6); border: 0; border-radius: 12px; box-shadow: 0 3px 8px rgba(91, 47, 154, .35); cursor: pointer; animation: shx-pulse 1.8s ease-in-out infinite; }
.study .shx-claim:disabled { opacity: .5; animation: none; }
@keyframes shx-pulse { 50% { box-shadow: 0 0 0 5px rgba(154, 108, 240, .28); } }
@media (prefers-reduced-motion: reduce) { .study .shx-claim { animation: none; } }
.study .shx-hbal { align-self: center; display: inline-flex; align-items: center; gap: 6px; padding: 3px 14px 3px 6px; font-size: 18px; font-weight: 700; color: #5b2f9a; font-variant-numeric: lining-nums; background: rgba(255, 255, 255, .8); border: 1px solid rgba(154, 108, 240, .35); border-radius: 99px; }
.study .shx-hbal img { width: 28px; height: 28px; object-fit: contain; }
</style>
