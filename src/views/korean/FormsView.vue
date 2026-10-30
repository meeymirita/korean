<script setup lang="ts">
import { computed } from 'vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { useGrammarModal } from '@/composables/useGrammarModal'
import { usePersisted } from '@/composables/usePersisted'
import { CONJUGATIONS } from '@/data/korean/conjugation'
import { norm } from '@/data/korean/render'

type Kind = '' | 'verb' | 'adj'
const kind = usePersisted<Kind>('forms_kind', '', v => v === '' || v === 'verb' || v === 'adj')
const q = usePersisted('forms_q', '', v => typeof v === 'string')
const { open } = useGrammarModal()

const rows = computed(() => {
  const s = norm(q.value)
  return CONJUGATIONS.filter(c => (!kind.value || c.kind === kind.value) && (!s || c.k.includes(q.value.trim()) || norm(c.t).includes(s) || norm(c.r).includes(s) || c.present.includes(q.value.trim())))
})
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
    <p v-else class="cb-empty">Ничего не нашлось. Попробуй другое слово или перевод.</p>
  </div>
</template>
