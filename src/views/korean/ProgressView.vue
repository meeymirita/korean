<script setup lang="ts">
import { computed, ref } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { ACHIEVEMENTS } from '@/data/achievements'
import { DAILY_GOAL, MAX_LEVEL } from '@/data/levels'
import { CATN, D } from '@/data/korean/words'
import { KNOWN_STREAK, useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const info = computed(() => progress.info)
const words = computed(() => progress.data.words)

/* ---------- слова ---------- */
const knownCount = computed(() => D.filter(d => progress.status(d.k) === 'known').length)
const learningCount = computed(() => D.filter(d => progress.status(d.k) === 'learning').length)

const byCategory = computed(() =>
  Object.entries(CATN).map(([id, name]) => {
    const list = D.filter(d => d.c.includes(id))
    const known = list.filter(d => progress.status(d.k) === 'known').length
    const learning = list.filter(d => progress.status(d.k) === 'learning').length
    return { id, name, total: list.length, known, learning }
  }),
)

const weak = computed(() =>
  D.filter(d => {
    const w = words.value[d.k]
    return w && w.streak < KNOWN_STREAK && w.bad > 0
  })
    .map(d => ({ d, w: words.value[d.k]! }))
    .sort((a, b) => b.w.bad - b.w.ok - (a.w.bad - a.w.ok) || b.w.bad - a.w.bad)
    .slice(0, 12),
)

/* ---------- календарь: последние 8 недель, неделя с понедельника ---------- */
const WEEKS = 8
const calendar = computed(() => {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - ((end.getDay() + 6) % 7) - (WEEKS - 1) * 7)
  const cells: { key: string; n: number | null; future: boolean }[] = []
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    cells.push({ key, n: progress.data.days[key] ?? null, future: d > end })
  }
  return cells
})
const heat = (n: number | null) => (n === null ? 0 : n === 0 ? 1 : n < 10 ? 2 : n < DAILY_GOAL ? 3 : 4)

/* ---------- достижения ---------- */
const achievements = computed(() =>
  ACHIEVEMENTS.map(a => {
    const [cur, goal] = a.progress(progress.data, progress.streak)
    return { ...a, cur: Math.min(cur, goal), goal, done: cur >= goal }
  }),
)
const doneCount = computed(() => achievements.value.filter(a => a.done).length)

/* ---------- источники ---------- */
const SOURCES: [string, string][] = [
  ['game', 'Игра «Хлебушек»'],
  ['trainer', 'Тренажёры'],
  ['today', 'Сегодня'],
]
const total = computed(() => {
  const s = progress.data.sources
  return Object.values(s).reduce((n, x) => ({ ok: n.ok + x.ok, bad: n.bad + x.bad }), { ok: 0, bad: 0 })
})

/* ---------- сервер, копия, сброс ---------- */
const tokenInput = ref('')
const message = ref('')
const syncText = computed(
  () => ({ off: 'не подключён', idle: 'ожидание', syncing: 'синхронизация…', ok: 'подключён', error: 'ошибка' })[progress.sync],
)

async function connect() {
  if (!tokenInput.value.trim()) return
  await progress.connect(tokenInput.value)
  if (progress.sync === 'ok') tokenInput.value = ''
}

