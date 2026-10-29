import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import KoreanLayout from '@/views/korean/KoreanLayout.vue'
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
      redirect: '/korean/today',
      children: [
        { path: 'today', component: () => import('@/views/korean/TodayView.vue') },
        { path: 'words', component: () => import('@/views/korean/WordsView.vue') },
        { path: 'grammar', component: () => import('@/views/korean/GrammarView.vue') },
        rich('cheat'),
        rich('talk'),
        rich('hangul'),
        rich('reading'),
        { path: 'sentences', component: () => import('@/views/korean/SentencesView.vue') },
        rich('numbers'),
        { path: 'review', component: () => import('@/views/korean/ReviewView.vue') },
      ],
    },
    { path: '/game', name: 'game', component: () => import('@/views/GameView.vue') },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
export default router
