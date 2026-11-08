<script setup lang="ts">
import DictShell from '@/components/dict/DictShell.vue'
import { DICT_MOCK } from '@/data/korean/krdictMock'

/** Временная страница: 30 вариантов карточки результата поиска. Владелец выберет номер, остальные удалим. */
const e = DICT_MOCK[0]!
const s = e.senses[0]!
const tr = s.ru.map(r => r.translation).join('; ')
const stars = (l: string) => (l === 'начальный' ? '★☆☆' : l === 'средний' ? '★★☆' : '★★★')

const SK = ['dd-sk-classic', 'dd-sk-side', 'dd-sk-bubble', 'dd-sk-compact', 'dd-sk-tiles', 'dd-sk-ticket'] as const
const THEMES = ['dd-pink', 'dd-blue', 'dd-mint', 'dd-lilac', 'dd-peach'] as const
const EMOJI = ['🎓', '📚', '✏️', '🏫', '🌸', '⭐', '💬', '🔖', '☁️', '🍀', '🎒', '🧸', '🍓', '🌷', '🪄', '📝', '🎀', '🫧', '🌈', '🍞', '🦋', '💡', '🎈', '🪷', '🍑', '🧩', '🎨', '🛎️', '🧁', '🌙']
const VARIANTS = Array.from({ length: 30 }, (_, i) => ({
  n: i + 1,
  sk: SK[i % 6]!,
  theme: THEMES[Math.floor(i / 6) % 5]!,
  emoji: EMOJI[i]!,
  round: i % 4 === 1 ? 'dd-r-sq' : i % 4 === 3 ? 'dd-r-pill' : '',
}))
</script>

