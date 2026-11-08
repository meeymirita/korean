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

      <form class="search" role="search" @submit.prevent="sync">
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
                <p class="ru">{{ s.ru.map(r => r.translation).join('; ') }}</p>
                <p class="ko" lang="ko">{{ s.definition }}</p>
                <p v-if="s.example" class="ex" lang="ko">{{ s.example }}</p>
              </li>
            </ol>
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

.search { width: 100%; max-width: 720px; }
.search input { width: 100%; box-sizing: border-box; padding: 17px 24px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink); font: inherit; font-size: 18px; outline: none; box-shadow: var(--shadow); transition: border-color .2s, box-shadow .2s; }
.search input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--pink), var(--shadow); }
.search input::placeholder { color: var(--muted); }

.res { width: 100%; max-width: 980px; margin-top: 26px; display: flex; flex-direction: column; gap: 14px; animation: rise .35s ease both; }
.count, .none { margin: 0; color: var(--muted); font-size: 14px; text-align: center; }
.card { display: block; padding: 20px 26px; border: 1px solid #fff; border-radius: 22px; background: var(--surface); box-shadow: var(--shadow); transition: transform .2s, box-shadow .2s; }
.card:hover { transform: translateY(-2px); }
.ch { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; }
.ch h3 { margin: 0; font-size: 28px; }
.hom, .pron { color: var(--muted); font-size: 14px; }
.chip { padding: 3px 12px; border-radius: 999px; background: var(--pink); color: var(--accent); font-size: 12px; font-weight: 600; }
.chip.lvl { background: var(--soft); color: var(--accent2); }
.senses { margin: 14px 0 0; padding-left: 24px; display: flex; flex-direction: column; gap: 14px; }
.senses li::marker { color: var(--muted); font-size: 13px; }
.senses p { margin: 0; }
.ru { font-size: 18px; font-weight: 700; }
.ko { margin-top: 3px; font-size: 14px; color: var(--muted); line-height: 1.5; }
.ex { margin-top: 6px; font-size: 15px; line-height: 1.5; padding: 8px 12px; border-radius: 12px; background: var(--pink); }
.demo { margin: 28px 0 0; font-size: 12.5px; color: var(--muted); }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .dict, .hero, .res { transition: none; animation: none; } }
</style>
