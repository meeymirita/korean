<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import StudyModal from '@/components/StudyModal.vue'
import { D } from '@/data/korean/words'
import { MOODS, dayScore } from '@/data/mood'
import { modeName, percent, sourceName } from '@/data/report'
import { dayKey, useProgressStore } from '@/stores/progress'

/** Окно со статистикой одного дня: открывается по клику на день в календаре активности (главная раздела). */
const props = defineProps<{ day: string }>()
const emit = defineEmits<{ close: [] }>()

const progress = useProgressStore()
const byK = new Map(D.map(w => [w.k, w]))

const date = new Date(props.day + 'T12:00:00')
const future = date > new Date()
const dateLabel = (() => {
  const t = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
  return t.charAt(0).toUpperCase() + t.slice(1)
})()

const ok = progress.data.days[props.day] ?? 0
const all = progress.data.all[props.day] ?? 0
const bad = Math.max(0, all - ok)
const pct = percent(ok, bad)
const minutes = Math.round((progress.data.time[props.day] ?? 0) / 60)
const moodScore = dayScore(progress.data.moods[props.day])
const mood = moodScore ? MOODS[Math.min(2, Math.max(0, Math.round(moodScore) - 1))] : null
const goalDone = all > 0 && ok >= progress.goal

const entries = computed(() =>
  progress.data.log.filter(e => dayKey(new Date(e.t)) === props.day).sort((a, b) => a.t - b.t),
)
interface Group { name: string; ok: number; bad: number }
const groups = computed(() => {
  const by = new Map<string, Group>()
  for (const e of entries.value) {
    const key = `${e.s}|${e.m ?? ''}`
    const g = by.get(key) ?? { name: [sourceName(e.s), e.m ? modeName(e.m) : ''].filter(Boolean).join(' · '), ok: 0, bad: 0 }
    e.ok ? g.ok++ : g.bad++
    by.set(key, g)
  }
  return [...by.values()].sort((a, b) => b.ok + b.bad - (a.ok + a.bad))
})
const hasActivity = computed(() => all > 0 || minutes > 0 || entries.value.length > 0)
const time = (t: number) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(t))
const label = (w: string | null, q?: string) => w ?? q ?? 'предложение'

</script>

<template>
  <StudyModal name="ds" :label="`Статистика: ${dateLabel}`" width="520px" @close="emit('close')">
    <header class="ds-head">
      <div class="ds-kick"><Icon name="calendar" /> день</div>
      <h2>{{ dateLabel }}</h2>
    </header>

    <p v-if="future" class="empty">Этот день ещё не наступил.</p>
    <p v-else-if="!hasActivity" class="empty">В этот день заданий не было.</p>
    <template v-else>
      <div class="ds-sum">
        <div class="a"><b>{{ all }}</b><small>ответов</small></div>
        <div class="b"><b>{{ all ? pct + '%' : '—' }}</b><small>верно: {{ ok }} из {{ all }}</small></div>
        <div class="c"><b>{{ minutes || '—' }}</b><small>минут занятий</small></div>
        <div class="d"><b v-if="mood"><Icon :name="mood.icon" /></b><b v-else>—</b><small>{{ mood?.label ?? 'настроение не отмечено' }}</small></div>
      </div>

      <p v-if="goalDone" class="ds-goal"><Icon name="goldstar" /> Цель дня выполнена: {{ ok }} верных.</p>

      <ul v-if="groups.length" class="ds-groups">
        <li v-for="g in groups" :key="g.name"><span>{{ g.name }}</span><b>{{ g.ok }} верно<template v-if="g.bad"> · {{ g.bad }} ошибок</template></b></li>
      </ul>

      <ul v-if="entries.length" class="ds-list">
        <li v-for="(e, i) in entries" :key="i" :class="e.ok ? 'ok' : 'bad'">
          <span class="mk" aria-hidden="true">{{ e.ok ? '✓' : '✕' }}</span>
          <span class="w"><b class="ko">{{ label(e.w, e.d?.q) }}</b><small v-if="e.w && byK.get(e.w)">{{ byK.get(e.w)!.t }}</small></span>
          <time>{{ time(e.t) }}</time>
        </li>
      </ul>
    </template>
  </StudyModal>
</template>

<style>
.ds-head { margin: 0 38px 14px 0; }
.ds-kick { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.ds .ds-box h2 { margin: 4px 0 0; font-size: 22px; line-height: 1.2; color: var(--ink); }
.ds-sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
.ds-sum > div { border-radius: 16px; padding: 10px 8px; text-align: center; border: 1px solid rgba(255, 255, 255, .9); }
.ds-sum .a { background: #e6f1ff; } .ds-sum .b { background: #f1e9ff; } .ds-sum .c { background: #ffe9f5; } .ds-sum .d { background: #e9f8ee; }
.ds-sum b { display: block; font-size: 20px; font-weight: 600; line-height: 1.2; color: var(--ink); }
.ds-sum .b b { color: var(--pink); }
.ds-sum small { display: block; margin-top: 2px; font-size: 11px; line-height: 1.3; color: var(--muted); }
.ds-goal { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; padding: 8px 14px; border-radius: 999px; background: rgba(255, 244, 214, .7); font-size: 13px; color: var(--ink); }
.ds-groups { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ds-groups li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-radius: 14px; background: rgba(143, 124, 240, .07); font-size: 13px; }
.ds-groups li span { color: var(--ink); }
.ds-groups li b { font-weight: 600; color: var(--muted); white-space: nowrap; }
.ds-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.ds-list li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 14px; background: #fff; border: 1px solid rgba(143, 124, 240, .14); }
.ds-list li.bad { background: #fff6fa; border-color: rgba(214, 77, 169, .22); }
.ds-list .mk { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; }
.ds-list li.ok .mk { background: #dff5e7; color: #2c7a4b; }
.ds-list li.bad .mk { background: #ffe0ee; color: #c23b86; }
.ds-list .w { flex: 1; min-width: 0; }
.ds-list .w b { display: block; font-weight: 600; font-size: 13.5px; overflow-wrap: anywhere; }
.ds-list .w small { display: block; color: var(--muted); font-size: 11.5px; }
.ds-list time { flex: none; font-size: 11px; color: var(--muted); }
</style>
