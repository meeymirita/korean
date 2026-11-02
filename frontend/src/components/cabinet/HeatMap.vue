<script setup lang="ts">
import { computed } from 'vue'
import { heatWeeks } from '@/data/heat'
import { useProgressStore } from '@/stores/progress'

/** Календарь тепла: последние полгода, клетка — день, чем больше верных ответов, тем темнее; цель дня закрашивает полностью. */
const WEEKS = 26
const progress = useProgressStore()
const heat = computed(() => heatWeeks(progress.data.days, progress.goal, WEEKS))
const active = computed(() => heat.value.cells.filter(c => (c.n ?? 0) > 0).length)
const title = (c: { key: string; n: number | null }) => `${c.key}: ${c.n ? c.n + ' верных' : c.n === 0 ? 'ответы без верных' : 'не занимался'}`
</script>

<template>
  <div class="ht">
    <div class="ht-scroll">
      <div class="ht-body">
        <div class="ht-wd"><span>пн</span><span></span><span>ср</span><span></span><span>пт</span><span></span><span>вс</span></div>
        <div>
          <div class="ht-months" :style="{ gridTemplateColumns: `repeat(${WEEKS}, 14px)` }">
            <span v-for="m in heat.months" :key="m.col" :style="{ gridColumn: m.col + 1 }">{{ m.label }}</span>
          </div>
          <div class="ht-grid">
            <span v-for="c in heat.cells" :key="c.key" class="ht-c" :class="['h' + c.level, { future: c.future }]" :title="title(c)"></span>
          </div>
        </div>
      </div>
    </div>
    <div class="ht-foot">
      <span>Дней с верными ответами: <b>{{ active }}</b></span>
      <span class="ht-leg">меньше <i class="ht-c h0"></i><i class="ht-c h1"></i><i class="ht-c h2"></i><i class="ht-c h3"></i><i class="ht-c h4"></i> больше</span>
    </div>
  </div>
</template>
