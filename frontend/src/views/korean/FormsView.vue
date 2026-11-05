<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { usePersisted } from '@/composables/usePersisted'
import { CONJUGATIONS } from '@/data/korean/conjugation'
import { norm } from '@/data/korean/render'
import { resultFromSearchReply, searchRemote } from '@/data/korean/search'
import type { Conjugation } from '@/data/korean/conjugation'

type Kind = '' | 'verb' | 'adj'
const kind = usePersisted<Kind>('forms_kind', '', v => v === '' || v === 'verb' || v === 'adj')
const q = usePersisted('forms_q', '', v => typeof v === 'string')
const remoteRows = ref<Conjugation[] | null>(null)
const remoteOffset = ref(0)
const remoteTotal = ref(0)
const loadingMore = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let requestId = 0
const { open } = useGrammarModal()

const rows = computed(() => {
  const s = norm(q.value)
  const source = remoteRows.value ?? CONJUGATIONS
  return source.filter(c => (!kind.value || c.kind === kind.value) && (!s || remoteRows.value !== null || c.k.includes(q.value.trim()) || norm(c.t).includes(s) || norm(c.r).includes(s) || c.present.includes(q.value.trim())))
})

function requestForms(value: string) {
  remoteRows.value = null
  remoteOffset.value = 0
  remoteTotal.value = 0
  clearTimeout(timer)
  const request = ++requestId
  if (!value.trim()) return
  timer = setTimeout(async () => {
    const reply = await searchRemote(value, 0, 'form')
    if (request === requestId && reply) {
      remoteRows.value = resultFromSearchReply(reply).forms
      remoteOffset.value = reply.offset + reply.hits.length
      remoteTotal.value = reply.total
    }
  }, 180)
}

async function loadMoreForms() {
  if (loadingMore.value || remoteOffset.value >= remoteTotal.value) return
  loadingMore.value = true
  const request = requestId
  try {
    const reply = await searchRemote(q.value, remoteOffset.value, 'form')
    if (request === requestId && reply) {
      remoteRows.value = [...(remoteRows.value ?? []), ...resultFromSearchReply(reply).forms]
      remoteOffset.value = reply.offset + reply.hits.length
      remoteTotal.value = reply.total
    }
  } finally {
    loadingMore.value = false
  }
}

watch(q, requestForms)
onMounted(() => { if (q.value) requestForms(q.value) })
onBeforeUnmount(() => { clearTimeout(timer); requestId++ })
</script>

<template>
  <div class="wrap">
    <SectionHead id="forms" :big="CONJUGATIONS.length" />
    <div class="searchbar">
      <div class="sb">
        <input v-model="q" type="text" autocomplete="off" placeholder="먹다, есть, мокта…" aria-label="Поиск по формам" />
        <button title="Очистить" aria-label="Очистить" @click="q = ''">✕</button>
      </div>
      <div class="chips">
        <button class="chip" :class="{ on: !kind }" @click="kind = ''">Все</button>
        <button class="chip" :class="{ on: kind === 'verb' }" @click="kind = 'verb'">Глаголы</button>
        <button class="chip" :class="{ on: kind === 'adj' }" @click="kind = 'adj'">Прилагательные</button>
      </div>
      <p class="sub-note">
        Настоящее — основа + 아요/어요 (<button class="fm-link" @click="open('ayo')">правило</button>), прошедшее — 았어요/었어요, отрицание — «안» перед формой
        (<button class="fm-link" @click="open('an')">правило</button>). Прилагательные меняются так же (<button class="fm-link" @click="open('adj')">правило</button>).
      </p>
    </div>

    <div v-if="rows.length" class="tb fm-tb">
      <div class="row h"><span>Слово</span><span>Перевод</span><span>Настоящее</span><span>Прошедшее</span><span>Отрицание</span></div>
      <div v-for="c in rows" :key="c.k" class="row">
        <span class="k ko">{{ c.k }}<small class="fm-rd">{{ c.r }}</small></span>
        <span class="tr">{{ c.t }}</span>
        <span class="ko">{{ c.present }}</span>
        <span class="ko">{{ c.past }}</span>
        <span class="ko">{{ c.neg }}</span>
      </div>
    </div>
    <p v-if="!rows.length" class="cb-empty">Ничего не нашлось. Попробуй другое слово или перевод.</p>
    <button v-if="remoteRows !== null && remoteOffset < remoteTotal" class="chip" :disabled="loadingMore" @click="loadMoreForms">{{ loadingMore ? 'Загружаю…' : 'Показать ещё формы' }}</button>
  </div>
</template>
