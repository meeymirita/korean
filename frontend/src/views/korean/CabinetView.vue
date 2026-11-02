<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import coinImg from '@/assets/icons/coin.webp'
import { useShortcutsStore } from '@/stores/shortcuts'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Avatar from '@/components/Avatar.vue'
import HistoryTab from '@/components/cabinet/HistoryTab.vue'
import ImagesTab from '@/components/cabinet/ImagesTab.vue'
import NotesTab from '@/components/cabinet/NotesTab.vue'
import OverviewTab from '@/components/cabinet/OverviewTab.vue'
import LevelsModal from '@/components/cabinet/LevelsModal.vue'
import ReportTab from '@/components/cabinet/ReportTab.vue'
import ShopTab from '@/components/cabinet/ShopTab.vue'
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
const levelsOpen = ref(false)
const images = useImagesStore()
const section = sectionById('cabinet')

/** Напоминание владельцу, если полный архив давно не приходил (каждый день он идёт сам). Гостям и без связи ничего не показывается. */
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
type Tab = 'overview' | 'repeat' | 'week' | 'history' | 'notes' | 'images' | 'report' | 'shop' | 'settings'
const route = useRoute()
const router = useRouter()
const shortcuts = useShortcutsStore()
/** Старые адреса ?tab=db и ?tab=logs: База и Журналы переехали в «Настройки». */
const moved = (v: unknown) => (v === 'db' || v === 'logs' ? 'settings' : v)
const q = moved(route.query.tab)
const OWNER_ONLY = ['images', 'report', 'shop']
const TABS = ['repeat', 'week', 'history', 'report', 'shop', 'notes', 'images', 'settings']
const tab = ref<Tab>(typeof q === 'string' && TABS.includes(q) && !(OWNER_ONLY.includes(q) && progress.isGuest) ? (q as Tab) : 'overview')
/** Вкладка записывается в адрес (?tab=…), поэтому после обновления страницы остаёмся на ней. */
watch(tab, t => {
  const { tab: _old, ...rest } = route.query
  void router.replace({ query: t === 'overview' ? rest : { ...rest, tab: t } })
})
/** Крошка «Кабинет» (и кнопка «назад») меняют ?tab=… извне: вкладка следует за адресом. */
watch(
  () => route.query.tab,
  raw => {
    const v = moved(raw)
    const next = (typeof v === 'string' && TABS.includes(v) && !(OWNER_ONLY.includes(v) && progress.isGuest) ? v : 'overview') as Tab
    if (next !== tab.value) tab.value = next
  },
)
const dueCount = computed(() => dueWords(progress.data).length)
const tabs = computed<[Tab, string][]>(() => [
  ['overview', 'Обзор'],
  ['repeat', `Повторить${dueCount.value ? ' · ' + dueCount.value : ''}`],
  ['week', 'Неделя'],
  ['history', 'История'],
  ...(progress.isGuest ? [] : ([['report', 'Отчёт'], ['shop', 'Магазин']] as [Tab, string][])),
  ['notes', 'Заметки'],
  // картинки и база только у владельца: гость их не видит (сервер тоже отвечает ему 403)
  ...(progress.isGuest ? [] : ([['images', 'Картинки']] as [Tab, string][])),
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
      </div>
      <div class="cb-head">
        <div class="cb-who">
          <Avatar :avatar="progress.data.profile.avatar" :size="64" />
          <div>
            <b>{{ progress.data.profile.name ? `Привет, ${progress.data.profile.name}!` : 'Привет!' }}</b>
            <small><Icon name="star" /> уровень {{ progress.info.level }} · {{ progress.info.title }} · <Icon name="fire" /> серия {{ progress.streak }}</small>
            <small v-if="!progress.data.profile.name"><br />Имя можно задать в «Настройках».</small>
          </div>
        </div>
        <RouterLink to="/game/home" class="cb-play"><Icon name="dice" /> Играть</RouterLink>
      </div>
      <span v-if="!progress.isGuest" class="cb-coins" title="Монетки Юны"><img :src="coinImg" alt="" />{{ progress.data.coins }}</span>
      <button type="button" class="cb-lvl" title="Все уровни" @click="levelsOpen = true">{{ progress.info.level }}<small>уровень</small></button>
    </header>

    <p v-if="backupNote" class="cb-note" role="status">
      ⚠ {{ backupNote }} <button type="button" class="plain" @click="tab = 'settings'">Открыть настройки</button>
    </p>

    <div class="chips cb-tabs">
      <button v-for="[id, label] in tabs" :key="id" class="chip" :class="{ on: tab === id }" @click="tab = id">{{ label }}<kbd v-if="shortcuts.labelOf('cab:' + id)" class="kb">{{ shortcuts.labelOf('cab:' + id) }}</kbd></button>
    </div>

    <LevelsModal v-if="levelsOpen" :info="progress.info" @close="levelsOpen = false" />
    <OverviewTab v-if="tab === 'overview'" />
    <RepeatTab v-else-if="tab === 'repeat'" />
    <WeekTab v-else-if="tab === 'week'" />
    <HistoryTab v-else-if="tab === 'history'" />
    <ReportTab v-else-if="tab === 'report'" />
    <ShopTab v-else-if="tab === 'shop'" />
    <NotesTab v-else-if="tab === 'notes'" />
    <ImagesTab v-else-if="tab === 'images'" />
    <SettingsTab v-else />
  </div>
</template>
