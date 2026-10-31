<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { G, SECS } from '@/data/korean/grammar'
import { F } from '@/data/korean/render'
import { COURSE } from '@/data/korean/course'
import { usePersisted } from '@/composables/usePersisted'

const sec = usePersisted('grammar_sec', '', v => typeof v === 'string')
const q = ref('')
const onlyDone = usePersisted('grammar_done', false, v => typeof v === 'boolean')
const list = computed(() => {
  const w = q.value.trim().toLowerCase()
  return G.filter(g =>
    (!sec.value || g.s === sec.value) &&
    (!onlyDone.value || g.st === 'ok') &&
    (!w || [g.ko, g.ru, g.d, g.s, g.l ?? ''].some(x => x.toLowerCase().includes(w))))
})
const { open } = useGrammarModal()
const route = useRoute()
/** /korean/grammar?g=ayo сразу открывает карточку */
onMounted(() => {
  const g = String(route.query.g ?? '')
  if (G.some(x => x.id === g)) open(g)
})
</script>

<template>
  <div class="wrap">
    <SectionHead id="grammar" :big="G.length" />
    <div class="chips">
      <button class="chip" :class="{ on: !sec }" @click="sec = ''">Все</button>
      <button v-for="s in SECS" :key="s" class="chip" :class="{ on: sec === s }" @click="sec = s">{{ s }}</button>
    </div>
    <p class="gcourse">
      Уроки 1–30 принадлежат каналу
      <a :href="COURSE.channel" target="_blank" rel="noopener">{{ COURSE.teacher }} · {{ COURSE.name }}</a>:
      корейский с носителем языка, к каждому уроку есть материалы, их можно скачать бесплатно.
      <a :href="COURSE.telegram" target="_blank" rel="noopener">Telegram</a> ·
      <a :href="COURSE.instagram" target="_blank" rel="noopener">Instagram</a>
    </p>
    <div class="gsearch">
      <div class="sb">
        <input data-page-search v-model="q" type="text" autocomplete="off" placeholder="Найти правило: 은/는, прошедшее, урок 12…" />
        <button v-if="q" title="Очистить" aria-label="Очистить" @click="q = ''">✕</button>
      </div>
      <label class="gdone"><input v-model="onlyDone" type="checkbox" /> показывать только пройденное</label>
    </div>
    <p v-if="!list.length" class="gempty">Ничего не найдено.</p>
    <div class="gg">
      <button v-for="g in list" :key="g.id" class="gc" @click="open(g.id)">
        <h3 v-html="F(g.ko)"></h3>
        <div class="rn">{{ g.ru }}</div>
        <div class="d">{{ g.d }}</div>
        <div class="ft">
          <span class="pill">{{ g.s }}</span>
          <span v-if="g.l" class="pill l">{{ g.l }}</span>
          <span class="pill" :class="g.st === 'ok' ? 's' : 'n'">{{ g.st === 'ok' ? 'пройдено' : 'ещё рано' }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.gsearch { display: flex; align-items: center; gap: 16px; margin: 16px 0 0; flex-wrap: wrap; }
.gsearch .sb { flex: 1 1 260px; }
.gdone { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 14px; color: var(--muted); cursor: pointer; white-space: nowrap; }
.gcourse { margin: 14px 0 0; font-size: 14px; line-height: 1.5; color: var(--muted); }
.gcourse a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
.gempty { color: var(--muted); margin: 20px 0 0; }
</style>
