<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Avatar from '@/components/Avatar.vue'
import DbTab from '@/components/cabinet/DbTab.vue'
import HistoryTab from '@/components/cabinet/HistoryTab.vue'
import ImagesTab from '@/components/cabinet/ImagesTab.vue'
import LogsTab from '@/components/cabinet/LogsTab.vue'
import NotesTab from '@/components/cabinet/NotesTab.vue'
import OverviewTab from '@/components/cabinet/OverviewTab.vue'
import RepeatTab from '@/components/cabinet/RepeatTab.vue'
import SettingsTab from '@/components/cabinet/SettingsTab.vue'
import WeekTab from '@/components/cabinet/WeekTab.vue'
import { dueWords } from '@/data/review'
import { archiveReminder } from '@/lib/backupAge'
import { fetchT } from '@/lib/http'
import { sectionById } from '@/data/korean/sections'
import { useImagesStore } from '@/stores/images'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const images = useImagesStore()
const section = sectionById('cabinet')

/** Напоминание владельцу, если полный архив давно не приходил (раз в неделю он идёт сам). Гостям и без связи ничего не показывается. */
const backupNote = ref('')
watch(
  () => progress.unlocked && !progress.isGuest,
  async owner => {
    backupNote.value = ''
    if (!owner) return
    try {
      const res = await fetchT('/api/backup/status', { headers: { Authorization: `Bearer ${progress.bearer}` } })
      if (!res.ok) return
      const r = (await res.json()) as { archive?: { last: { ok: boolean; time: number } | null; problems: string[] } }
      if (r.archive) backupNote.value = archiveReminder(r.archive.last, r.archive.problems)
    } catch {
      /* без связи напоминания нет */
    }
  },
  { immediate: true },
)

/** Обложка шапки: картинка с сервера (нужен токен), поэтому подгружается через blob. Без неё шапка — градиент. */
const coverUrl = ref('')
watch(
  () => [progress.data.profile.cover, progress.unlocked && !progress.isGuest] as const,
  async ([id, owner]) => {
    coverUrl.value = ''
    if (!id || !owner) return
    try {
      const url = await images.blobUrl(id, 'file')
      if (progress.data.profile.cover === id) coverUrl.value = url
    } catch {
      /* картинку удалили или сервер недоступен: остаётся градиент */
    }
  },
  { immediate: true },
)
type Tab = 'overview' | 'repeat' | 'week' | 'history' | 'notes' | 'images' | 'db' | 'logs' | 'settings'
const route = useRoute()
const router = useRouter()
const q = route.query.tab
const OWNER_ONLY = ['images', 'db', 'logs']
const TABS = ['repeat', 'week', 'history', 'notes', 'images', 'db', 'logs', 'settings']
const tab = ref<Tab>(typeof q === 'string' && TABS.includes(q) && !(OWNER_ONLY.includes(q) && progress.isGuest) ? (q as Tab) : 'overview')
/** Вкладка записывается в адрес (?tab=…), поэтому после обновления страницы остаёмся на ней. */
watch(tab, t => {
  const { tab: _old, ...rest } = route.query
  void router.replace({ query: t === 'overview' ? rest : { ...rest, tab: t } })
})
const dueCount = computed(() => dueWords(progress.data).length)
const tabs = computed<[Tab, string][]>(() => [
  ['overview', 'Обзор'],
  ['repeat', `Повторить${dueCount.value ? ' · ' + dueCount.value : ''}`],
  ['week', 'Неделя'],
  ['history', 'История'],
  ['notes', 'Заметки'],
  // картинки и база только у владельца: гость их не видит (сервер тоже отвечает ему 403)
  ...(progress.isGuest ? [] : ([['images', 'Картинки'], ['db', 'База'], ['logs', 'Журналы']] as [Tab, string][])),
  ['settings', 'Настройки'],
])
</script>

<template>
  <div class="wrap">
    <header class="cb-cover" :class="{ photo: coverUrl }" :style="coverUrl ? { '--cover': `url(${coverUrl})` } : undefined">
      <div class="cb-cover-top">
        <div>
          <div class="kicker">{{ section.num }} — {{ section.kicker }}</div>
          <h1>{{ section.title }}</h1>
          <div class="sub">{{ section.sub }}</div>
        </div>
        <div class="cb-lvl">{{ progress.info.level }}<small>уровень</small></div>
      </div>
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
    </header>

    <p v-if="backupNote" class="cb-note" role="status">
      ⚠ {{ backupNote }} <button type="button" class="plain" @click="tab = 'settings'">Открыть настройки</button>
    </p>

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
    <LogsTab v-else-if="tab === 'logs'" />
    <SettingsTab v-else />
  </div>
</template>
