<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { D } from '@/data/korean/words'
import { G } from '@/data/korean/grammar'
import { useHomePicks } from '@/composables/useHome'
import { withSeed } from '@/lib/seeded'
import { shuffle } from '@/data/korean/tasks'
import BlockBgLayer from '@/components/korean/BlockBgLayer.vue'
import DayStatsModal from '@/components/korean/DayStatsModal.vue'
import { useSiteImagesStore } from '@/stores/siteImages'
import { useQueryParam } from '@/composables/useQueryParam'
import { dueWords } from '@/data/review'
import { plural } from '@/lib/plural'
import { KNOWN_STREAK, dayKey, useProgressStore } from '@/stores/progress'
import catWave from '@/assets/home/dash/cat-wave.webp'
import bgYuna from '@/assets/home/dash/bg-yuna.webp'
import qFire from '@/assets/home/dash/q-fire.webp'
import qNotes from '@/assets/home/dash/q-notes.webp'
import qBread from '@/assets/home/dash/q-bread.webp'
import qArrows from '@/assets/home/dash/q-arrows.webp'
import qSprout from '@/assets/home/dash/q-sprout.webp'
import qPuzzle from '@/assets/home/dash/q-puzzle.webp'

const progress = useProgressStore()

const grammarDone = G.filter(g => g.st === 'ok').length
const known = computed(() => D.filter(d => progress.status(d.k) === 'known').length)
const answers = computed(() =>
  Object.values(progress.data.sources).reduce((n, x) => n + x.ok + x.bad, 0),
)
const percent = computed(() => Math.round((known.value / D.length) * 100))
/** Сколько слов пора повторить: показываем подсказкой, только если прогресс открыт и такие слова есть. */
const dueCount = computed(() => (progress.unlocked ? dueWords(progress.data).length : 0))
const dueLabel = computed(() => plural(dueCount.value, ['слово', 'слова', 'слов']))

/** Пять слов на сегодня: другие после каждой перезагрузки страницы. */
const { seed, rule: HOME_RULE, phrases: HOME_PHRASES } = useHomePicks()
// пять случайных слов на эту загрузку страницы: от зерна, одинаково на сервере и в браузере
const words = withSeed(seed + ':words', () => shuffle(D).slice(0, 5))

/** Фоны трёх блоков меняются в режиме редактирования (шестерёнка в углу блока): подмена хранится на сервере и видна всем. */
const siteImages = useSiteImagesStore()
/** Положение стандартного фона: лицо Юны в верхней трети картинки, поэтому y = 28% */
const PLACE = { hero: { x: 62, y: 28, zoom: 1 }, words: { x: 50, y: 50, zoom: 1 }, quote: { x: 55, y: 28, zoom: 1 } }
const editBlock = (id: keyof typeof PLACE) => window.dispatchEvent(new CustomEvent('site-image-edit', { detail: { key: 'block-' + id, place: PLACE[id] } }))

const rule = HOME_RULE
const ruleText = rule.label.replace(/^Грамматика · /, '')


/** Быстрый доступ: стикеры из набора «Пастельный набор кавайных стикеров» (src/assets/home/dash/q-*.webp) */
const quick = [
  { img: qFire, title: '5 минут', to: '/game/home?game=quick' },
  { img: qNotes, title: 'Задания дня', to: '/korean/today' },
  { img: qBread, title: 'Игра на слова', to: '/game/home' },
  { img: qArrows, title: 'Повторение', to: '/korean/review' },
  { img: qSprout, title: 'Сад', to: '/korean/garden' },
  { img: qPuzzle, title: 'Тренажёры', to: '/game/home' },
]

/* календарь: только текущая неделя (Пн–Вс), дни с верными ответами закрашены */
const now = new Date()
const monthLabel = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(now)
const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
const week = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    return { d: d.getDate(), key: dayKey(d), done: (progress.data.days[dayKey(d)] ?? 0) > 0, today: d.toDateString() === now.toDateString() }
  }),
)
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

