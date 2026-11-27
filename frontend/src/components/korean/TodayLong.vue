<script setup lang="ts">
/**
 * «Длинное предложение дня» на странице «Сегодня»: трёхчастное предложение «Мастера+» (одно на день по дате; кнопка «Другое» берёт случайное).
 * Задание посложнее обычных: выбрать связку, которой не хватает между второй и третьей частью. После ответа видны перевод каждой части и пояснение.
 */
import { computed, ref } from 'vue'
import { CONN, LONG_ALL, growSteps, type LongSentence } from '@/game/long-sentences'
import { LONG3 } from '@/game/long-sentences-3'
import { withSeed } from '@/lib/seeded'
import { dayKey, newRound, useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const pickBy = (seed: string) => withSeed(seed, () => LONG3[Math.floor(Math.random() * LONG3.length)]!)
const cur = ref<LongSentence>(pickBy(`today-long:${dayKey()}`))
const chosen = ref<string | null>(null)
const round = newRound()

/** части по связкам: «A, 그러니까 B, 그리고 C.» → [{ conn: '', text: 'A' }, { conn: '그러니까', text: 'B' }, …] */
const segs = computed(() => {
  const re = new RegExp(`,\\s*(${CONN.join('|')})\\s+`)
  const out: { conn: string; text: string }[] = []
  let rest = cur.value.ko.replace(/_/g, ' ')
  let conn = ''
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    out.push({ conn, text: rest.slice(0, m.index) })
    conn = m[1]!
    rest = rest.slice(m.index + m[0].length)
  }
  out.push({ conn, text: rest })
  return out
})
const ru = computed(() => growSteps(cur.value).map(s => s.ru))
/** связка между второй и третьей частью: её и угадываем */
const answer = computed(() => segs.value[2]?.conn ?? '')
const options = computed(() => [...CONN].sort((a, b) => a.localeCompare(b)))

function pick(c: string) {
  if (chosen.value !== null) return
  chosen.value = c
  progress.record({ word: null, ok: c === answer.value, source: 'today', detail: { q: `Длинное предложение: ${cur.value.ko.replace(answer.value, '＿＿＿')}`, a: answer.value, y: c === answer.value ? undefined : c, r: round } })
}
function other() {
  const list = LONG3.filter(x => x !== cur.value)
  cur.value = list[Math.floor(Math.random() * list.length)]!
  chosen.value = null
}
const countAll = LONG_ALL.length
</script>

<template>
  <section class="tl">
    <h2 class="today-h">Длинное предложение дня <small>{{ countAll }} предложений в игре «Собери предложение»</small></h2>
    <div class="tl-card">
      <p class="tl-ko ko">
        <template v-for="(s, i) in segs" :key="i">
          <template v-if="s.conn">, <b v-if="i === 2 && chosen === null" class="tl-gap">＿＿＿</b><b v-else class="tl-conn" :class="{ ok: i === 2 && chosen === answer, bad: i === 2 && chosen !== answer }">{{ s.conn }}</b>{{ ' ' }}</template>{{ s.text }}
        </template>
      </p>
      <p class="tl-q">Какая связка стоит перед третьей частью?</p>
      <div class="tl-opts">
        <button v-for="c in options" :key="c" type="button" class="tl-opt ko" :class="{ ok: chosen !== null && c === answer, bad: chosen === c && c !== answer }" :disabled="chosen !== null" @click="pick(c)">{{ c }}</button>
      </div>
      <template v-if="chosen !== null">
        <p class="tl-res" :class="chosen === answer ? 'ok' : 'bad'">{{ chosen === answer ? 'Верно.' : `Не совсем: здесь ${answer}.` }}</p>
        <ol class="tl-ru">
          <li v-for="(t, i) in ru" :key="i"><span class="ko">{{ segs[i]?.conn }}</span> {{ t }}</li>
        </ol>
        <p class="tl-note">{{ cur.note }}</p>
      </template>
      <div class="tl-bar">
        <button type="button" class="plain" @click="other">Другое предложение</button>
        <RouterLink to="/game/home?game=build" class="plain">Собрать такие в игре →</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tl-card { margin-top: 10px; padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255, 255, 255, .7); }
.tl-ko { margin: 0; font-size: 21px; line-height: 1.7; font-weight: 600; }
.tl-gap { color: var(--accent, #d64da9); letter-spacing: .1em; }
.tl-conn { color: var(--accent, #d64da9); }
.tl-conn.ok { color: #2f8f5b; }
.tl-conn.bad { color: #c0508a; }
.tl-q { margin: 14px 0 8px; font-size: 14px; color: var(--muted); }
.tl-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.tl-opt { padding: 8px 18px; border: 1.5px solid var(--line); border-radius: 99px; background: #fff; font: inherit; font-size: 16px; font-weight: 600; cursor: pointer; }
.tl-opt:disabled { cursor: default; }
.tl-opt.ok { border-color: #2f8f5b; background: rgba(155, 216, 180, .25); }
.tl-opt.bad { border-color: #c0508a; background: rgba(192, 80, 138, .1); }
.tl-res { margin: 12px 0 0; font-weight: 700; }
.tl-res.ok { color: #2f8f5b; }
.tl-res.bad { color: #c0508a; }
.tl-ru { margin: 8px 0 0; padding-left: 20px; display: grid; gap: 4px; font-size: 15px; }
.tl-ru .ko { color: var(--accent, #d64da9); font-weight: 700; }
.tl-note { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
.tl-bar { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; }
</style>
