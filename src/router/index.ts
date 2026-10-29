import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import KoreanLayout from '@/views/korean/KoreanLayout.vue'
import { lastRefTab } from '@/data/korean/sections'
import RichView from '@/views/korean/RichView.vue'

const rich = (id: 'cheat' | 'talk' | 'hangul' | 'reading' | 'numbers') => ({
  path: id,
  component: RichView,
  props: { id },
})

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/korean',
      component: KoreanLayout,
      redirect: '/korean/home',
      children: [
        { path: 'home', component: () => import('@/views/korean/OverviewView.vue') },
        { path: 'today', meta: { private: true }, component: () => import('@/views/korean/TodayView.vue') },
        { path: 'cabinet', meta: { private: true }, component: () => import('@/views/korean/CabinetView.vue') },
        { path: 'progress', redirect: '/korean/cabinet' },
        { path: 'words', component: () => import('@/views/korean/WordsView.vue') },
        { path: 'grammar', component: () => import('@/views/korean/GrammarView.vue') },
        {
          path: 'ref',
          component: () => import('@/views/korean/ReferenceView.vue'),
          redirect: () => `/korean/ref/${lastRefTab()}`,
          children: [
            rich('cheat'),
            rich('talk'),
            rich('hangul'),
            { path: 'alphabet', component: () => import('@/views/korean/AlphabetView.vue') },
            rich('reading'),
            { path: 'sentences', component: () => import('@/views/korean/SentencesView.vue') },
            rich('numbers'),
          ],
        },
        ...['cheat', 'talk', 'hangul', 'alphabet', 'reading', 'sentences', 'numbers'].map(id => ({
          path: id,
          redirect: `/korean/ref/${id}`,
        })),
        { path: 'trainers', meta: { private: true }, component: () => import('@/views/korean/TrainersView.vue') },
        { path: 'garden', meta: { private: true }, component: () => import('@/views/korean/GardenView.vue') },
        { path: 'review', meta: { private: true }, component: () => import('@/views/korean/ReviewView.vue') },
      ],
    },
    { path: '/game', name: 'game', component: () => import('@/views/GameView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
export default router
