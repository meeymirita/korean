<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { HOME_PHRASES, HOME_RULE } from '@/composables/useHome'
import { KNOWN_STREAK, dayKey, useProgressStore } from '@/stores/progress'

const progress = useProgressStore()

const grammarDone = G.filter(g => g.st === 'ok').length
const known = computed(() => D.filter(d => progress.status(d.k) === 'known').length)
const answers = computed(() =>
  Object.values(progress.data.sources).reduce((n, x) => n + x.ok + x.bad, 0),
)
const percent = computed(() => Math.round((known.value / D.length) * 100))

/** Пять слов на сегодня: другие после каждой перезагрузки страницы. */
const words = [...D].sort(() => Math.random() - 0.5).slice(0, 5)

const rule = HOME_RULE
const ruleText = rule.label.replace(/^Грамматика · /, '')

const lessons = computed(() => [
  { n: '01', title: 'Слова', sub: `${D.length} слов в словаре`, foot: 'Открыть →', to: '/korean/words' },
  { n: '02', title: 'Грамматика', sub: `${G.length} правил`, foot: `✓ ${grammarDone} пройдено`, to: '/korean/grammar' },
  { n: '03', title: 'Справочник', sub: 'памятка, чтение, примеры', foot: 'Изучить →', to: '/korean/ref' },
  { n: '04', title: 'Тренажёры', sub: 'найди пару и напиши', foot: progress.unlocked ? 'Играть →' : '🔒 Нужен токен', to: '/korean/trainers' },
])

const quick = [
  { icon: '⏱', title: '5 минут', sub: 'Десять заданий вперемешку', to: '/korean/quick' },
  { icon: '☀', title: 'Задания на сегодня', sub: 'Слова, правило и задания', to: '/korean/today' },
  { icon: '✧', title: 'Тренажёры слов', sub: 'Найди пару, напиши перевод', to: '/korean/trainers' },
  { icon: '🍞', title: 'Игра на слова', sub: 'Хлебушек', to: '/game' },
]

/* календарь месяца: дни с верными ответами закрашены */
const now = new Date()
const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(now)
const calendar = computed(() => {
  const y = now.getFullYear()
  const m = now.getMonth()
  const lead = (new Date(y, m, 1).getDay() + 6) % 7
  const count = new Date(y, m + 1, 0).getDate()
  return {
    lead,
    days: Array.from({ length: count }, (_, i) => {
      const key = dayKey(new Date(y, m, i + 1))
      return { d: i + 1, done: (progress.data.days[key] ?? 0) > 0, today: i + 1 === now.getDate() }
    }),
  }
})
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
</script>

