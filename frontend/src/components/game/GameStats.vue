<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import GameIcon from '@/components/game/GameIcon.vue'
import { ALLW, MODES } from '@/game/modes'
import { ICON, MODE_ICON } from '@/game/icons'
import type { GameTab, GameView } from '@/game/view'

/** Правая панель игры: счёт, серия, хлебушки, уровень, цель дня и списки «История», «Слабые слова», «Слова», «Рекорды». */
const props = defineProps<{ view: GameView }>()
const TABS: { id: GameTab; name: string }[] = [
  { id: 'hist', name: 'История' },
  { id: 'weak', name: 'Слабые слова' },
  { id: 'words', name: 'Слова' },
  { id: 'records', name: 'Рекорды' },
]
const KO = /[ㄱ-힝]/
const wq = ref<HTMLInputElement>()
const found = computed(() => {
  const w = props.view.wq.trim().toLowerCase()
  return { w, hit: w ? ALLW.filter(x => [x.ko, x.rd, x.ru].some(s => s.toLowerCase().includes(w))) : ALLW }
})
async function setTab(t: GameTab) {
  props.view.actions.setTab(t)
  if (t === 'words') {
    await nextTick()
    wq.value?.focus({ preventScroll: true })
  }
}
const loafPop = ref(false)
watch(() => props.view.stats.loaves, (n, old) => {
  if (n > old) { loafPop.value = false; void nextTick(() => (loafPop.value = true)) }
})
</script>

<template>
  <aside class="game-side gx-stats">
    <div class="gx-stats-h"><GameIcon name="star" /> 우리말</div>
    <div class="nums">
      <div class="num ok"><b id="nOk">{{ view.stats.ok }}</b><span>верно</span></div>
      <div class="num bad"><b id="nBad">{{ view.stats.bad }}</b><span>неверно</span></div>
      <div class="num"><b id="nAcc">{{ view.stats.acc }}</b><span>точность</span></div>
    </div>
    <div class="row"><span><GameIcon name="sparkle" /> Серия: <b id="nStreak">{{ view.stats.streak }}</b></span><span class="muted">рекорд <span id="nBest">{{ view.stats.best }}</span></span></div>
    <div class="loaf">
      <div class="row" style="margin: 0"><span><GameIcon name="croissant" /> Испечено: <b id="nLoaf" :class="{ pop: loafPop }">{{ view.stats.loaves }}</b></span><span id="loafTxt" class="muted">{{ view.stats.loafTxt }}</span></div>
      <div class="bar"><i id="loafBar" :style="{ width: view.stats.loafPct + '%' }"></i></div>
    </div>
    <div class="lvl">
      <div class="row" style="margin: 0"><span><GameIcon name="star" /> Уровень <b id="lvlN">{{ view.stats.lvlN }}</b> · <span id="lvlName">{{ view.stats.lvlName }}</span></span><span id="xpTxt" class="muted">{{ view.stats.xpTxt }}</span></div>
      <div class="bar"><i id="xpBar" :style="{ width: view.stats.xpPct + '%' }"></i></div>
    </div>
    <div class="goal">
      <div class="row" style="margin: 0"><span><GameIcon name="trophy" /> Цель дня: <b id="goalN">{{ view.stats.goalN }}</b> / <span id="goalMax">{{ view.stats.goalMax }}</span></span><span id="goalTxt" class="muted">{{ view.stats.goalTxt }}</span></div>
      <div class="bar"><i id="goalBar" :style="{ width: view.stats.goalPct + '%' }"></i></div>
    </div>
    <div class="tabs">
      <button v-for="t in TABS" :id="'tab' + t.id[0]!.toUpperCase() + t.id.slice(1)" :key="t.id" type="button" :class="{ on: view.tab === t.id }" @click="setTab(t.id)">{{ t.name }}</button>
    </div>
    <input id="wq" ref="wq" v-model="view.wq" class="wq" type="search" autocomplete="off" placeholder="Найти слово: ем, 먹다, мокта…" :hidden="view.tab !== 'words'" />
    <div id="list" class="list">
      <template v-if="view.tab === 'records'">
        <div v-for="m in MODES" :key="m.id" class="item rec" style="grid-template-columns: 28px 1fr auto">
          <span class="mk"><img class="gi-img" :src="ICON[MODE_ICON[m.id]!] ?? ''" alt="" aria-hidden="true" /></span>
          <div>
            <div>{{ m.name }}</div>
            <div class="muted">{{ view.byMode[m.id] ? `верно ${view.byMode[m.id]!.ok}, неверно ${view.byMode[m.id]!.bad}` : 'ещё не играл(а)' }}</div>
          </div>
          <div class="recbest">{{ view.byMode[m.id]?.best ? `рекорд ${view.byMode[m.id]!.best}` : '—' }}</div>
        </div>
      </template>
      <template v-else-if="view.tab === 'words'">
        <div class="empty">{{ found.w ? `Найдено: ${found.hit.length}` : `Всего слов в игре: ${found.hit.length}. Начни вводить, чтобы найти нужное.` }}</div>
        <div v-for="x in found.hit.slice(0, 60)" :key="x.ko" class="item" style="grid-template-columns: 1fr">
          <div><span class="ko">{{ x.ko }}</span> · {{ x.rd }} — {{ x.ru }}</div>
        </div>
        <div v-if="found.hit.length > 60" class="empty">Показаны первые 60, уточни запрос.</div>
      </template>
      <template v-else-if="view.tab === 'hist'">
        <div v-if="!view.hist.length" class="empty">Здесь появятся твои ответы: слово, перевод и что выбрал.</div>
        <div v-for="(h, i) in view.hist" :key="i" class="item" :class="h.ok ? 'ok' : 'bad'">
          <span class="mk">{{ h.ok ? '✓' : '✗' }}</span>
          <div>
            <div><span :class="{ ko: KO.test(h.p) }">{{ h.p }}</span> → <span :class="{ ko: KO.test(h.r) }">{{ h.r }}</span></div>
            <div v-if="!h.ok && h.you" class="you">ты: {{ h.you }}</div>
          </div>
        </div>
      </template>
      <template v-else>
        <div v-if="!view.weak.length" class="empty">Пока нет слабых мест. Ошибся в слове — оно появится здесь и будет выпадать чаще.</div>
        <div v-for="(m, i) in view.weak" :key="i" class="item bad" style="grid-template-columns: 36px 1fr">
          <span class="mk">{{ '●'.repeat(Math.min(m.n, 3)) }}</span>
          <div>{{ m.l }}</div>
        </div>
      </template>
    </div>
    <div id="allTime" class="muted" style="font-size: 12px; margin-top: 8px">{{ view.stats.allTime }}</div>
  </aside>
</template>