<template>
  <DictShell>
    <section class="dd-intro">
      <h1>Варианты карточек</h1>
      <p>30 вариантов одной и той же карточки слова. Скажи номер, какой оставить. Смайлики можно заменить на значки или убрать.</p>
    </section>

    <div class="dd-grid">
      <div v-for="v in VARIANTS" :key="v.n" class="dd-cell">
        <span class="dd-no">№{{ v.n }}</span>

        <article class="dd-card" :class="[v.sk, v.theme, v.round]">
          <!-- classic -->
          <template v-if="v.sk === 'dd-sk-classic'">
            <header class="dd-ch">
              <span class="dd-em">{{ v.emoji }}</span>
              <h3 lang="ko">{{ e.word }}</h3>
              <span class="dd-pron">[{{ e.pron }}]</span>
              <span class="dd-chip">{{ e.pos }}</span>
              <span class="dd-chip dd-lvl">{{ e.level }}</span>
            </header>
            <p class="dd-ru">{{ tr }}</p>
            <p class="dd-rd">{{ s.ru[0]?.definition }}</p>
            <p class="dd-kd" lang="ko">{{ s.definition }}</p>
            <p class="dd-ex"><span lang="ko">{{ s.example }}</span><small>{{ s.exampleRu }}</small></p>
          </template>

          <!-- side -->
          <template v-else-if="v.sk === 'dd-sk-side'">
            <aside class="dd-panel">
              <span class="dd-em dd-big">{{ v.emoji }}</span>
              <h3 lang="ko">{{ e.word }}</h3>
              <span class="dd-pron">[{{ e.pron }}]</span>
              <span class="dd-chip">{{ e.pos }}</span>
              <span class="dd-stars">{{ stars(e.level) }}</span>
            </aside>
            <div class="dd-rest">
              <p class="dd-ru">{{ tr }}</p>
              <p class="dd-rd">{{ s.ru[0]?.definition }}</p>
              <p class="dd-kd" lang="ko">{{ s.definition }}</p>
              <p class="dd-ex"><span lang="ko">{{ s.example }}</span><small>{{ s.exampleRu }}</small></p>
            </div>
          </template>

          <!-- bubble -->
          <template v-else-if="v.sk === 'dd-sk-bubble'">
            <header class="dd-band">
              <h3 lang="ko">{{ e.word }}</h3>
              <span class="dd-pron">[{{ e.pron }}]</span>
              <span class="dd-grow"></span>
              <span class="dd-chip">{{ e.pos }}</span>
              <span class="dd-chip dd-lvl">{{ stars(e.level) }}</span>
            </header>
            <div class="dd-inner">
              <p class="dd-ru">{{ tr }}</p>
              <p class="dd-kd" lang="ko">{{ s.definition }}</p>
              <div class="dd-chat">
                <span class="dd-em dd-av">{{ v.emoji }}</span>
                <p class="dd-ex"><span lang="ko">{{ s.example }}</span><small>{{ s.exampleRu }}</small></p>
              </div>
            </div>
          </template>

          <!-- compact -->
          <template v-else-if="v.sk === 'dd-sk-compact'">
            <div class="dd-row">
              <span class="dd-em">{{ v.emoji }}</span>
              <h3 lang="ko">{{ e.word }}</h3>
              <span class="dd-pron">[{{ e.pron }}]</span>
              <span class="dd-ru">{{ tr }}</span>
              <span class="dd-grow"></span>
              <span class="dd-chip">{{ e.pos }}</span>
              <span class="dd-arrow">→</span>
            </div>
            <p class="dd-kd" lang="ko">{{ s.example }} <small>{{ s.exampleRu }}</small></p>
          </template>

          <!-- tiles -->
          <template v-else-if="v.sk === 'dd-sk-tiles'">
            <header class="dd-hero">
              <span class="dd-em dd-big">{{ v.emoji }}</span>
              <h3 lang="ko">{{ e.word }}</h3>
              <span class="dd-pron">[{{ e.pron }}] · {{ e.pos }} · {{ e.level }}</span>
            </header>
            <div class="dd-tiles">
              <div class="dd-tile"><b>Перевод</b><p class="dd-ru">{{ tr }}</p><p class="dd-rd">{{ s.ru[0]?.definition }}</p></div>
              <div class="dd-tile"><b>Определение</b><p class="dd-kd" lang="ko">{{ s.definition }}</p></div>
              <div class="dd-tile"><b>Пример</b><p class="dd-ex"><span lang="ko">{{ s.example }}</span><small>{{ s.exampleRu }}</small></p></div>
            </div>
          </template>

          <!-- ticket -->
          <template v-else>
            <aside class="dd-stub">
              <span class="dd-em dd-big">{{ v.emoji }}</span>
              <span class="dd-stars">{{ stars(e.level) }}</span>
              <span class="dd-lv">{{ e.level }}</span>
            </aside>
            <div class="dd-rest">
              <header class="dd-ch">
                <h3 lang="ko">{{ e.word }}</h3>
                <span class="dd-pron">[{{ e.pron }}]</span>
                <span class="dd-chip">{{ e.pos }}</span>
              </header>
              <p class="dd-ru">{{ tr }}</p>
              <p class="dd-kd" lang="ko">{{ s.definition }}</p>
              <p class="dd-ex"><span lang="ko">{{ s.example }}</span><small>{{ s.exampleRu }}</small></p>
            </div>
          </template>
        </article>
      </div>
    </div>
  </DictShell>
</template>

<style scoped>
.dd-intro h1 { margin: 18px 0 6px; font-size: 30px; font-weight: 800; }
.dd-intro p { margin: 0 0 20px; color: var(--muted); font-size: 14px; }
.dd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(460px, 1fr)); gap: 22px 20px; }
.dd-cell { position: relative; min-width: 0; }
.dd-no { display: inline-block; margin: 0 0 6px 6px; font-size: 12px; font-weight: 700; letter-spacing: .06em; color: var(--accent2); }

