<script setup lang="ts">
import { useRoute } from 'vue-router'
import GlobalSearch from '@/components/GlobalSearch.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ToastHost from '@/components/ToastHost.vue'
import StudyTimer from '@/components/StudyTimer.vue'
import SiteImageEditor from '@/components/SiteImageEditor.vue'
import { BRAND, SITE, canonicalOf, seoMetaFor } from '@/data/seo'

const route = useRoute()

// заголовок, описание, canonical и превью ссылки для каждой страницы (src/data/seo.ts): на сервере уходят в готовый HTML
const meta = computed(() => seoMetaFor(route.path))
useSeoMeta({
  title: () => meta.value.title,
  description: () => meta.value.description,
  robots: () => meta.value.robots,
  ogTitle: () => meta.value.ogTitle,
  ogDescription: () => meta.value.ogDescription,
  ogUrl: () => meta.value.ogUrl,
  ogImage: () => meta.value.ogImage,
  twitterTitle: () => meta.value.twitterTitle,
  twitterDescription: () => meta.value.twitterDescription,
  twitterImage: () => meta.value.twitterImage,
})
useHead({ link: [{ rel: 'canonical', href: () => canonicalOf(route.path) }] })

// schema.org (nuxt-schema-org): сайт и учебный ресурс, как раньше в index.html
useSchemaOrg([
  defineWebSite({ name: BRAND, url: SITE + '/', description: 'Платформа для изучения корейского языка с нуля: словарь, грамматика, справочник, тренажёры и игра на слова.', inLanguage: 'ru-RU',
    // строка поиска по большому словарю прямо в выдаче Google и Яндекса
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: SITE + '/dict?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } }),
  {
    '@type': 'LearningResource',
    name: `${BRAND} — корейский язык с нуля`,
    url: SITE + '/',
    inLanguage: 'ru-RU',
    teaches: 'Корейский язык',
    educationalLevel: 'Начальный (TOPIK I)',
    learningResourceType: 'Интерактивный курс',
    isAccessibleForFree: true,
  },
])
</script>

<template>
  <NuxtPage />
  <!-- в разделе корейского (/korean/…) кнопка и окно поиска есть в самом разделе; на самой главной поиска нет (так решил владелец) -->
  <GlobalSearch v-if="route.path !== '/' && route.path !== '/upload' && !route.path.startsWith('/dict') && !route.path.startsWith('/korean')" />
  <ClientOnly>
    <StudyTimer />
    <SiteImageEditor />
  </ClientOnly>
  <ConfirmDialog />
  <ToastHost />
</template>