/** День, открытый в окне статистики (`?day=`): только дни этой недели, дальше в адрес не пишем. */
const openDay = useQueryParam('day', '', week.value.map(c => c.key))
</script>

<template>
  <div class="dash">
    <div class="dcol">
      <section class="hero">
        <BlockBgLayer id="hero" :fallback="bgYuna" :place="PLACE.hero" veil />
        <button v-if="siteImages.editMode" class="gear" title="Фон блока" aria-label="Настроить фон блока" @click="editBlock('hero')">⚙︎</button>
        <div class="hero-in">
          <span class="eyebrow">СЕЙЧАС ИЗУЧАЕМ · УРОВЕНЬ 1A</span>
          <h2 class="ko">{{ rule.rule }}</h2>
          <h3>{{ ruleText }}</h3>
          <p class="ko">{{ rule.examples }}</p>
          <RouterLink class="primary" :to="rule.to">Открыть правило&nbsp; →</RouterLink>
        </div>
      </section>

      <section class="panel">
        <div class="sh"><h3>✧ Быстрый доступ</h3></div>
        <div class="quick">
          <RouterLink v-for="q in quick" :key="q.to + q.title" :to="q.to">
            <img class="qi" :src="q.img" alt="" aria-hidden="true" draggable="false" />
            <b>{{ q.title }}</b>
          </RouterLink>
        </div>
      </section>

      <section class="panel wpanel" :class="{ pic: siteImages.items['block-words']?.src }">
        <BlockBgLayer id="words" />
        <span class="spark s1" aria-hidden="true">✦</span><span class="spark s2" aria-hidden="true">✧</span><span class="spark s3" aria-hidden="true">✦</span>
        <div class="sh"><h3>▤ Слова на сегодня</h3><span class="shr"><RouterLink to="/korean/words" class="tbtn">Все слова →</RouterLink><button v-if="siteImages.editMode" class="gear in" title="Фон блока" aria-label="Настроить фон блока" @click="editBlock('words')">⚙︎</button></span></div>
        <div class="words">
          <RouterLink v-for="(w, i) in words" :key="w.n" :to="{ path: '/korean/words', query: { q: w.k } }" class="word" :class="'c' + (i % 5)">
            <i class="wn">{{ i + 1 }}</i>
            <strong class="ko">{{ w.k }}</strong>
            <small>{{ w.r }}</small>
            <small>{{ w.t }}</small>
          </RouterLink>
        </div>
      </section>
    </div>

    <div class="dcol">
      <section class="panel phrase">
        <img class="phrase-cat" :src="catWave" alt="" aria-hidden="true" draggable="false" />
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
          <RouterLink v-if="dueCount" to="/korean/review" class="due-hint"><Icon name="arrows" /> Пора повторить {{ dueCount }} {{ dueLabel }} →</RouterLink>
          <p class="note">слово выучено, когда набрал {{ KNOWN_STREAK }} очков: верный ответ +1, ошибка −1</p>
        </template>
        <RouterLink v-else to="/korean/cabinet" class="locked">
          <div class="sh"><h3>Твой прогресс</h3></div>
          <Icon name="lock" /> Личная статистика откроется после входа по токену
        </RouterLink>
      </section>

      <section class="panel">
        <div class="sh"><h3>Календарь активности</h3><RouterLink to="/korean/cabinet" class="tbtn">Кабинет →</RouterLink></div>
        <div class="month">{{ monthLabel }}</div>
        <div class="cal">
          <span v-for="d in WD" :key="d">{{ d }}</span>
          <button
            v-for="c in week"
            :key="c.key"
            type="button"
            class="cell"
            :class="{ done: c.done, today: c.today }"
            :aria-label="`Статистика за ${c.key}`"
            @click="openDay = c.key"
          >{{ c.d }}</button>
        </div>
      </section>

      <section class="panel quote">
        <BlockBgLayer id="quote" :fallback="bgYuna" :place="PLACE.quote" veil />
        <button v-if="siteImages.editMode" class="gear" title="Фон блока" aria-label="Настроить фон блока" @click="editBlock('quote')">⚙︎</button>
        <p>Корея — это не только язык, но и новые возможности, люди и мечты. ♡</p>
        <RouterLink to="/korean/today">Всё получится →</RouterLink>
      </section>
    </div>

    <DayStatsModal v-if="openDay" :day="openDay" @close="openDay = ''" />
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

