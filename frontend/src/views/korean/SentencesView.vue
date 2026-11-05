<script setup lang="ts">
import Cat from '@/components/Cat.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import SentenceBreakdown from '@/components/korean/SentenceBreakdown.vue'
import { SE, parseQuery } from '@/data/korean/words'
import { hl } from '@/data/korean/render'
import { usePersisted } from '@/composables/usePersisted'
import { resultFromSearchReply, searchRemote } from '@/data/korean/search'
import type { Word } from '@/data/korean/words'

const q = usePersisted('sent_q', '', v => typeof v === 'string')
const input = ref<HTMLInputElement>()
const openN = ref<number | null>(null)
const remoteRows = ref<Word[] | null>(null)
const remoteTotal = ref(0)
const remoteOffset = ref(0)
const remoteLoading = ref(false)
let remoteTimer: ReturnType<typeof setTimeout> | undefined
let remoteRequest = 0
const toggle = (n: number) => (openN.value = openN.value === n ? null : n)
const qs = computed(() => parseQuery(q.value))
const localRows = computed(() =>
  qs.value.length
    ? SE.filter(d => qs.value.every(w => d.s.includes(w) || d.k.includes(w) || d.ft.includes(w) || d.fr.includes(w)))
    : SE,
)
const rows = computed(() => remoteRows.value ?? localRows.value)

function fromReply(reply: Awaited<ReturnType<typeof searchRemote>>): Word[] {
  if (!reply) return []
  return resultFromSearchReply(reply).sentences.map(sentence => SE.find(word => word.s === sentence.s)).filter((word): word is Word => !!word)
}

function requestRemote(value: string) {
  clearTimeout(remoteTimer)
  const request = ++remoteRequest
  remoteRows.value = null
  remoteTotal.value = 0
  remoteOffset.value = 0
  if (!value.trim()) return
  remoteTimer = setTimeout(async () => {
    const reply = await searchRemote(value, 0, 'sentence')
    if (request === remoteRequest && reply) {
      remoteRows.value = fromReply(reply)
      remoteTotal.value = reply.total
      remoteOffset.value = reply.offset + reply.hits.length
    }
  }, 180)
}
watch(q, requestRemote)

async function loadMore() {
  if (remoteLoading.value || remoteOffset.value >= remoteTotal.value) return
  remoteLoading.value = true
  const request = remoteRequest
  try {
    const reply = await searchRemote(q.value, remoteOffset.value, 'sentence')
    if (reply && request === remoteRequest) {
      remoteRows.value = [...(remoteRows.value ?? []), ...fromReply(reply)]
      remoteOffset.value = reply.offset + reply.hits.length
      remoteTotal.value = reply.total
    }
  } finally {
    remoteLoading.value = false
  }
}
onMounted(() => { if (q.value) requestRemote(q.value) })
onBeforeUnmount(() => { clearTimeout(remoteTimer); remoteRequest++ })
</script>

<template>
  <div class="wrap">
    <SectionHead id="sentences" :big="SE.length" />
    <div class="searchbar">
      <div class="sb">
        <input ref="input" v-model="q" type="text" autocomplete="off" placeholder="поиск по предложению, слову или переводу" />
        <button title="Очистить" aria-label="Очистить" @click="((q = ''), input?.focus())">✕</button>
      </div>
      <div class="meta"><span>{{ qs.length ? 'Найдено: ' : 'Всего предложений: ' }}{{ remoteRows !== null ? remoteTotal : rows.length }}</span></div>
    </div>
    <button v-if="remoteRows !== null && remoteOffset < remoteTotal" type="button" class="chip" :disabled="remoteLoading" @click="loadMore">{{ remoteLoading ? 'Загружаю…' : 'Показать ещё предложения' }}</button>
    <div class="tb">
      <template v-for="d in rows" :key="d.n">
        <div class="sc">
          <div class="ko">
            <button class="se-btn" :class="{ open: openN === d.n }" title="Разобрать предложение" @click="toggle(d.n)" v-html="hl(d.s, qs)"></button>
          </div>
          <div class="sw"><i>{{ d.n }}</i><b v-html="hl(d.k, qs)"></b> · <span v-html="hl(d.t, qs)"></span></div>
        </div>
        <div v-if="openN === d.n" class="row-detail"><SentenceBreakdown :sentence="d.s" /></div>
      </template>
      <div v-if="!rows.length" class="empty"><Cat name="think" />Ничего не нашлось.<br />Попробуй другое слово или сбрось фильтры.</div>
    </div>
  </div>
</template>
