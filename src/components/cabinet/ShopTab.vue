<script setup lang="ts">
import coinImg from '@/assets/icons/coin.webp'
import yunaImg from '@/assets/icons/shop-yuna.webp'
import { useShopPage } from '@/composables/useShopPage'
import { ITEMS, LOG_KINDS, SURPRISES } from '@/data/shop'

const { shop, st, coins, rows, kind, when, pct, isActive, goalText, buy, turnOn } = useShopPage()
</script>

<template>
  <div class="shp">
    <section class="shp-top">
      <img class="shp-yuna" :src="yunaImg" alt="" />
      <div class="shp-bal">
        <small>Твой баланс</small>
        <b><img :src="coinImg" alt="" />{{ coins }}</b>
        <span v-if="st">Серия верных подряд: {{ st.combo }}</span>
      </div>
    </section>

    <section class="pg-card shp-box">
      <h3>Предметы для игры</h3>
      <div class="shp-grid">
        <article v-for="it in ITEMS" :key="it.id" class="shp-item">
          <img :src="it.icon" alt="" />
          <div class="shp-info">
            <h4>{{ it.name }}</h4>
            <p>{{ it.text }}</p>
          </div>
          <div class="shp-foot">
            <span class="shp-price"><img :src="coinImg" alt="" />{{ it.price }}</span>
            <span class="shp-have">у тебя: {{ shop.count(it.id) }}</span>
            <button v-if="it.id === 'shield' || it.id === 'double'" type="button" class="shp-btn soft" :disabled="shop.pending === it.id || !shop.count(it.id) || isActive(it.id)" @click="turnOn(it.id)">{{ isActive(it.id) ? 'Включено' : 'Включить' }}</button>
            <button type="button" class="shp-btn" :disabled="shop.pending === it.id || coins < it.price" @click="buy(it)">Купить</button>
          </div>
        </article>
      </div>
      <p class="shp-rule"><b>Как это работает.</b> Подсказка, 50/50, повтор и второй шанс применяются прямо в задании, кнопками над ответами. Защиту опыта и двойную награду включай здесь перед серией. Предметы работают в тренажёрах (частицы, перевод, пары, 5 минут, ошибки).</p>
    </section>

    <section class="pg-card shp-box">
      <h3>Сюрпризы Юны</h3>
      <div class="shp-grid three">
        <article v-for="it in SURPRISES" :key="it.id" class="shp-item">
          <img :src="it.icon" alt="" />
          <div class="shp-info">
            <h4>{{ it.name }}</h4>
            <p>{{ it.text }}</p>
          </div>
          <div class="shp-foot">
            <span class="shp-price"><img :src="coinImg" alt="" />{{ it.price }}</span>
            <button type="button" class="shp-btn" :disabled="shop.pending === it.id || coins < it.price" @click="buy(it)">Открыть</button>
          </div>
        </article>
      </div>
    </section>

    <section v-if="st" class="pg-card shp-box">
      <h3>Задания</h3>
      <ul class="shp-goals">
        <li v-for="g in st.daily" :key="g.id" :class="{ done: g.paid }">
          <div><b>{{ g.name }}</b><small>сегодня · +{{ g.coins }} <img :src="coinImg" alt="" /></small></div>
          <div class="shp-bar"><i :style="{ width: pct(g) + '%' }"></i></div>
          <button v-if="g.ready" type="button" class="shp-claim" :disabled="shop.pending === g.ref" @click="shop.claim(g)">Получить</button><span v-else>{{ goalText(g) }}</span>
        </li>
        <li :class="{ done: st.dailyAll.paid }">
          <div><b>Все задания дня</b><small>бонус · +{{ st.dailyAll.coins }} <img :src="coinImg" alt="" /></small></div>
          <div class="shp-bar"><i :style="{ width: st.dailyAll.paid ? '100%' : (st.daily.filter(g => g.now >= g.goal).length / 3) * 100 + '%' }"></i></div>
          <button v-if="st.dailyAll.ready" type="button" class="shp-claim" :disabled="shop.pending === st.dailyAll.ref" @click="shop.claim(st.dailyAll)">Получить</button><span v-else>{{ st.dailyAll.paid ? 'получено' : `${st.daily.filter(g => g.now >= g.goal).length} из 3` }}</span>
        </li>
        <li :class="{ done: st.week.paid }">
          <div><b>{{ st.week.name }}</b><small>неделя · +{{ st.week.coins }} <img :src="coinImg" alt="" /></small></div>
          <div class="shp-bar"><i :style="{ width: pct(st.week) + '%' }"></i></div>
          <button v-if="st.week.ready" type="button" class="shp-claim" :disabled="shop.pending === st.week.ref" @click="shop.claim(st.week)">Получить</button><span v-else>{{ goalText(st.week) }}</span>
        </li>
      </ul>
    </section>

    <section v-if="st" class="pg-card shp-box">
      <h3>Достижения</h3>
      <ul class="shp-goals">
        <li v-for="g in st.ach" :key="g.id" :class="{ done: g.paid }">
          <div><b>{{ g.name }}</b><small>{{ g.text }} · +{{ g.coins }} <img :src="coinImg" alt="" /></small></div>
          <div class="shp-bar"><i :style="{ width: pct(g) + '%' }"></i></div>
          <button v-if="g.ready" type="button" class="shp-claim" :disabled="shop.pending === g.ref" @click="shop.claim(g)">Получить</button><span v-else>{{ goalText(g) }}</span>
        </li>
      </ul>
    </section>

    <section class="pg-card shp-box">
      <h3>История монеток</h3>
      <div class="shp-chips">
        <button v-for="[k, label] in LOG_KINDS" :key="k" type="button" class="shp-chip" :class="{ on: kind === k }" @click="kind = k">{{ label }}</button>
      </div>
      <p v-if="!rows.length" class="shp-empty">Здесь пока пусто.</p>
      <ul v-else class="shp-log">
        <li v-for="(r, i) in rows" :key="i">
          <span class="when">{{ when(r.t) }}</span>
          <span class="why">{{ r.reason }}</span>
          <b :class="r.amount > 0 ? 'plus' : r.amount < 0 ? 'minus' : ''">{{ r.amount > 0 ? '+' : '' }}{{ r.amount || '·' }}</b>
        </li>
      </ul>
    </section>
  </div>
</template>
