<script setup lang="ts">
import PinkShell from '@/components/site/PinkShell.vue'
import '@/assets/home/fonts.css'
import { HISTORY, HISTORY_STATS } from '@/data/history'

const fmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
const when = (d: string) => fmt.format(new Date(d + 'T12:00:00'))
</script>

<template>
  <PinkShell sub="история изменений">
    <main class="hist">
      <section class="intro">
        <div class="pk-kick">как росла платформа</div>
        <h1>История изменений</h1>
        <p class="pk-lead">Что и когда добавляли: от первой версии на Vue до защиты, поиска и автоматических проверок. {{ HISTORY_STATS.stages }} этапов, {{ HISTORY_STATS.items }} изменений. Новое сверху.</p>
      </section>

      <ol class="line">
        <li v-for="(e, i) in HISTORY" :key="e.date + e.title" class="stage">
          <span class="dot" :class="{ now: i === 0 }"></span>
          <article class="card">
            <time :datetime="e.date">{{ when(e.date) }}</time>
            <h2>{{ e.title }}</h2>
            <p class="sum">{{ e.summary }}</p>
            <ul>
              <li v-for="it in e.items" :key="it">{{ it }}</li>
            </ul>
          </article>
        </li>
      </ol>
    </main>
  </PinkShell>
</template>

<style scoped>
.hist { width: 100%; max-width: 860px; margin: 0 auto; padding: clamp(32px, 5vw, 64px) 0 24px; }
.intro { display: flex; flex-direction: column; gap: 16px; }
.intro h1 { margin: 0; font-weight: 500; font-size: clamp(40px, 6vw, 84px); line-height: 1; letter-spacing: -.035em; }
.intro p { margin: 0; max-width: 560px; }
.line { list-style: none; margin: 40px 0 0; padding: 0 0 0 26px; border-left: 1px solid var(--pk-line); }
.stage { position: relative; padding-bottom: 22px; }
.dot { position: absolute; left: -33px; top: 26px; width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid var(--pk-pink-2); }
.dot.now { background: var(--pk-pink); border-color: var(--pk-pink); box-shadow: 0 0 0 6px rgba(214, 77, 169, .2); }
.card { padding: 24px 26px; border: 1px solid var(--pk-line); border-radius: 24px; background: var(--pk-glass); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
.card time { font: 400 12px/1 var(--pk-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--pk-label); }
.card h2 { margin: 10px 0 6px; font-size: 22px; font-weight: 600; letter-spacing: -.01em; }
.sum { margin: 0 0 12px; font: 400 13px/1.6 var(--pk-mono); color: var(--pk-soft); }
.card ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14.5px; line-height: 1.6; color: var(--pk-ink); }
.card li::marker { color: var(--pk-pink); }
@media (max-width: 600px) { .line { padding-left: 18px; } .dot { left: -25px; } .card { padding: 18px; } }
</style>
