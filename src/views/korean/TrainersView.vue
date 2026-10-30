<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { usePersisted } from '@/composables/usePersisted'
import MatchGame from '@/components/korean/MatchGame.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import TypingQuiz from '@/components/korean/TypingQuiz.vue'
import { CATN } from '@/data/korean/words'
import { DIR_LABEL, type Direction, SETS, dirsFor, pickRound, pool } from '@/data/korean/trainer'

type Mode = 'match' | 'type'

const mode = usePersisted<Mode>('tr_mode', 'match', v => v === 'match' || v === 'type')
const cat = usePersisted('tr_cat', '', v => typeof v === 'string')
const size = usePersisted('tr_size', 8, v => [4, 6, 8, 10, 12, 15, 20].includes(v as number))
const dir = usePersisted<Direction>('tr_dir', 'ko-ru', v => typeof v === 'string')
const showReading = usePersisted('tr_reading', true, v => typeof v === 'boolean')

const available = computed(() => pool(cat.value))
const round = ref(pickRound(available.value, size.value))
const roundId = ref(0)

function start(words?: typeof round.value) {
  round.value = words ?? pickRound(pool(cat.value), size.value)
  roundId.value++
}
const dirs = computed(() => dirsFor(cat.value))
const setCat = (c: string) => {
  cat.value = c
  if (!dirs.value.includes(dir.value)) dir.value = dirs.value[0]!
  start()
}
const setMode = (m: Mode) => ((mode.value = m), start())
</script>

<template>
  <div class="wrap">
    <SectionHead id="trainers" />

    <div class="chips">
      <button class="chip" :class="{ on: mode === 'match' }" @click="setMode('match')">🔗 Найди пару</button>
      <button class="chip" :class="{ on: mode === 'type' }" @click="setMode('type')">⌨️ Напиши перевод</button>
      <RouterLink to="/korean/particles" class="chip">🧩 Частицы и окончания</RouterLink>
      <RouterLink to="/korean/pairs" class="chip">👯 Похожие, но разные</RouterLink>
      <RouterLink to="/korean/translate" class="chip">🔀 Переведи предложение</RouterLink>
    </div>

    <div class="chips">
      <button class="chip" :class="{ on: !cat }" @click="setCat('')">Все слова</button>
      <button v-for="(name, c) in CATN" :key="c" class="chip" :class="{ on: cat === c }" @click="setCat(c)">{{ name }}</button>
    </div>

    <div class="chips">
      <span class="tr-group">Грамматика</span>
      <button v-for="s in SETS" :key="s.id" class="chip" :class="{ on: cat === s.id }" @click="setCat(s.id)">{{ s.title }}</button>
    </div>

    <div class="tr-set">
      <label>Слов в раунде
        <select v-model.number="size" @change="start()">
          <option v-for="n in [4, 6, 8, 10, 12, 15, 20]" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label v-if="mode === 'type' && dirs.length > 1">Задание
        <select v-model="dir" @change="start()">
          <option v-for="d in dirs" :key="d" :value="d">{{ DIR_LABEL[d] }}</option>
        </select>
      </label>
      <label v-if="mode === 'match'" class="chk"><input v-model="showReading" type="checkbox" /> показывать чтение</label>
    </div>
    <p v-if="available.length < size" class="tr-note">В этой категории всего {{ available.length }} слов подходящих для раунда.</p>

    <MatchGame
      v-if="mode === 'match'"
      :key="roundId"
      :words="round"
      :show-reading="showReading"
      @again="start()"
      @retry="start"
    />
     <TypingQuiz v-else :key="roundId" :words="round" :dir="dirs.includes(dir) ? dir : dirs[0]!" @again="start()" @retry="start" />
  </div>
</template>

<style>
.study .tr-group { align-self: center; margin-right: 4px; font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); }
.study .tr-set { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-top: 16px; font-size: 14px; color: var(--muted); }
.study .tr-set label { display: inline-flex; align-items: center; gap: 8px; }
.study .tr-set select { padding: 6px 10px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.study .tr-set .chk { cursor: pointer; }
.study .tr-set .chk input { accent-color: var(--gold); }
.study .tr-new { margin-left: auto; padding: 8px 16px; font-weight: 600; color: var(--ink); background: transparent; border: 1px solid var(--line); border-radius: 12px; }
.study .tr-new:hover { border-color: var(--gold); }
.study .tr-note { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
</style>