<template>
  <div class="dash">
    <div class="dcol">
      <section class="hero">
        <div class="hero-in">
          <span class="eyebrow">СЕЙЧАС ИЗУЧАЕМ · УРОВЕНЬ 1A</span>
          <h2 class="ko">{{ rule.rule }}</h2>
          <h3>{{ ruleText }}</h3>
          <p class="ko">{{ rule.examples }}</p>
          <RouterLink class="primary" :to="rule.to">Открыть правило&nbsp; →</RouterLink>
        </div>
      </section>

      <section class="panel">
        <div class="sh"><h3>✧ Мои разделы</h3></div>
        <div class="lessons">
          <RouterLink v-for="l in lessons" :key="l.n" :to="l.to" class="lesson">
            <span class="num">{{ l.n }}</span>
            <strong>{{ l.title }}</strong>
            <small>{{ l.sub }}</small>
            <span class="foot">{{ l.foot }}</span>
          </RouterLink>
        </div>
      </section>

      <section class="panel">
        <div class="sh"><h3>▤ Слова на сегодня</h3><RouterLink to="/korean/words" class="tbtn">Все слова →</RouterLink></div>
        <div class="words">
          <RouterLink v-for="w in words" :key="w.n" :to="{ path: '/korean/words', query: { q: w.k } }" class="word">
            <strong class="ko">{{ w.k }}</strong>
            <small>{{ w.r }}</small>
            <small>{{ w.t }}</small>
          </RouterLink>
        </div>
      </section>

      <section class="panel">
        <div class="sh"><h3>✧ Быстрый доступ</h3></div>
        <div class="quick">
          <RouterLink v-for="q in quick" :key="q.to + q.title" :to="q.to">
            <span class="qi">{{ q.icon }}</span>
            <span><b>{{ q.title }}</b><br><small>{{ q.sub }}</small></span>
          </RouterLink>
        </div>
      </section>
    </div>

    <div class="dcol">
      <section class="panel phrase">
        <div class="label">✳︎ &nbsp; Фразы дня</div>
        <div v-for="p in HOME_PHRASES" :key="p.ko" class="ph">
          <div class="kr ko">{{ p.ko }}</div>
          <div class="tr">{{ p.ru }}</div>
        </div>
      </section>

      <section class="panel">
        <template v-if="progress.unlocked">
          <div class="sh"><h3>Твой прогресс</h3><b>{{ percent }}%</b></div>
          <div class="pline"><div :style="{ width: percent + '%' }"></div></div>
          <div class="stats">
            <div><strong>{{ known }}</strong><small>слов</small></div>
            <div><strong>{{ progress.streak }}</strong><small>дней подряд</small></div>
            <div><strong>{{ grammarDone }}</strong><small>правил</small></div>
            <div><strong>{{ answers }}</strong><small>ответов</small></div>
          </div>
          <p class="note">слово выучено, когда набрал {{ KNOWN_STREAK }} очков: верный ответ +1, ошибка −1</p>
        </template>
        <RouterLink v-else to="/korean/cabinet" class="locked">
          <div class="sh"><h3>Твой прогресс</h3></div>
          🔒 Личная статистика откроется после входа по токену
        </RouterLink>
      </section>

      <section class="panel">
        <div class="sh"><h3>Календарь активности</h3><RouterLink to="/korean/cabinet" class="tbtn">Кабинет →</RouterLink></div>
        <div class="month">{{ monthLabel }}</div>
        <div class="cal">
          <span v-for="d in WD" :key="d">{{ d }}</span>
          <span v-for="i in calendar.lead" :key="'e' + i"></span>
          <i v-for="c in calendar.days" :key="c.d" :class="{ done: c.done, today: c.today }">{{ c.d }}</i>
        </div>
      </section>

      <section class="panel quote">
        <p>Корея — это не только язык, но и новые возможности, люди и мечты. ♡</p>
        <RouterLink to="/korean/today">Всё получится →</RouterLink>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dash { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(285px, 1fr); gap: 18px; margin-top: 8px; }
.dcol { display: grid; align-content: start; gap: 16px; min-width: 0; }
.panel { background: var(--surface); border: 1px solid rgba(255, 255, 255, .95); border-radius: 21px; padding: 19px;
  box-shadow: var(--shadow); min-width: 0; }
