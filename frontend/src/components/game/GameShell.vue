<script setup lang="ts">
import { computed, nextTick } from 'vue'
import GameHelp from '@/components/game/GameHelp.vue'
import GameIcon from '@/components/game/GameIcon.vue'
import GameStats from '@/components/game/GameStats.vue'
import type { GameView } from '@/game/view'

/**
 * Оболочка игры «Хлебушек»: поле задания (`#card` заполняет движок), кнопки, настройки, счёт справа, окна итога и справки.
 * Все данные приходят в `view` (его пишет `initGame`), все действия уходят в `view.actions`.
 */
const props = defineProps<{ view: GameView }>()
const a = computed(() => props.view.actions)

/** Если движок не принял выбор (например, во время блица), список возвращается к прежнему значению. */
function pick(e: Event, apply: (v: string) => void, current: () => string | number) {
  const el = e.target as HTMLSelectElement
  apply(el.value)
  void nextTick(() => (el.value = String(current())))
}
function toggleCat(e: Event, id: string) {
  const el = e.target as HTMLInputElement
  a.value.toggleCat(id, el.checked)
  el.checked = !!props.view.cats.find(c => c.id === id)?.on
}
</script>

<template>
  <div class="gx-body">
    <div class="gx-center">
      <section id="cardWrap" class="card">
        <div id="timer" class="timer" :class="{ on: view.timer.on }"><i id="timerBar" :style="{ width: view.timer.pct + '%' }"></i></div>
        <div id="lives" class="lives" :class="{ on: view.lives.on }">{{ view.lives.text }}</div>
        <div id="card"></div>
      </section>
      <div class="gx-actions">
        <button id="refreshBtn" class="ghost" type="button" @click="a.refresh()"><GameIcon name="wand" /> Обновить вопрос</button>
        <button id="blitzBtn" class="ghost" type="button" @click="a.toggleBlitz()">
          <template v-if="view.blitzOn"><span class="gi">⏹</span> Остановить блиц</template>
          <template v-else><GameIcon name="rocket" /> Блиц {{ view.blitzSecs }} секунд</template>
        </button>
        <button id="survBtn" class="ghost" type="button" @click="a.toggleSurv()">
          <template v-if="view.survOn"><span class="gi">⏹</span> Остановить выживание</template>
          <template v-else><GameIcon name="heart" /> На выживание</template>
        </button>
        <button id="helpBtn" class="helpbtn" type="button" @click="a.openHelp()"><GameIcon name="book" /> Как играть</button>
      </div>
      <details class="set">
        <summary>Настройки</summary>
        <div class="setgrp">
          <h4>Какие слова брать</h4>
          <div id="cats" class="chips">
            <label v-for="c in view.cats" :key="c.id" :class="{ on: c.on }"><input type="checkbox" :checked="c.on" @change="toggleCat($event, c.id)" /> {{ c.name }} ({{ c.count }})</label>
          </div>
        </div>
        <div class="setgrp">
          <h4>Формы глаголов</h4>
          <select id="tense" :value="view.tense" @change="pick($event, a.setTense, () => view.tense)">
            <option value="both">настоящее и прошедшее</option>
            <option value="pres">только настоящее</option>
            <option value="past">только прошедшее</option>
          </select>
          <select id="fut" :value="view.fut" @change="pick($event, a.setFut, () => view.fut)">
            <option value="on">будущее (거예요) у глаголов: да</option>
            <option value="off">будущее: нет</option>
          </select>
        </div>
        <div class="setgrp">
          <h4>Блиц и выживание</h4>
          <select id="blitzSecs" :value="view.blitzSecs" @change="pick($event, v => a.setBlitzSecs(+v), () => view.blitzSecs)">
            <option value="30">Блиц: 30 секунд</option>
            <option value="60">Блиц: 60 секунд</option>
            <option value="120">Блиц: 120 секунд</option>
          </select>
          <select id="survLives" :value="view.survLives" @change="pick($event, v => a.setSurvLives(+v), () => view.survLives)">
            <option value="3">Выживание: 3 жизни</option>
            <option value="5">Выживание: 5 жизней</option>
            <option value="0">Выживание: без ограничения</option>
          </select>
        </div>
        <div class="setgrp">
          <h4>Подсказки и ход игры</h4>
          <div class="chips">
            <label id="lbRead" :class="{ on: view.reading }"><input id="cbRead" type="checkbox" :checked="view.reading" @change="a.setReading(($event.target as HTMLInputElement).checked)" /> показывать чтение (кириллицей)</label>
          </div>
        </div>
        <div class="setgrp"><button id="resetBtn" class="ghost" type="button" @click="a.resetStats()">Сбросить статистику игры</button></div>
        <p class="muted" style="font-size: 13px">Ошибки возвращаются чаще: слово, в котором ошибся, выпадает с большей вероятностью, пока не ответишь верно. Клавиши 1–4 выбирают ответ, Enter идёт дальше.</p>
      </details>
    </div>

    <GameStats :view="view" />
  </div>

  <div id="over" class="over" :class="{ on: view.over.on }">
    <div class="box" role="dialog" aria-modal="true" aria-labelledby="overT">
      <h2 id="overT">{{ view.over.title }}</h2>
      <div id="overBig" class="big">{{ view.over.big }}</div>
      <p id="overTxt" class="muted">{{ view.over.text }}</p>
      <div style="display: flex; gap: 8px; justify-content: center; margin-top: 12px">
        <button id="overAgain" class="primary" type="button" @click="a.overAgain()">Ещё раз</button>
        <button id="overClose" class="ghost" type="button" @click="a.overClose()">Закрыть</button>
      </div>
    </div>
  </div>
  <GameHelp :open="view.help" @close="a.closeHelp()" />
  <div id="toast" class="toast" :class="{ on: view.toast.on }">{{ view.toast.text }}</div>
</template>
