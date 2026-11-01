<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import Cat from '@/components/Cat.vue'
import Icon from '@/components/Icon.vue'
import { MAX_LEVEL, rankTable, type LevelInfo } from '@/data/levels'

/** Окно «Все уровни»: звания, уровни внутри них и сколько очков нужно до каждого. Текущий уровень выделен. */
const props = defineProps<{ info: LevelInfo }>()
const emit = defineEmits<{ close: [] }>()
const ranks = rankTable()
const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close')
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
const num = (n: number) => n.toLocaleString('ru-RU')
const state = (level: number) => (level < props.info.level ? 'done' : level === props.info.level ? 'now' : 'next')
</script>

<template>
  <Teleport to="body">
    <div class="lv" @click.self="emit('close')">
      <article class="lv-box study sky" role="dialog" aria-modal="true" aria-label="Все уровни">
        <button class="lv-x" type="button" aria-label="Закрыть" @click="emit('close')">✕</button>
        <header class="lv-head">
          <div>
            <div class="lv-kick"><Icon name="goldstar" /> уровни</div>
            <h2>Все уровни</h2>
            <p>Всего {{ MAX_LEVEL }} уровней, звание меняется каждые пять. Очки идут за верные ответы в играх, тренажёрах и «Сегодня». У тебя {{ num(info.xp) }} очков, уровень {{ info.level }} — «{{ info.title }}».</p>
          </div>
          <Cat name="cheer" class="lv-cat" />
        </header>
        <div class="lv-now">
          <div class="lv-bar"><i :style="{ width: info.pct + '%' }"></i></div>
          <small>{{ info.max ? 'Максимальный уровень, выше только свои рекорды' : `${num(info.into)} из ${num(info.span)} очков до уровня ${info.level + 1}` }}</small>
        </div>
        <section v-for="r in ranks" :key="r.name" class="lv-rank" :class="{ cur: info.level >= r.from && info.level <= r.to }">
          <h3>{{ r.name }} <small>уровни {{ r.from }}–{{ r.to }}</small></h3>
          <ul>
            <li v-for="l in r.levels" :key="l.level" :class="state(l.level)">
              <b>{{ l.level }}</b>
              <small>{{ l.xp ? num(l.xp) + ' очков' : 'старт' }}</small>
            </li>
          </ul>
        </section>
      </article>
    </div>
  </Teleport>
</template>

<style>
.lv { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 18px; overflow-y: auto; background: rgba(32, 38, 92, .45); backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
.lv .lv-box.study { position: relative; min-height: 0; width: min(760px, 100%); max-height: calc(100vh - 36px); overflow-y: auto; padding: 24px 26px 22px;
  background: linear-gradient(160deg, #fff 0%, #fdf3fb 55%, #eef4ff 100%); border: 1px solid #fff; border-radius: 28px; box-shadow: 0 30px 70px -20px rgba(80, 70, 160, .55); }
.lv-x { position: absolute; top: 14px; right: 16px; width: 32px; height: 32px; border: 0; border-radius: 50%; background: rgba(143, 124, 240, .12); color: var(--muted); font-size: 14px; cursor: pointer; }
.lv-x:hover { background: rgba(214, 77, 169, .18); color: var(--pink); }
.lv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 38px 12px 0; }
.lv-kick { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.lv .lv-box h2 { margin: 4px 0 6px; font-size: 24px; line-height: 1.2; color: var(--ink); }
.lv-head p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
.lv .lv-cat { flex: none; height: 90px; margin: 0; }
.lv-now { margin-bottom: 16px; }
.lv-bar { height: 10px; border-radius: 6px; background: rgba(143, 124, 240, .18); overflow: hidden; }
.lv-bar i { display: block; height: 100%; background: linear-gradient(90deg, #f7a8d4, #9ec8ff); }
.lv-now small { display: block; margin-top: 4px; font-size: 12.5px; color: var(--muted); }
.lv-rank { margin-bottom: 12px; padding: 12px 14px; border-radius: 18px; background: rgba(255, 255, 255, .7); border: 1px solid rgba(143, 124, 240, .18); }
.lv-rank.cur { border-color: rgba(214, 77, 169, .45); background: #fff; box-shadow: 0 10px 26px -18px rgba(214, 77, 169, .6); }
.lv .lv-rank h3 { margin: 0 0 8px; font-size: 18px; color: var(--ink); }
.lv-rank h3 small { margin-left: 6px; font-size: 12.5px; font-weight: 400; color: var(--muted); }
.lv-rank ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.lv-rank li { padding: 8px 10px; border-radius: 14px; text-align: center; background: rgba(143, 124, 240, .07); border: 1px solid transparent; }
.lv-rank li b { display: block; font-size: 20px; font-weight: 600; line-height: 1.1; color: var(--muted); }
.lv-rank li small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--muted); }
.lv-rank li.done { background: #e9f8ee; } .lv-rank li.done b { color: #2c7a4b; }
.lv-rank li.now { background: #ffe9f5; border-color: rgba(214, 77, 169, .55); } .lv-rank li.now b { color: var(--pink); }
@media (max-width: 640px) { .lv .lv-cat { height: 64px; } .lv .lv-box h2 { font-size: 20px; } }
</style>
