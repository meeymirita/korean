<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import DictShell from '@/components/dict/DictShell.vue'
import { searchMock } from '@/data/korean/krdictMock'

const route = useRoute()
const router = useRouter()
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const focused = ref(false)
const input = ref<HTMLInputElement | null>(null)

const active = computed(() => focused.value || q.value.trim() !== '')
const results = computed(() => searchMock(q.value))

/** слово в адресе: после обновления страницы поиск остаётся */
function sync() {
  const v = q.value.trim()
  void router.replace({ query: v ? { q: v } : {} })
}
</script>

<template>
  <DictShell>
    <div class="dict" :class="{ on: active }">
      <div class="hero">
        <h1>Большой словарь</h1>
        <p class="lead">Больше пятидесяти тысяч слов с русским переводом. Ищи по-корейски или по-русски.</p>
      </div>

      <form class="search" :class="{ wide: results.length > 0 && q.trim() !== '' }" role="search" @submit.prevent="sync">
        <input
          ref="input"
          v-model="q"
          type="search"
          lang="ko"
          autocomplete="off"
          spellcheck="false"
          placeholder="Найти слово: 학교, школа…"
          aria-label="Поиск по большому словарю"
          @focus="focused = true"
          @blur="focused = false; sync()"
          @keydown.esc="input?.blur()"
        >
      </form>

      <section v-if="q.trim()" class="res" aria-live="polite">
        <p v-if="!results.length" class="none">Ничего не нашлось. Попробуй начало слова или русский перевод.</p>
        <template v-else>
          <p class="count">Найдено: {{ results.length }}</p>
          <RouterLink v-for="e in results" :key="e.id" :to="`/dict/${e.word}`" class="card">
            <header class="ch">
              <h3 lang="ko">{{ e.word }}</h3>
              <span v-if="e.homonym" class="hom">№{{ e.homonym }}</span>
              <span class="pron">[{{ e.pron }}]</span>
              <span class="chip">{{ e.pos }}</span>
              <span class="chip lvl">{{ e.level }}</span>
            </header>
            <ol class="senses">
              <li v-for="(s, i) in e.senses" :key="i">
                <span class="num">{{ i + 1 }}</span>
                <div class="sb">
                  <p class="ru">{{ s.ru.map(r => r.translation).join(' · ') }}</p>
                  <p v-if="s.ru[0]?.definition" class="rd">{{ s.ru[0].definition }}</p>
                  <p class="ko" lang="ko">{{ s.definition }}</p>
                  <div v-if="s.example" class="ex">
                    <span lang="ko">{{ s.example }}</span>
                    <small v-if="s.exampleRu">{{ s.exampleRu }}</small>
                  </div>
                </div>
              </li>
            </ol>
            <footer v-if="e.forms || e.synonyms" class="more">
              <template v-if="e.forms"><span class="lab">Формы</span><span v-for="f in e.forms.slice(1, 4)" :key="f.ko" class="tag" lang="ko">{{ f.ko }}</span></template>
              <template v-if="e.synonyms"><span class="lab">Синонимы</span><span v-for="p in e.synonyms" :key="p.ko" class="tag alt" lang="ko">{{ p.ko }}</span></template>
              <span class="open">Открыть слово →</span>
            </footer>
          </RouterLink>
        </template>
      </section>

      <p class="demo">Страница в разработке: пока показаны тестовые слова.</p>
    </div>
  </DictShell>
</template>

<style scoped>
.dict { display: flex; flex-direction: column; align-items: center; padding-top: 18vh; transition: padding-top .5s cubic-bezier(.2, .8, .2, 1); }
.dict.on { padding-top: 14px; }
.hero { text-align: center; max-height: 160px; overflow: hidden; transition: max-height .45s ease, opacity .3s ease, margin .45s ease; margin-bottom: 22px; }
.on .hero { max-height: 0; opacity: 0; margin-bottom: 0; }
.hero h1 { margin: 0; font-size: clamp(30px, 5vw, 44px); letter-spacing: -.01em; font-weight: 800; }
.lead { margin: 10px auto 0; max-width: 460px; color: var(--muted); font-size: 15px; line-height: 1.5; }

.search { width: 100%; max-width: 720px; transition: max-width .45s cubic-bezier(.2, .8, .2, 1); }
.search.wide { max-width: 1040px; }
.search input { width: 100%; box-sizing: border-box; padding: 17px 24px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 18px; outline: none; box-shadow: var(--shadow); transition: border-color .2s, box-shadow .2s; }
.search input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--pink), var(--shadow); }
.search input::placeholder { color: var(--muted); }

.res { width: 100%; max-width: 1040px; margin-top: 22px; display: flex; flex-direction: column; gap: 16px; animation: rise .35s ease both; }
.count, .none { margin: 0; color: var(--muted); font-size: 14px; text-align: center; }
.card { display: block; padding: 24px 30px 20px; border: 1px solid #fff; border-radius: 26px; background: var(--surface); box-shadow: var(--shadow); transition: transform .2s, box-shadow .2s; }
.card:hover { transform: translateY(-2px); box-shadow: 0 22px 50px rgba(100, 87, 170, .18); }
.ch { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 14px; padding-bottom: 16px; border-bottom: 1px dashed var(--line); }
.ch h3 { margin: 0; font-size: 40px; line-height: 1.1; font-weight: 700; }
.hom, .pron { color: var(--muted); font-size: 15px; }
.chip { padding: 4px 14px; border-radius: 999px; background: var(--pink); color: var(--accent); font-size: 12.5px; font-weight: 600; }
.chip.lvl { background: var(--soft); color: var(--accent2); }
.senses { list-style: none; margin: 16px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.senses li { display: flex; gap: 16px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 18px; background: rgba(255, 255, 255, .6); }
.num { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 11px; background: var(--pink); color: var(--accent); font-weight: 700; font-size: 14px; }
.sb { min-width: 0; flex: 1; }
.sb p { margin: 0; }
.ru { font-size: 19px; font-weight: 700; }
.rd { margin-top: 2px; font-size: 14px; color: var(--ink); opacity: .75; }
.ko { margin-top: 4px; font-size: 14px; color: var(--muted); line-height: 1.5; }
.ex { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; padding: 10px 14px; border-radius: 12px; background: linear-gradient(90deg, var(--pink), rgba(241, 236, 255, .7)); font-size: 16px; line-height: 1.5; }
.ex small { font-size: 13px; color: var(--muted); }
.more { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.lab { margin-left: 4px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.lab:first-child { margin-left: 0; }
.tag { padding: 4px 12px; border-radius: 999px; background: var(--soft); color: var(--accent2); font-size: 14px; font-weight: 600; }
.tag.alt { background: var(--pink); color: var(--accent); }
.open { margin-left: auto; font-size: 13px; font-weight: 600; color: var(--accent2); }
.demo { margin: 28px 0 0; font-size: 12.5px; color: var(--muted); }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .dict, .hero, .res, .search { transition: none; animation: none; } }
@media (max-width: 600px) { .card { padding: 18px 16px; } .ch h3 { font-size: 32px; } .senses li { padding: 12px; gap: 12px; } }
</style>
