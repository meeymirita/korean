<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { STAGE_NAME, emojiOf, plants, type Plant } from '@/data/garden'
import { CATN } from '@/data/korean/words'
import { KNOWN_STREAK, useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const all = computed(() => plants(progress.data))
const thirsty = computed(() => all.value.filter(p => p.stage === 'thirsty' || p.stage === 'wilted'))
const blooming = computed(() => all.value.filter(p => p.stage === 'bloom' || p.stage === 'thirsty').length)
const sprouts = computed(() => all.value.filter(p => ['seed', 'sprout', 'bud'].includes(p.stage)).length)
const watered = computed(() => all.value.filter(p => p.watered).length)

const onlyThirsty = ref(false)
const shown = computed(() => (onlyThirsty.value ? thirsty.value : all.value))
const picked = ref<Plant | null>(null)

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000)
  return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн. назад`
}
const cats = (p: Plant) => p.word.c.map(c => CATN[c]).join(', ')
</script>

<template>
  <div class="cb-body">
    <div class="pg-cards">
      <div class="pg-card">
        <div class="pg-k">Цветёт</div>
        <div class="pg-v">🌸 {{ blooming }}</div>
        <div class="pg-s">слово расцветает на {{ KNOWN_STREAK }} очках: верный ответ +1, ошибка −1</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Растёт</div>
        <div class="pg-v">🌱 {{ sprouts }}</div>
        <div class="pg-s">слова, которые ещё учатся: не хватает очков до {{ KNOWN_STREAK }}</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Полито сегодня</div>
        <div class="pg-v">💧 {{ watered }}</div>
        <div class="pg-s">верный ответ в игре, тренажёрах или повторении поливает слово</div>
      </div>
      <div class="pg-card" :class="{ gd_thirst: thirsty.length }">
        <div class="pg-k">Хотят пить</div>
        <div class="pg-v">🥀 {{ thirsty.length }}</div>
        <RouterLink v-if="thirsty.length" :to="{ path: '/korean/cabinet', query: { tab: 'repeat' } }" class="pg-s gd-go">Полить в повторении →</RouterLink>
        <div v-else class="pg-s">все слова напоены</div>
      </div>
    </div>

    <div v-if="all.length" class="chips">
      <button class="chip" :class="{ on: !onlyThirsty }" @click="onlyThirsty = false">Весь сад · {{ all.length }}</button>
      <button class="chip" :class="{ on: onlyThirsty }" @click="onlyThirsty = true">Хотят пить · {{ thirsty.length }}</button>
    </div>

    <div v-if="all.length" class="gd-field">
      <div class="gd-flowers">
        <button
          v-for="p in shown"
          :key="p.word.n"
          class="gd-plant"
          :class="[p.stage, { on: picked?.word.n === p.word.n, wet: p.watered }]"
          :title="`${p.word.k} — ${p.word.t}`"
          @click="picked = picked?.word.n === p.word.n ? null : p"
        >
          {{ emojiOf(p) }}
        </button>
      </div>
      <p v-if="!shown.length" class="gd-empty">Все слова напоены 🌿</p>
    </div>
    <div v-else class="empty">
      <div class="big">🌱</div>
      Сад пока пуст. Ответь на любое слово в игре, тренажёре или «Сегодня» — оно прорастёт.<br />
      <RouterLink to="/game">Идти играть →</RouterLink>
    </div>

    <div v-if="picked" class="pg-card gd-info">
      <div class="gd-ico">{{ emojiOf(picked) }}</div>
      <div>
        <div class="gd-ko">{{ picked.word.k }} <small>{{ picked.word.r }}</small></div>
        <div class="gd-tr">{{ picked.word.t }}</div>
        <div class="pg-s">
          {{ STAGE_NAME[picked.stage] }} · очков {{ picked.stat.streak }} · всего {{ picked.stat.ok }}/{{ picked.stat.ok + picked.stat.bad }} ·
          отвечал {{ ago(picked.stat.last) }}<span v-if="cats(picked)"> · {{ cats(picked) }}</span>
        </div>
      </div>
    </div>

    <p class="pg-s gd-legend">
      🌰 семечко (ошибся) · 🌱 росток · 🌿 бутон · цветок — слово выучено (у каждой темы свой) · хочет пить — пора повторить, завяло —
      давно не повторял. 🥀 возвращается в цветок после верного ответа.
    </p>
  </div>
</template>
