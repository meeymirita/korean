<script setup lang="ts">
import coinImg from '@/assets/icons/coin.webp'
import yunaImg from '@/assets/icons/shop-yuna.webp'
import bg from '@/assets/game/bg.webp'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useShopPage } from '@/composables/useShopPage'
import { ITEMS, LOG_KINDS, SURPRISES } from '@/data/shop'

const { shop, st, coins, rows, kind, when, pct, isActive, goalText, dailyDone, buy, turnOn } = useShopPage()
const bgStyle = { '--shx-bg': `url(${bg})` }
</script>

<template>
  <div class="wrap">
    <SectionHead id="shop" />
    <div class="shx" :style="bgStyle">
      <aside class="shx-side">
        <img class="shx-yuna" :src="yunaImg" alt="" />
        <div class="shx-bal">
          <small>Твой баланс</small>
          <b><img :src="coinImg" alt="" />{{ coins }}</b>
          <span v-if="st && st.combo >= 2">Серия верных подряд: {{ st.combo }}</span>
        </div>
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
                <button v-if="it.id === 'shield' || it.id === 'double'" type="button" class="shx-btn ghost" :disabled="shop.busy || !shop.count(it.id) || isActive(it.id)" @click="turnOn(it.id)">{{ isActive(it.id) ? 'Включено' : 'Включить' }}</button>
                <button type="button" class="shx-btn" :disabled="shop.busy || coins < it.price" :aria-label="`Купить: ${it.name}`" @click="buy(it)">Купить</button>
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
                <button type="button" class="shx-btn" :disabled="shop.busy || coins < it.price" @click="buy(it)">Открыть</button>
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
                <span>{{ goalText(g) }}</span>
              </li>
              <li :class="{ done: st.dailyAll.paid }">
                <div><b>Все задания дня</b><small>бонус · +{{ st.dailyAll.coins }}</small></div>
                <div class="shx-bar"><i :style="{ width: st.dailyAll.paid ? '100%' : (dailyDone / 3) * 100 + '%' }"></i></div>
                <span>{{ st.dailyAll.paid ? 'получено' : `${dailyDone} из 3` }}</span>
              </li>
              <li :class="{ done: st.week.paid }">
                <div><b>{{ st.week.name }}</b><small>неделя · +{{ st.week.coins }}</small></div>
                <div class="shx-bar"><i :style="{ width: pct(st.week) + '%' }"></i></div>
                <span>{{ goalText(st.week) }}</span>
              </li>
            </ul>
          </section>
          <section class="shx-panel">
            <h2>Достижения</h2>
            <ul class="shx-goals">
              <li v-for="g in st.ach" :key="g.id" :class="{ done: g.paid }">
                <div><b>{{ g.name }}</b><small>{{ g.text }} · +{{ g.coins }}</small></div>
                <div class="shx-bar"><i :style="{ width: pct(g) + '%' }"></i></div>
                <span>{{ goalText(g) }}</span>
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
.study .shx { --pur: #5b2f9a; display: grid; grid-template-columns: 250px 1fr; gap: 20px; align-items: start; margin-top: 18px; padding: 20px; border-radius: 28px; background: var(--shx-bg) center / cover, #efe3ff; }
.study .shx-side { position: sticky; top: 16px; display: grid; gap: 14px; justify-items: center; }
.study .shx-yuna { width: 100%; max-width: 230px; height: auto; filter: drop-shadow(0 10px 18px rgba(91, 47, 154, .25)); }
.study .shx-bal { width: 100%; display: grid; gap: 4px; justify-items: center; padding: 14px 16px; text-align: center; background: rgba(255, 255, 255, .72); border: 2px solid #fff; border-radius: 36px; box-shadow: 0 10px 28px rgba(91, 47, 154, .22); backdrop-filter: blur(10px); }
.study .shx-bal small { font-size: 15px; font-weight: 600; color: var(--pur); }
.study .shx-bal b { display: inline-flex; align-items: center; gap: 10px; font-size: 40px; font-weight: 700; line-height: 1; color: var(--pur); font-variant-numeric: lining-nums; }
.study .shx-bal b img { width: 46px; height: 46px; object-fit: contain; }
.study .shx-bal span { font-size: 12px; color: #7d5ab5; }
.study .shx-main { display: grid; gap: 18px; min-width: 0; }
.study .shx-panel { padding: 18px 20px; background: rgba(255, 255, 255, .68); border: 2px solid rgba(255, 255, 255, .9); border-radius: 26px; box-shadow: 0 12px 30px rgba(91, 47, 154, .16); backdrop-filter: blur(12px); }
.study .shx-panel h2 { margin: 0 0 14px; font-size: 26px; font-weight: 600; color: var(--pur); }
.study .shx-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.study .shx-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.study .shx-card { display: grid; grid-template-columns: 76px 1fr; gap: 6px 12px; align-items: start; padding: 14px; background: rgba(255, 255, 255, .85); border-radius: 20px; box-shadow: 0 4px 14px rgba(91, 47, 154, .1); }
.study .shx-card > img { width: 76px; height: 76px; object-fit: contain; }
.study .shx-card h3 { margin: 0 0 4px; font-size: 18px; font-weight: 600; color: #2d1559; }
.study .shx-card p { margin: 0; font-size: 12.5px; line-height: 1.45; color: #4a3a6a; }
.study .shx-card footer { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; padding: 6px 8px; background: rgba(237, 226, 255, .7); border-radius: 14px; }
.study .shx-price { display: inline-flex; align-items: center; gap: 6px; font-size: 18px; font-weight: 700; color: var(--pur); }
.study .shx-price img { width: 24px; height: 24px; object-fit: contain; }
.study .shx-card footer small { margin-right: auto; font-size: 12px; color: #7d5ab5; }
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
@media (max-width: 980px) { .study .shx { grid-template-columns: 1fr; } .study .shx-side { position: static; grid-template-columns: 130px 1fr; align-items: center; } .study .shx-grid.three, .study .shx-two { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .study .shx { padding: 12px; } .study .shx-grid { grid-template-columns: 1fr; } .study .shx-side { grid-template-columns: 1fr; } .study .shx-log li { grid-template-columns: 1fr auto; } .study .shx-log .when { grid-column: 1 / -1; } }
</style>