.sh { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 15px; }
.sh h3 { margin: 0; font-size: 16px; }
.tbtn { color: #7371ed; font-size: 12px; padding: 4px; }
.tbtn:hover { color: var(--pink); }

.hero { min-height: 290px; position: relative; overflow: hidden; border-radius: 22px; color: #fff; padding: 28px;
  background: linear-gradient(115deg, rgba(33, 43, 105, .97), rgba(53, 72, 142, .76) 48%, rgba(100, 93, 170, .18)),
    radial-gradient(ellipse at 80% 80%, #f7b9df, #7ea9eb 45%, #303d81 80%);
  box-shadow: var(--shadow); }
.hero::before { content: "✦  ·  ✧     🌸       ✦     ·     🌸"; position: absolute; right: 12px; top: 18px; color: #ffd6f1;
  font-size: 22px; letter-spacing: 9px; opacity: .85; }
.hero::after { content: "서울  Seoul"; position: absolute; right: 22px; bottom: 18px; font-size: 36px; font-weight: 700;
  letter-spacing: 2px; color: rgba(255, 255, 255, .15); }
.hero-in { position: relative; z-index: 1; }
.eyebrow { display: inline-block; background: rgba(255, 255, 255, .2); border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 30px; padding: 7px 12px; font-size: 12px; }
.hero h2 { font-size: 34px; margin: 17px 0 2px; }
.hero h3 { font-size: 17px; font-weight: 500; margin: 0 0 12px; }
.hero p { max-width: 340px; line-height: 1.55; font-size: 14px; color: #f0edff; margin: 0 0 14px; }
.primary { display: inline-block; padding: 13px 19px; border-radius: 28px; background: linear-gradient(100deg, #f8b9e9, #9de4ff);
  color: #37378f; font-weight: 600; transition: .2s; }
.primary:hover { filter: brightness(1.04); transform: translateY(-1px); }

.lessons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.lesson { padding: 15px 13px; min-height: 145px; border-radius: 18px; display: flex; flex-direction: column; align-items: flex-start;
  gap: 7px; transition: .2s; }
.lesson:hover, .word:hover, .quick a:hover { transform: translateY(-3px); }
.lesson:nth-child(1) { background: linear-gradient(140deg, #d6e4ff, #e4eaff); }
.lesson:nth-child(2) { background: linear-gradient(140deg, #ffe0f4, #ffebf8); }
.lesson:nth-child(3) { background: linear-gradient(140deg, #e6dcff, #f0eaff); }
.lesson:nth-child(4) { background: linear-gradient(140deg, #d8f7f2, #eafaf8); }
.lesson .num { font-size: 12px; color: #626bb8; }
.lesson strong { font-size: 15px; }
.lesson small { font-size: 11px; color: var(--muted); line-height: 1.4; }
.lesson .foot { margin-top: auto; font-size: 12px; color: #7e75d9; }

.words { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px; }
.word { background: rgba(255, 255, 255, .72); border: 1px solid #fff; border-radius: 15px; padding: 12px 10px; transition: .2s; min-width: 0; }
.word strong { display: block; font-size: 18px; margin-bottom: 5px; overflow-wrap: anywhere; }
.word small { display: block; color: var(--muted); font-size: 11px; line-height: 1.6; }

.quick { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.quick a { border-radius: 30px; padding: 14px 12px; background: linear-gradient(110deg, #ffe0f5, #f0e5ff); font-size: 12px;
  display: flex; align-items: center; gap: 9px; transition: .2s; }
.quick a:nth-child(2) { background: linear-gradient(110deg, #e9e2ff, #e1e8ff); }
.quick a:nth-child(3) { background: linear-gradient(110deg, #d8f8f2, #e4f8ff); }
.quick .qi { font-size: 22px; }
.quick small { color: var(--muted); font-size: 11px; }

.phrase { position: relative; overflow: hidden; }
.phrase .label { font-size: 12px; color: #7771d4; }
.phrase .ph { margin-top: 16px; }
.phrase .ph + .ph { padding-top: 14px; border-top: 1px solid var(--line-soft); }
.phrase .kr { font-size: 23px; font-weight: 700; margin: 0 0 4px; }
.phrase .tr { color: var(--muted); font-size: 13px; }

.pline { height: 10px; background: #eeeafd; border-radius: 10px; overflow: hidden; margin: 15px 0; }
.pline div { height: 100%; background: linear-gradient(90deg, #e9a7ed, #88cfff); border-radius: 10px; transition: width .3s; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); text-align: center; }
.stats div + div { border-left: 1px solid var(--line-soft); }
.stats strong { display: block; font-size: 17px; font-variant-numeric: lining-nums; }
.stats small { font-size: 10px; color: var(--muted); }
.note { margin: 12px 0 0; font-size: 11px; color: var(--muted); line-height: 1.5; }
.locked { display: block; font-size: 13px; color: var(--muted); }

.month { font-size: 11px; color: var(--muted); margin-bottom: 10px; text-transform: capitalize; }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 7px; text-align: center; }
.cal span { font-size: 10px; color: var(--muted); padding: 4px 0; }
.cal i { display: grid; place-items: center; aspect-ratio: 1; border-radius: 50%; background: #f3efff; color: #8a83c8; font-size: 11px; font-style: normal; }
.cal i.done { background: linear-gradient(135deg, #a8c7ff, #c3a7ff); color: #fff; }
.cal i.today { outline: 2px solid #ed9fe1; outline-offset: 2px; }

.quote { min-height: 150px; background: linear-gradient(120deg, #648ee0, #a8b9f6 55%, #f0bde4); color: #fff; position: relative; overflow: hidden; }
.quote::after { content: "🌸  ✦  서울"; position: absolute; right: 6px; bottom: 0; font-size: 28px; opacity: .55; }
.quote p { max-width: 245px; line-height: 1.65; font-size: 13px; position: relative; z-index: 1; margin: 0 0 14px; }
.quote a { display: inline-block; background: #fff; color: #5c60b5; border-radius: 25px; padding: 10px 15px; font-size: 12px; position: relative; z-index: 1; }

@media (max-width: 1100px) {
  .dash { grid-template-columns: 1fr; }
  .dcol:last-child { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .lessons, .words { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .quick, .dcol:last-child { grid-template-columns: 1fr; }
  .hero { min-height: 280px; padding: 23px; }
  .hero h2 { font-size: 30px; }
}
</style>