/* ===== «Сейчас изучаем» (котика `assets/home/dash/cat-sleep.webp` убрали временно) ===== */
.hero { min-height: 290px; position: relative; overflow: hidden; border-radius: 22px; color: #fff; padding: 28px;
  background: radial-gradient(circle at 78% 30%, rgba(255, 214, 244, .55), transparent 45%),
    linear-gradient(115deg, #6a5bc0, #8c78da 55%, #b7a2ee);
  box-shadow: var(--shadow); }
.hero::before { content: "✦      ✧         ✦"; position: absolute; right: 20px; top: 16px; color: #ffe3f6;
  font-size: 22px; letter-spacing: 14px; opacity: .85; }
.hero-in { position: relative; z-index: 2; max-width: 52%; }
.eyebrow { display: inline-block; background: rgba(255, 255, 255, .88); color: #5b4fb3; border-radius: 30px; padding: 7px 12px; font-size: 12px; font-weight: 600; }
.hero h2 { font-size: 34px; margin: 17px 0 2px; }
.hero h3 { font-size: 17px; font-weight: 600; margin: 0 0 12px; }
.hero p { max-width: 300px; line-height: 1.55; font-size: 14px; color: #f0edff; margin: 0 0 14px; }
.primary { display: inline-block; padding: 13px 19px; border-radius: 28px; background: #fff;
  color: #5b4fb3; font-weight: 700; transition: .2s; }
.primary:hover { filter: brightness(1.04); transform: translateY(-1px); }


/* шестерёнка настройки фона */
.gear { position: absolute; z-index: 4; top: 12px; right: 12px; width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
  background: rgba(255, 255, 255, .55); color: #5b4fb3; font: inherit; font-size: 17px; line-height: 1; cursor: pointer; opacity: .7; transition: .2s; backdrop-filter: blur(4px); }
.gear:hover, .gear:focus-visible { opacity: 1; background: rgba(255, 255, 255, .95); transform: rotate(60deg); }
.gear.in { position: static; width: 28px; height: 28px; font-size: 15px; background: rgba(255, 255, 255, .8); }
.shr { display: inline-flex; align-items: center; gap: 8px; }
.hero .gear { top: 14px; right: 14px; }
.quote .gear { top: 10px; right: 10px; }
.hero::before { z-index: 1; }

/* ===== «Слова на сегодня»: пастельная подложка и цветные карточки ===== */
.wpanel { position: relative; overflow: hidden; border-color: #fff;
  background: radial-gradient(circle at 12% 0%, rgba(255, 214, 244, .75), transparent 42%), radial-gradient(circle at 92% 100%, rgba(173, 224, 255, .75), transparent 45%),
    linear-gradient(135deg, #f6efff, #eef3ff 60%, #fdf1fb); }
.wpanel.pic { background: none; }
.wpanel > :not(.bgl):not(.spark) { position: relative; z-index: 1; }
.spark { position: absolute; z-index: 0; color: #c9b8f5; opacity: .7; pointer-events: none; user-select: none; }
.spark.s1 { top: 14px; left: 46%; font-size: 14px; }
.spark.s2 { bottom: 12px; left: 8px; font-size: 18px; color: #f2b6e3; }
.spark.s3 { bottom: 20px; right: 20px; font-size: 13px; color: #a9d3f5; }
.words { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.word { --a: #c3a7ff; --b: #a8c7ff; position: relative; overflow: hidden; background: rgba(255, 255, 255, .82); border: 1px solid #fff; border-radius: 18px; padding: 16px 11px 12px;
  box-shadow: 0 6px 16px rgba(124, 108, 200, .12); transition: transform .2s, box-shadow .2s; min-width: 0; }
.word::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 5px; background: linear-gradient(90deg, var(--a), var(--b)); }
.word:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(124, 108, 200, .22); }
.word.c1 { --a: #f8b9e9; --b: #c3a7ff; }
.word.c2 { --a: #9de4ff; --b: #a8c7ff; }
.word.c3 { --a: #ffd6a8; --b: #f8b9e9; }
.word.c4 { --a: #b8f0d2; --b: #9de4ff; }
.wn { position: absolute; top: 12px; right: 9px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 50%; background: linear-gradient(135deg, var(--a), var(--b));
  color: #fff; font-size: 10px; font-style: normal; font-weight: 700; }
.word strong { display: block; font-size: 20px; margin-bottom: 6px; padding-right: 18px; overflow-wrap: anywhere; }
.word small { display: block; color: var(--muted); font-size: 11px; line-height: 1.6; }
.word small:nth-of-type(2) { margin-top: 4px; padding-top: 5px; border-top: 1px dashed #ddd6f7; color: #4d4a86; font-size: 12px; font-weight: 600; }

/* ===== Быстрый доступ: стикеры ===== */
.quick { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.quick a { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 14px 6px 12px; border-radius: 22px;
  background: rgba(255, 255, 255, .6); border: 1px solid #fff; font-size: 12px; text-align: center; transition: .2s; }
.quick a:hover { background: rgba(255, 255, 255, .95); }
.quick .qi { width: 54px; height: 54px; object-fit: contain; }
.quick b { font-weight: 600; line-height: 1.25; }

.phrase { position: relative; overflow: hidden; }
.phrase-cat { position: absolute; right: 8px; top: 6px; width: 104px; height: auto; pointer-events: none; user-select: none; }
.phrase .label, .phrase .ph { padding-right: 96px; }
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
.due-hint { display: flex; align-items: center; gap: 6px; margin-top: 14px; padding: 9px 14px; border-radius: 999px; background: rgba(168, 199, 255, .25); color: #4d4a86; font-size: 12.5px; font-weight: 600; transition: .15s; }
.due-hint:hover { background: rgba(168, 199, 255, .4); }
.note { margin: 12px 0 0; font-size: 11px; color: var(--muted); line-height: 1.5; }
.locked { display: block; font-size: 13px; color: var(--muted); }

.month { font-size: 11px; color: var(--muted); margin-bottom: 10px; text-transform: capitalize; }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 9px 7px; text-align: center; }
.cal span { font-size: 10px; color: var(--muted); padding: 4px 0; }
.cal .cell { display: grid; place-items: center; aspect-ratio: 1; border: 0; border-radius: 50%; background: #f3efff; color: #8a83c8; font: inherit; font-size: 11px; cursor: pointer; transition: transform .15s; }
.cal .cell:hover, .cal .cell:focus-visible { transform: scale(1.1); }
.cal .cell:hover:not(.done), .cal .cell:focus-visible:not(.done) { background: #e7defb; }
.cal .cell.done { background: linear-gradient(135deg, #a8c7ff, #c3a7ff); color: #fff; }
.cal .cell.today { outline: 2px solid #ed9fe1; outline-offset: 2px; }

/* ===== «Корея — это не только язык…» ===== */
.quote { min-height: 150px; background: linear-gradient(120deg, #7f78d8, #a8a0ee 55%, #e3b4ea); color: #fff; position: relative; overflow: hidden; }
.quote p { max-width: 90%; line-height: 1.65; font-size: 14px; position: relative; z-index: 1; margin: 0 0 14px; }
.quote a { display: inline-block; background: #fff; color: #5c60b5; border-radius: 25px; padding: 10px 15px; font-size: 12px; position: relative; z-index: 1; font-weight: 600; }

@media (max-width: 1100px) {
  .words { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
  .dash { grid-template-columns: 1fr; }
  .dcol:last-child { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
    .quick { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .dcol:last-child { grid-template-columns: 1fr; }
  .hero-in { max-width: 100%; }
  .hero { min-height: 280px; padding: 23px; }
  .hero h2 { font-size: 30px; }
}
</style>
