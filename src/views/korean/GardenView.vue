<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import CollectionTab from '@/components/garden/CollectionTab.vue'
import GardenTab from '@/components/garden/GardenTab.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import yunaGarden from '@/assets/home/yuna-garden.webp'

const tab = ref<'garden' | 'cards'>(useRoute().query.tab === 'cards' ? 'cards' : 'garden')
</script>

<template>
  <div class="wrap garden-page">
    <SectionHead id="garden" />
    <img class="gd-banner" :src="yunaGarden" alt="" aria-hidden="true" draggable="false" />
    <div class="chips cb-tabs">
      <button class="chip" :class="{ on: tab === 'garden' }" @click="tab = 'garden'"><Icon name="sakura" /> Сад</button>
      <button class="chip" :class="{ on: tab === 'cards' }" @click="tab = 'cards'">🇰🇷 Коллекция</button>
    </div>
    <GardenTab v-if="tab === 'garden'" />
    <CollectionTab v-else />
  </div>
</template>

<style>
/* ===== «Сад»: Юна над карточками (двигай здесь) ===== */
.study .garden-page { position: relative; }
/* без стеклянной подложки и размытия: страница лежит прямо на фоне */
.study-shell.sky .study-main .wrap.garden-page { background: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.study .gd-banner { --h: 250px; --right: 14px; --top: 7px;
  position: absolute; z-index: 0; top: var(--top); right: var(--right); height: var(--h); width: auto; max-width: 74%; object-fit: contain; object-position: right top;
  pointer-events: none; user-select: none; }
.study .garden-page > :not(.gd-banner) { position: relative; z-index: 1; }
.study .garden-page > .page-head { border-bottom-color: transparent; }
.study .garden-page .cb-tabs { margin-bottom: 70px; }
/* поле сада: трава снизу, как на макете */
.study .garden-page .gd-field { background: linear-gradient(180deg, rgba(255, 255, 255, .55) 0%, rgba(255, 255, 255, .35) 55%, rgba(205, 240, 160, .55) 100%); }
@media (max-width: 760px) { .study .gd-banner { position: static; display: block; max-width: 100%; height: auto; margin: 0 0 10px auto; } .study .garden-page .cb-tabs { margin-bottom: 0; } }
</style>
