<script setup lang="ts">
/**
 * «Длинные предложения дня» на странице «Сегодня»: пять трёхчастных предложений «Мастера+» (набор на день по дате; «Другие предложения» берут случайные).
 * В каждом нужно выбрать связку, которой не хватает перед третьей частью. После ответа видны перевод каждой части и пояснение.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CONN, LONG_ALL, growSteps, type LongSentence } from '@/game/long-sentences'
import { LONG3 } from '@/game/long-sentences-3'
import { seededRandom } from '@/lib/seeded'
import { dayKey, newRound, useProgressStore } from '@/stores/progress'

const COUNT = 5
const progress = useProgressStore()
const router = useRouter()
const pick = (rnd: () => number): LongSentence[] => {
  const pool = [...LONG3]
  const out: LongSentence[] = []
  while (out.length < COUNT && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!)
  return out
}
const list = ref<LongSentence[]>(pick(seededRandom(`today-long:${dayKey()}`)))
const chosen = ref<Record<number, string>>({})
let round = newRound()

/** части по связкам: «A, 그러니까 B, 그리고 C.» → [{ conn: '', text: 'A' }, { conn: '그러니까', text: 'B' }, …] */
function segsOf(x: LongSentence) {
  const re = new RegExp(`,\\s*(${CONN.join('|')})\\s+`)
  const out: { conn: string; text: string }[] = []
  let rest = x.ko.replace(/_/g, ' ')
  let conn = ''
  for (let m = re.exec(rest); m; m = re.exec(rest)) {
    out.push({ conn, text: rest.slice(0, m.index) })
    conn = m[1]!
    rest = rest.slice(m.index + m[0].length)
  }
  out.push({ conn, text: rest })
  return out
}
const items = computed(() => list.value.map(x => ({ x, segs: segsOf(x), ru: growSteps(x).map(s => s.ru) })))
const options = [...CONN].sort((a, b) => a.localeCompare(b))
const done = computed(() => Object.keys(chosen.value).length)
const right = computed(() => items.value.filter((it, i) => chosen.value[i] === it.segs[2]?.conn).length)

function choose(i: number, c: string) {
  if (i in chosen.value) return
  const it = items.value[i]!
  const answer = it.segs[2]?.conn ?? ''
  chosen.value = { ...chosen.value, [i]: c }
  progress.record({ word: null, ok: c === answer, source: 'today', detail: { q: `Длинное предложение: ${it.x.ko.replace(answer, '＿＿＿')}`, a: answer, y: c === answer ? undefined : c, r: round } })
}
function other() {
  list.value = pick(Math.random)
  chosen.value = {}
  round = newRound()
}
</script>

<template>
  <section class="tl">
    <h2 class="today-h">Длинные предложения дня <small>{{ done }} из {{ COUNT }} · верно {{ right }}</small></h2>
    <ol class="tl-list">
      <li v-for="(it, i) in items" :key="it.x.ko" class="tl-card">
        <p class="tl-ko ko">
          <template v-for="(s, k) in it.segs" :key="k">
            <template v-if="s.conn">, <b v-if="k === 2 && !(i in chosen)" class="tl-gap">＿＿＿</b><b v-else class="tl-conn" :class="{ ok: k === 2 && chosen[i] === s.conn, bad: k === 2 && chosen[i] !== s.conn }">{{ s.conn }}</b>{{ ' ' }}</template>{{ s.text }}
          </template>
        </p>
        <p class="tl-q">Какая связка стоит перед третьей частью?</p>
        <div class="tl-opts">
          <button v-for="c in options" :key="c" type="button" class="tl-opt ko" :class="{ ok: i in chosen && c === it.segs[2]?.conn, bad: chosen[i] === c && c !== it.segs[2]?.conn }" :disabled="i in chosen" @click="choose(i, c)">{{ c }}</button>
        </div>
        <template v-if="i in chosen">
          <p class="tl-res" :class="chosen[i] === it.segs[2]?.conn ? 'ok' : 'bad'">{{ chosen[i] === it.segs[2]?.conn ? 'Верно.' : `Не совсем: здесь ${it.segs[2]?.conn}.` }}</p>
          <ol class="tl-ru">
            <li v-for="(t, k) in it.ru" :key="k"><span class="ko">{{ it.segs[k]?.conn }}</span> {{ t }}</li>
          </ol>
          <p class="tl-note">{{ it.x.note }}</p>
        </template>
      </li>
    </ol>
    <div class="fcb">
      <button type="button" @click="other">Другие предложения</button>
      <button type="button" class="plain" @click="router.push('/game/home?game=build')">Собирать такие в игре ({{ LONG_ALL.length }}) →</button>
    </div>
  </section>
</template>

<style scoped>
.tl-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 12px; }
.tl-card { margin: 0; padding: 18px 20px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255, 255, 255, .7); }
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
</style>
