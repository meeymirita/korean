<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Avatar from '@/components/Avatar.vue'
import DbTab from '@/components/cabinet/DbTab.vue'
import HistoryTab from '@/components/cabinet/HistoryTab.vue'
import ImagesTab from '@/components/cabinet/ImagesTab.vue'
import NotesTab from '@/components/cabinet/NotesTab.vue'
import OverviewTab from '@/components/cabinet/OverviewTab.vue'
import RepeatTab from '@/components/cabinet/RepeatTab.vue'
import SettingsTab from '@/components/cabinet/SettingsTab.vue'
import WeekTab from '@/components/cabinet/WeekTab.vue'
import SectionHead from '@/components/korean/SectionHead.vue'
import { dueWords } from '@/data/review'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
type Tab = 'overview' | 'repeat' | 'week' | 'history' | 'notes' | 'images' | 'db' | 'settings'
const q = useRoute().query.tab
const OWNER_ONLY = ['images', 'db']
const TABS = ['repeat', 'week', 'history', 'notes', 'images', 'db', 'settings']
const tab = ref<Tab>(typeof q === 'string' && TABS.includes(q) && !(OWNER_ONLY.includes(q) && progress.isGuest) ? (q as Tab) : 'overview')
const dueCount = computed(() => dueWords(progress.data).length)
const tabs = computed<[Tab, string][]>(() => [
  ['overview', 'Обзор'],
  ['repeat', `Повторить${dueCount.value ? ' · ' + dueCount.value : ''}`],
  ['week', 'Неделя'],
  ['history', 'История'],
  ['notes', 'Заметки'],
  // картинки и база только у владельца: гость их не видит (сервер тоже отвечает ему 403)
  ...(progress.isGuest ? [] : ([['images', 'Картинки'], ['db', 'База']] as [Tab, string][])),
  ['settings', 'Настройки'],
])
</script>

<template>
  <div class="wrap">
    <SectionHead id="cabinet" :big="progress.info.level" />

    <div class="cb-head">
      <div class="cb-who">
        <Avatar :avatar="progress.data.profile.avatar" :size="64" />
        <div>
          <b>{{ progress.data.profile.name ? `Привет, ${progress.data.profile.name}!` : 'Привет!' }}</b>
          <small>⭐ уровень {{ progress.info.level }} · {{ progress.info.title }} · 🔥 серия {{ progress.streak }}</small>
          <small v-if="!progress.data.profile.name"><br />Имя можно задать в «Настройках».</small>
        </div>
      </div>
      <RouterLink to="/game" class="cb-play">🎮 Играть</RouterLink>
    </div>

    <div class="chips cb-tabs">
      <button v-for="[id, label] in tabs" :key="id" class="chip" :class="{ on: tab === id }" @click="tab = id">{{ label }}</button>
    </div>

    <OverviewTab v-if="tab === 'overview'" />
    <RepeatTab v-else-if="tab === 'repeat'" />
    <WeekTab v-else-if="tab === 'week'" />
    <HistoryTab v-else-if="tab === 'history'" />
    <NotesTab v-else-if="tab === 'notes'" />
    <ImagesTab v-else-if="tab === 'images'" />
    <DbTab v-else-if="tab === 'db'" />
    <SettingsTab v-else />
  </div>
</template>
