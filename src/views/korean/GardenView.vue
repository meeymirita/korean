<script setup lang="ts">
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import CollectionTab from '@/components/garden/CollectionTab.vue'
import GardenTab from '@/components/garden/GardenTab.vue'
import SectionHead from '@/components/korean/SectionHead.vue'

const tab = ref<'garden' | 'cards'>(useRoute().query.tab === 'cards' ? 'cards' : 'garden')
</script>

<template>
  <div class="wrap">
    <SectionHead id="garden" />
    <div class="chips cb-tabs">
      <button class="chip" :class="{ on: tab === 'garden' }" @click="tab = 'garden'">🌸 Сад</button>
      <button class="chip" :class="{ on: tab === 'cards' }" @click="tab = 'cards'">🃏 Коллекция</button>
    </div>
    <GardenTab v-if="tab === 'garden'" />
    <CollectionTab v-else />
  </div>
</template>
