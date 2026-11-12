<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import coinImg from '@/assets/icons/coin.webp'
import { useShortcutsStore } from '@/stores/shortcuts'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Avatar from '@/components/Avatar.vue'
import ImagesTab from '@/components/cabinet/ImagesTab.vue'
import NotesTab from '@/components/cabinet/NotesTab.vue'
import NotificationsTab from '@/components/cabinet/NotificationsTab.vue'
import TelegramTab from '@/components/cabinet/TelegramTab.vue'
import OverviewTab from '@/components/cabinet/OverviewTab.vue'
import LevelsModal from '@/components/cabinet/LevelsModal.vue'
import RepeatTab from '@/components/cabinet/RepeatTab.vue'
import ServiceLinks from '@/components/cabinet/ServiceLinks.vue'
import SettingsTab from '@/components/cabinet/SettingsTab.vue'
import WeekTab from '@/components/cabinet/WeekTab.vue'
import { dueWords } from '@/data/review'
import { archiveReminder } from '@/lib/backupAge'
import { fetchT } from '@/lib/http'
import { sectionById } from '@/data/korean/sections'
import { useImagesStore } from '@/stores/images'
import { useProgressStore } from '@/stores/progress'
import type { CabinetTab } from '@/types/cabinet'

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
const route = useRoute()
const router = useRouter()
const shortcuts = useShortcutsStore()
const q = route.query.tab
// магазин из кабинета убран: старый адрес ?tab=shop ведёт на страницу магазина
if (route.query.tab === 'shop') void router.replace('/korean/shop')
// отчёт вынесен на свою страницу: старый адрес ?tab=report ведёт туда
if (route.query.tab === 'report') void router.replace('/korean/report')
/** Нажатие на вкладку; «Отчёт» открывает отдельную страницу. */
const openTab = (id: CabinetTab) => (id === 'report' ? void router.push('/korean/report') : (tab.value = id))
const OWNER_ONLY = ['images', 'report', 'notifications', 'telegram', 'services']
const TABS = ['repeat', 'week', 'notes', 'images', 'notifications', 'telegram', 'settings', 'services']
const tab = ref<CabinetTab>(typeof q === 'string' && TABS.includes(q) && !(OWNER_ONLY.includes(q) && progress.isGuest) ? (q as CabinetTab) : 'overview')
/** Вкладка записывается в адрес (?tab=…), поэтому после обновления страницы остаёмся на ней. */
watch(tab, t => {
  const { tab: _old, ...rest } = route.query
  void router.replace({ query: t === 'overview' ? rest : { ...rest, tab: t } })
})
/** Крошка «Кабинет» (и кнопка «назад») меняют ?tab=… извне: вкладка следует за адресом. */
watch(
  () => route.query.tab,
  raw => {
    const v = raw
    if (v === 'report') return void router.replace('/korean/report')
    const next = (typeof v === 'string' && TABS.includes(v) && !(OWNER_ONLY.includes(v) && progress.isGuest) ? v : 'overview') as CabinetTab
    if (next !== tab.value) tab.value = next
  },
)
const dueCount = computed(() => dueWords(progress.data).length)
const tabs = computed<[CabinetTab, string][]>(() => [
  ['overview', 'Обзор'],
  ['repeat', `Повторить${dueCount.value ? ' · ' + dueCount.value : ''}`],
  ['week', 'Неделя'],
  ...(progress.isGuest ? [] : ([['report', 'Отчёт']] as [CabinetTab, string][])),
  ['notes', 'Заметки'],
  // картинки, уведомления и база только у владельца: гость их не видит (сервер тоже отвечает ему 403)
  ...(progress.isGuest ? [] : ([['images', 'Картинки'], ['notifications', 'Уведомления'], ['telegram', 'Telegram']] as [CabinetTab, string][])),
  ['settings', 'Настройки'],
  ...(progress.isGuest ? [] : ([['services', 'Сервисы']] as [CabinetTab, string][])),
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
      <span v-if="!progress.isGuest" class="cb-coins" title="Монетки Юны"><img :src="coinImg" alt="" /><span v-count="progress.data.coins">{{ progress.data.coins }}</span></span>
      <button type="button" class="cb-lvl" title="Все уровни" @click="levelsOpen = true">{{ progress.info.level }}<small>уровень</small></button>
    </header>

    <p v-if="backupNote" class="cb-note" role="status">
      ⚠ {{ backupNote }} <button type="button" class="plain" @click="tab = 'settings'">Открыть настройки</button>
    </p>

    <div class="chips cb-tabs">
      <button v-for="[id, label] in tabs" :key="id" class="chip" :class="{ on: tab === id }" @click="openTab(id)">{{ label }}<kbd v-if="shortcuts.labelOf('cab:' + id)" class="kb">{{ shortcuts.labelOf('cab:' + id) }}</kbd></button>
    </div>

    <LevelsModal v-if="levelsOpen" :info="progress.info" @close="levelsOpen = false" />
    <OverviewTab v-if="tab === 'overview'" />
    <RepeatTab v-else-if="tab === 'repeat'" />
    <WeekTab v-else-if="tab === 'week'" />
    <NotesTab v-else-if="tab === 'notes'" />
    <ImagesTab v-else-if="tab === 'images'" />
    <NotificationsTab v-else-if="tab === 'notifications'" />
    <TelegramTab v-else-if="tab === 'telegram'" />
    <section v-else-if="tab === 'services'" class="cb-services">
      <h2>Сервисы</h2>
      <p class="muted">Состояние контейнеров, журналы и поисковый индекс собраны на отдельной странице. Отсюда можно сразу открыть Grafana, Prometheus и Meilisearch.</p>
      <ServiceLinks to-page />
    </section>
    <SettingsTab v-else />
  </div>
</template>
