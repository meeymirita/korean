<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useProgressStore } from '@/stores/progress'
import { toggleTheme } from '@/lib/theme'
import '@/assets/home/fonts.css'

/**
 * Общая оболочка открытых страниц в тёмно-розовом оформлении (по файлу urimal-landing): винный фон, свечение за курсором,
 * шапка-«таблетка» с ссылками и кнопкой входа. Содержимое страницы идёт в слот, ссылки шапки можно заменить слотом `nav`.
 */
withDefaults(defineProps<{ sub?: string; width?: string; themeToggle?: boolean }>(), { sub: 'korean space', width: '1220px', themeToggle: false })
const progress = useProgressStore()
const card = ref<HTMLElement>()
const root = ref<HTMLElement>()
/** Прогресс прокрутки 0..1 для линии справа; null — страница короткая, линию не показываем. */
const progressLine = ref<number | null>(null)
let ro: ResizeObserver | undefined
function updateLine() {
  const el = root.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  progressLine.value = max > 4 ? Math.min(1, Math.max(0, el.scrollTop / max)) : null
}
/** Нажатие на линию прокручивает страницу к этому месту. */
function jump(e: MouseEvent) {
  const el = root.value
  const bar = e.currentTarget as HTMLElement
  if (!el) return
  const r = bar.getBoundingClientRect()
  el.scrollTo({ top: ((e.clientY - r.top) / r.height) * (el.scrollHeight - el.clientHeight), behavior: 'smooth' })
}
let raf = 0
let onMove: ((e: MouseEvent) => void) | undefined

/** Свечение плавно идёт за курсором (как в макете); у тех, кто просит меньше движения, стоит на месте. */
onMounted(() => {
  updateLine()
  root.value?.addEventListener('scroll', updateLine, { passive: true })
  if (root.value && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(updateLine)
    ro.observe(root.value)
    if (card.value) ro.observe(card.value)
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const t = { x: 0.5, y: 0.5 }
  const c = { x: 0.5, y: 0.5 }
  onMove = e => {
    const r = card.value?.getBoundingClientRect()
    if (r?.width && r.height) {
      t.x = (e.clientX - r.left) / r.width
      t.y = (e.clientY - r.top) / r.height
    }
  }
  window.addEventListener('mousemove', onMove, { passive: true })
  const tick = () => {
    const el = card.value
    c.x += (t.x - c.x) * 0.06
    c.y += (t.y - c.y) * 0.06
    if (el) {
      const x = Math.min(1, Math.max(0, c.x))
      const y = Math.min(1, Math.max(0, c.y))
      el.style.setProperty('--mx', 20 + x * 60 + '%')
      el.style.setProperty('--my', 20 + y * 60 + '%')
      el.style.setProperty('--dx', 80 - x * 60 + '%')
      el.style.setProperty('--dy', 80 - y * 60 + '%')
    }
    raf = requestAnimationFrame(tick)
  }
  tick()
})
onBeforeUnmount(() => {
  root.value?.removeEventListener('scroll', updateLine)
  ro?.disconnect()
  if (onMove) window.removeEventListener('mousemove', onMove)
  cancelAnimationFrame(raf)
})
</script>

<template>
  <div ref="root" class="pk">
    <div ref="card" class="pk-card" :style="{ '--pk-w': width }">
      <div class="pk-glow"></div>
      <div class="pk-shade"></div>
      <header class="pk-head">
        <RouterLink to="/" class="brand">
          <span class="mark">✳︎</span>
          <span class="name ko">우리말</span>
          <span class="sub">{{ sub }}</span>
        </RouterLink>
        <nav class="links" aria-label="Разделы">
          <slot name="nav">
            <RouterLink to="/about">О платформе</RouterLink>
            <RouterLink to="/history">История изменений</RouterLink>
            <RouterLink to="/growth">Рост платформы</RouterLink>
            <RouterLink to="/dict">Большой словарь</RouterLink>
          </slot>
        </nav>
        <button v-if="themeToggle" type="button" class="theme-btn" aria-label="Включить светлую тему" @click="toggleTheme">☀︎ Светлая</button>
        <RouterLink to="/korean/home" class="enter">
          {{ progress.unlocked ? 'Платформа' : 'Войти' }}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </RouterLink>
      </header>
      <slot />
    </div>
    <div v-if="progressLine !== null" class="pk-scroll" role="presentation" title="Прокрутка страницы" @click="jump">
      <i :style="{ transform: `scaleY(${progressLine})` }"></i>
    </div>
  </div>
</template>

<style scoped>
.pk-head { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; max-width: var(--pk-w); margin: 0 auto;
  padding: 14px 14px 14px 24px; border-radius: 999px; background: var(--pk-glass); border: 1px solid var(--pk-line); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
.brand { display: flex; align-items: center; gap: 12px; flex: none; white-space: nowrap; color: #fff; }
.brand .mark { font-size: 26px; line-height: 1; color: var(--pk-pink); }
.brand .name { font-size: 21px; font-weight: 700; }
.brand .sub { font: 400 11px/1 var(--pk-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--pk-label); }
.links { display: flex; align-items: center; justify-content: center; gap: clamp(12px, 2.2vw, 40px); min-width: 0; font-size: clamp(13px, 1.4vw, 16px); white-space: nowrap; overflow: hidden; }
.links :deep(a), .links :deep(button) { color: #fff; transition: filter .25s ease, opacity .25s ease; background: none; border: 0; font: inherit; cursor: pointer; padding: 0; }
.links:hover :deep(> :not(:hover)) { filter: blur(2px); opacity: .45; }
.links :deep(.router-link-exact-active) { color: var(--pk-pink-2); }
.enter { display: inline-flex; align-items: center; justify-content: center; gap: 8px; flex: none; height: 41px; min-width: 113px; padding: 0 20px; border-radius: 999px; background: #fff; color: var(--pk-plum); font-weight: 600; font-size: 15px; white-space: nowrap; transition: background .2s; }
.enter:hover { background: var(--pk-soft); }
.theme-btn { flex: none; height: 41px; padding: 0 16px; border-radius: 999px; background: transparent; border: 1px solid var(--pk-line); color: #fff; font: inherit; font-size: 14px; white-space: nowrap; cursor: pointer; transition: background .2s, border-color .2s; }
.theme-btn:hover { background: rgba(255, 255, 255, .12); border-color: #fff; }
@media (max-width: 760px) { .brand .sub { display: none; } .links { gap: 14px; justify-content: flex-end; } }
@media (max-width: 560px) { .pk-head { padding-left: 16px; gap: 12px; } .links { display: none; } .theme-btn { margin-left: auto; padding: 0 12px; } .enter { margin-left: 0; } }
</style>