/* темы */
.dd-card { --a: #d64da9; --bg: #ffe3f3; --bg2: #fff3fa; --t: #7b2a63; }
.dd-blue { --a: #4a78e0; --bg: #dde9ff; --bg2: #f1f6ff; --t: #26407f; }
.dd-mint { --a: #2e9e83; --bg: #d9f5ec; --bg2: #effbf7; --t: #17604e; }
.dd-lilac { --a: #7a5ce0; --bg: #e8e0ff; --bg2: #f6f2ff; --t: #43308c; }
.dd-peach { --a: #e2793e; --bg: #ffe5d3; --bg2: #fff4ec; --t: #86411a; }

.dd-card { --r: 24px; border: 1px solid #fff; border-radius: var(--r); background: var(--surface); box-shadow: var(--shadow); overflow: hidden; }
.dd-r-sq { --r: 8px; }
.dd-r-pill { --r: 38px; }
.dd-card :is(p) { margin: 0; }
.dd-card h3 { margin: 0; font-weight: 700; }
.dd-pron { color: var(--muted); font-size: 14px; }
.dd-chip { padding: 3px 12px; border-radius: 999px; background: var(--bg); color: var(--a); font-size: 12px; font-weight: 700; white-space: nowrap; }
.dd-chip.dd-lvl { background: transparent; border: 1px solid var(--bg); color: var(--t); }
.dd-em { font-size: 24px; line-height: 1; }
.dd-em.dd-big { font-size: 40px; }
.dd-ru { font-size: 18px; font-weight: 700; color: var(--t); }
.dd-rd { font-size: 13.5px; opacity: .75; margin-top: 2px; }
.dd-kd { font-size: 13.5px; color: var(--muted); line-height: 1.5; margin-top: 4px; }
.dd-ex { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: 14px; background: linear-gradient(90deg, var(--bg), var(--bg2)); font-size: 15px; line-height: 1.5; margin-top: 10px; }
.dd-ex small, .dd-kd small { font-size: 12.5px; color: var(--muted); }
.dd-stars { color: var(--a); letter-spacing: 2px; font-size: 13px; }
.dd-grow { flex: 1; }

/* classic */
.dd-sk-classic { padding: 20px 24px; }
.dd-sk-classic .dd-ch { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-bottom: 12px; margin-bottom: 12px; border-bottom: 2px dotted var(--bg); }
.dd-sk-classic h3 { font-size: 32px; }

/* side */
.dd-sk-side { display: grid; grid-template-columns: 150px 1fr; }
.dd-sk-side .dd-panel { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 18px 10px; background: linear-gradient(160deg, var(--bg), var(--bg2)); text-align: center; }
.dd-sk-side h3 { font-size: 30px; color: var(--t); }
.dd-sk-side .dd-rest { padding: 18px 22px; }

/* bubble */
.dd-band { display: flex; align-items: baseline; gap: 10px; padding: 14px 22px; background: linear-gradient(90deg, var(--bg), var(--bg2)); }
.dd-sk-bubble h3 { font-size: 28px; color: var(--t); }
.dd-sk-bubble .dd-inner { padding: 16px 22px 20px; }
.dd-chat { display: flex; align-items: flex-end; gap: 10px; margin-top: 12px; }
.dd-chat .dd-ex { margin-top: 0; border-radius: 16px 16px 16px 4px; }
.dd-av { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background: var(--bg); font-size: 20px; flex: none; }

/* compact */
.dd-sk-compact { padding: 14px 20px; }
.dd-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; }
.dd-sk-compact h3 { font-size: 24px; }
.dd-sk-compact .dd-ru { font-size: 15px; }
.dd-arrow { color: var(--a); font-weight: 700; }
.dd-sk-compact .dd-kd { margin-top: 6px; }

/* tiles */
.dd-hero { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 18px 16px 12px; background: linear-gradient(180deg, var(--bg), transparent); text-align: center; }
.dd-sk-tiles h3 { font-size: 34px; color: var(--t); }
.dd-sk-tiles .dd-tiles { display: grid; grid-template-columns: 1fr; gap: 8px; padding: 0 16px 16px; }
.dd-tile { padding: 10px 14px; border-radius: 14px; background: var(--bg2); border: 1px solid var(--bg); }
.dd-tile b { display: block; margin-bottom: 4px; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--a); }
.dd-tile .dd-ex { margin-top: 0; background: none; padding: 0; }

/* ticket */
.dd-sk-ticket { display: grid; grid-template-columns: 110px 1fr; }
.dd-stub { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 14px 8px; background: var(--bg); border-right: 2px dashed var(--a); position: relative; }
.dd-stub .dd-lv { font-size: 11px; color: var(--t); font-weight: 600; }
.dd-sk-ticket .dd-rest { padding: 16px 20px; }
.dd-sk-ticket .dd-ch { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 10px; margin-bottom: 6px; }
.dd-sk-ticket h3 { font-size: 28px; }

@media (max-width: 560px) { .dd-grid { grid-template-columns: minmax(0, 1fr); } .dd-sk-side { grid-template-columns: 110px 1fr; } }
</style>