function download() {
  const blob = new Blob([progress.exportJson()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `progress-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}
async function upload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  message.value = progress.importJson(await file.text()) ? 'Копия загружена.' : 'Не получилось: это не файл прогресса.'
  ;(e.target as HTMLInputElement).value = ''
}
function reset() {
  if (confirm('Сбросить весь прогресс сайта: уровень, очки, серию дней и выученные слова? Это нельзя отменить.')) {
    progress.reset()
    message.value = 'Прогресс сброшен.'
  }
}
</script>

<template>
  <div class="wrap">
    <SectionHead id="progress" sub="уровень, серия дней и выученные слова за весь сайт" :big="info.level" />

    <div class="pg-cards">
      <div class="pg-card">
        <div class="pg-k">Уровень</div>
        <div class="pg-v">{{ info.level }} <small>из {{ MAX_LEVEL }}</small></div>
        <div class="pg-t">{{ info.title }}</div>
        <div class="pg-bar"><i :style="{ width: info.pct + '%' }"></i></div>
        <div class="pg-s">{{ info.max ? 'максимальный уровень' : `${info.into} / ${info.span} очков до следующего` }} · всего {{ info.xp }}</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Серия дней</div>
        <div class="pg-v">🔥 {{ progress.streak }}</div>
        <div class="pg-t">лучшая серия: {{ progress.bestStreak }}</div>
        <div class="pg-s">заниматься нужно хотя бы раз в день</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Цель дня</div>
        <div class="pg-v">🎯 {{ Math.min(progress.todayOk, DAILY_GOAL) }} <small>из {{ DAILY_GOAL }}</small></div>
        <div class="pg-bar goal"><i :style="{ width: Math.min(100, (progress.todayOk / DAILY_GOAL) * 100) + '%' }"></i></div>
        <div class="pg-s">{{ progress.goalDone ? 'выполнена 🎉' : `ещё ${DAILY_GOAL - progress.todayOk} верных ответов` }}</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Выученные слова</div>
        <div class="pg-v">🌸 {{ knownCount }} <small>из {{ D.length }}</small></div>
        <div class="pg-bar"><i :style="{ width: (knownCount / D.length) * 100 + '%' }"></i></div>
        <div class="pg-s">{{ learningCount }} в процессе · слово считается выученным после {{ KNOWN_STREAK }} верных ответов подряд</div>
      </div>
    </div>

    <h2 class="today-h">Дни занятий <small>последние 8 недель</small></h2>
    <div class="pg-cal">
      <div class="pg-wd"><span>пн</span><span></span><span>ср</span><span></span><span>пт</span><span></span><span>вс</span></div>
      <div class="pg-grid">
        <span
          v-for="c in calendar"
          :key="c.key"
          class="pg-day"
          :class="['h' + heat(c.n), { future: c.future }]"
          :title="`${c.key}: ${c.n ?? 0} верных`"
        ></span>
      </div>
    </div>

    <h2 class="today-h">Слова по темам</h2>
    <div class="pg-cats">
      <div v-for="c in byCategory" :key="c.id" class="pg-cat">
        <div class="pg-cn">{{ c.name }}</div>
        <div class="pg-stack">
          <i class="known" :style="{ width: (c.known / c.total) * 100 + '%' }"></i>
          <i class="learning" :style="{ width: (c.learning / c.total) * 100 + '%' }"></i>
        </div>
        <div class="pg-cnum">{{ c.known }} / {{ c.total }}</div>
      </div>
    </div>
    <p class="pg-legend"><i class="known"></i> выучено <i class="learning"></i> в процессе</p>

    <h2 class="today-h">Над чем стоит поработать</h2>
    <div v-if="weak.length" class="pg-weak">
      <div v-for="x in weak" :key="x.d.n" class="pg-w">
        <b class="ko">{{ x.d.k }}</b>
        <span>{{ x.d.t }}</span>
        <small>верно {{ x.w.ok }} · неверно {{ x.w.bad }}</small>
      </div>
    </div>
    <p v-else class="pg-empty">Слабых слов пока нет: ошибёшься в слове, и оно появится здесь.</p>

    <h2 class="today-h">Достижения <small>{{ doneCount }} из {{ achievements.length }}</small></h2>
    <div class="pg-ach">
      <div v-for="a in achievements" :key="a.id" class="pg-a" :class="{ done: a.done }">
        <span class="pg-ai">{{ a.icon }}</span>
        <div>
          <b>{{ a.title }}</b>
          <small>{{ a.desc }}</small>
          <div class="pg-bar"><i :style="{ width: (a.cur / a.goal) * 100 + '%' }"></i></div>
        </div>
        <span class="pg-an">{{ a.cur }} / {{ a.goal }}</span>
      </div>
    </div>

    <h2 class="today-h">Ответы <small>всего верно {{ total.ok }}, неверно {{ total.bad }}</small></h2>
    <table class="pg-tbl">
      <tr v-for="[id, name] in SOURCES" :key="id">
        <td>{{ name }}</td>
        <td>верно {{ progress.data.sources[id]?.ok ?? 0 }}</td>
        <td>неверно {{ progress.data.sources[id]?.bad ?? 0 }}</td>
      </tr>
    </table>

    <h2 class="today-h">Где хранится прогресс</h2>
    <p class="pg-note">
      Прогресс хранится в этом браузере. Чтобы он не пропал при очистке браузера, его можно сохранять на сервер сайта
      (файл с копиями) или скачать в файл.
    </p>
    <div class="pg-server">
      <div class="pg-status" :class="progress.sync">
        Сервер: <b>{{ syncText }}</b><span v-if="progress.syncMessage"> · {{ progress.syncMessage }}</span>
      </div>
      <form v-if="!progress.token" class="pg-form" @submit.prevent="connect">
        <input v-model="tokenInput" type="password" placeholder="токен сервера" autocomplete="off" />
        <button type="submit">Подключить</button>
      </form>
      <div v-else class="pg-btns">
        <button @click="progress.push()">Сохранить сейчас</button>
        <button class="plain" @click="progress.disconnect()">Отключить</button>
      </div>
    </div>
    <div class="pg-btns">
      <button class="plain" @click="download">⬇ Скачать копию</button>
      <label class="pg-file plain">⬆ Загрузить копию<input type="file" accept="application/json,.json" @change="upload" /></label>
      <button class="plain danger" @click="reset">Сбросить прогресс</button>
    </div>
    <p v-if="message" class="pg-note">{{ message }}</p>
  </div>
</template>

<style>
.study .pg-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 26px; }
.study .pg-card { padding: 20px 22px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow); }
.study .pg-k { font-family: var(--mono); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--gold); }
.study .pg-v { margin-top: 6px; font-family: var(--serif); font-size: 46px; font-weight: 600; line-height: 1; }
.study .pg-v small { font-family: 'Manrope', sans-serif; font-size: 14px; font-weight: 400; color: var(--muted); }
.study .pg-t { margin-top: 4px; font-size: 15px; font-weight: 600; }
.study .pg-s { margin-top: 8px; font-size: 12.5px; line-height: 1.4; color: var(--muted); }
.study .pg-bar { height: 7px; margin-top: 10px; border-radius: 99px; background: var(--line-soft); overflow: hidden; }
.study .pg-bar i { display: block; height: 100%; background: var(--gold); border-radius: 99px; transition: width .4s; }
.study .pg-bar.goal i { background: var(--ok); }

.study .pg-cal { display: flex; gap: 8px; margin-top: 16px; }
.study .pg-wd { display: grid; grid-template-rows: repeat(7, 18px); gap: 4px; font-size: 10px; color: var(--muted); align-items: center; }
.study .pg-grid { display: grid; grid-template-rows: repeat(7, 18px); grid-auto-flow: column; grid-auto-columns: 18px; gap: 4px; }
.study .pg-day { width: 18px; height: 18px; border-radius: 4px; background: var(--line-soft); }
.study .pg-day.h1 { background: rgba(168, 130, 47, .25); }
.study .pg-day.h2 { background: rgba(168, 130, 47, .5); }
.study .pg-day.h3 { background: rgba(168, 130, 47, .75); }
.study .pg-day.h4 { background: var(--gold); }
.study .pg-day.future { opacity: .35; }

.study .pg-cats { display: grid; gap: 10px; margin-top: 16px; }
.study .pg-cat { display: grid; grid-template-columns: 120px 1fr 80px; gap: 12px; align-items: center; font-size: 14px; }
.study .pg-stack { display: flex; height: 10px; border-radius: 99px; background: var(--line-soft); overflow: hidden; }
.study .pg-stack i, .study .pg-legend i { display: block; height: 100%; }
.study .pg-stack i.known, .study .pg-legend i.known { background: var(--gold); }
.study .pg-stack i.learning, .study .pg-legend i.learning { background: rgba(168, 130, 47, .35); }
.study .pg-cnum { text-align: right; font-family: var(--mono); font-size: 12px; color: var(--muted); }
.study .pg-legend { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; font-size: 12px; color: var(--muted); }
.study .pg-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-left: 10px; }
.study .pg-legend i:first-child { margin-left: 0; }

.study .pg-weak { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; margin-top: 16px; }
.study .pg-w { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; }
.study .pg-w b { font-size: 22px; }
.study .pg-w small { color: var(--bad); }
.study .pg-empty, .study .pg-note { margin: 12px 0 0; font-size: 14px; color: var(--muted); }

.study .pg-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; margin-top: 16px; }
.study .pg-a { display: grid; grid-template-columns: 36px 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; background: var(--surface);
  border: 1px solid var(--line-soft); border-radius: 14px; opacity: .6; }
.study .pg-a.done { opacity: 1; border-color: var(--gold); background: var(--gold-soft); }
.study .pg-ai { font-size: 26px; text-align: center; }
.study .pg-a b { display: block; font-size: 15px; }
.study .pg-a small { display: block; font-size: 12px; color: var(--muted); }
.study .pg-an { font-family: var(--mono); font-size: 11px; color: var(--muted); }

.study .pg-tbl { width: 100%; margin-top: 14px; border-collapse: collapse; font-size: 15px; }
.study .pg-tbl td { padding: 9px 4px; border-bottom: 1px solid var(--line-soft); }

.study .pg-server { margin-top: 12px; padding: 16px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.study .pg-status { font-size: 14px; }
.study .pg-status.ok b { color: var(--ok); }
.study .pg-status.error b { color: var(--bad); }
.study .pg-form { display: flex; gap: 8px; margin-top: 12px; max-width: 460px; }
.study .pg-form input { flex: 1; min-width: 0; padding: 10px 14px; font: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; outline: none; }
.study .pg-form input:focus { border-color: var(--gold); }
.study .pg-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.study .pg-form button, .study .pg-btns button, .study .pg-file { padding: 10px 18px; font-size: 14px; font-weight: 600; color: #fff; background: var(--gold);
  border: 1px solid var(--gold); border-radius: 12px; cursor: pointer; }
.study .pg-btns .plain, .study .pg-file.plain { color: var(--ink); background: transparent; border-color: var(--line); }
.study .pg-btns .plain:hover, .study .pg-file.plain:hover { border-color: var(--gold); }
.study .pg-btns .danger:hover { border-color: var(--bad); color: var(--bad); }
.study .pg-file input { display: none; }
@media (max-width: 560px) { .study .pg-cat { grid-template-columns: 90px 1fr 60px; } }
</style>
