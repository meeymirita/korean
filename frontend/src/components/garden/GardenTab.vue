<script setup lang="ts">
import Cat from '@/components/Cat.vue'
import Icon from '@/components/Icon.vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import TaskSession from '@/components/korean/TaskSession.vue'
import { STUDY } from '@/data/korean/study'
import type { Task } from '@/data/korean/tasks'
import { drillTasks } from '@/data/korean/topics'
import { usePersisted } from '@/composables/usePersisted'
import PlantIcon from '@/components/garden/PlantIcon.vue'
import { STAGE_NAME, plants, type Plant } from '@/data/garden'
import { CATN } from '@/data/korean/words'
import { KNOWN_STREAK, useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const all = computed(() => plants(progress.data))
const thirsty = computed(() => all.value.filter(p => p.stage === 'thirsty' || p.stage === 'wilted'))
const blooming = computed(() => all.value.filter(p => p.stage === 'bloom' || p.stage === 'thirsty').length)
const sprouts = computed(() => all.value.filter(p => ['seed', 'sprout', 'bud'].includes(p.stage)).length)
const watered = computed(() => all.value.filter(p => p.watered).length)

const onlyThirsty = ref(false)
const shown = computed(() => (onlyThirsty.value ? thirsty.value : all.value))
const picked = ref<Plant | null>(null)

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000)
  return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : `${d} дн. назад`
}
const cats = (p: Plant) => p.word.c.map(c => CATN[c]).join(', ')

/* ---------- «Как это работает» и действия: полить и подрастить ---------- */
/** Объяснение раскрыто, пока человек его не свернул (помним на устройстве). */
const howOpen = usePersisted('garden_how_open', true, v => typeof v === 'boolean')
const inStudy = new Set(STUDY.map(d => d.k))
/** Слова для «Полить»: хотят пить и завяли; для «Подрастить»: семечки, ростки и бутоны (только слова, годные для заданий). */
const waterList = computed(() => thirsty.value.filter(p => inStudy.has(p.word.k)).map(p => p.word))
const growList = computed(() => all.value.filter(p => ['seed', 'sprout', 'bud'].includes(p.stage) && inStudy.has(p.word.k)).map(p => p.word))
const mode = ref<'water' | 'grow' | null>(null)
const tasks = ref<Task[]>([])
function start(m: 'water' | 'grow') {
  mode.value = m
  next()
}
function next() {
  tasks.value = mode.value ? drillTasks(progress.data, mode.value === 'water' ? waterList.value : growList.value, 10) : []
  if (!tasks.value.length) mode.value = null
}
</script>

<template>
  <div class="cb-body">
    <section v-if="mode" class="gd-drill">
      <div class="gd-drill-head">
        <b>{{ mode === 'water' ? 'Поливаем сад' : 'Растим ростки' }}</b>
        <button type="button" class="plain" @click="mode = null">← В сад</button>
      </div>
      <TaskSession :tasks="tasks" source="trainer" mode="garden" again-label="Ещё серию" @again="next" />
    </section>
    <template v-else>
    <section class="gd-how pg-card">
      <button type="button" class="gd-how-h plain" :aria-expanded="howOpen" @click="howOpen = !howOpen">
        <b>Что это такое и как пользоваться</b><span>{{ howOpen ? 'Скрыть' : 'Показать' }}</span>
      </button>
      <ol v-if="howOpen" class="gd-steps">
        <li><b>Каждое слово — растение.</b> Как только отвечаешь на слово в игре, тренажёре или «Сегодня», оно появляется в саду семечком.</li>
        <li><b>Верный ответ +1, ошибка −1.</b> Ответов набирается на росток, потом на бутон; на {{ KNOWN_STREAK }} очках слово расцветает: оно выучено.</li>
        <li><b>Цветку тоже нужна вода.</b> Если слово давно не повторял, оно «хочет пить», а потом вянет. Верный ответ его оживляет.</li>
        <li><b>Что делать здесь:</b> нажми «Полить», чтобы повторить слова, которые хотят пить, или «Подрастить», чтобы дотянуть ростки до цветка. Серия из 10 заданий, ответы идут в общий прогресс.</li>
      </ol>
    </section>
    <div v-if="all.length" class="gd-actions">
      <button type="button" class="gd-act" :disabled="!waterList.length" @click="start('water')">
        <PlantIcon stage="thirsty" class="lg" /><span><b>Полить сад</b><small>{{ waterList.length ? `${waterList.length} слов хотят пить` : 'все слова напоены' }}</small></span>
      </button>
      <button type="button" class="gd-act" :disabled="!growList.length" @click="start('grow')">
        <PlantIcon stage="sprout" class="lg" /><span><b>Подрастить ростки</b><small>{{ growList.length ? `${growList.length} слов ещё растут` : 'нет растущих слов' }}</small></span>
      </button>
    </div>
    <div class="pg-cards">
      <div class="pg-card">
        <div class="pg-k">Цветёт</div>
        <div class="pg-v"><Icon name="sakura" /> {{ blooming }}</div>
        <div class="pg-s">слово расцветает на {{ KNOWN_STREAK }} очках: верный ответ +1, ошибка −1</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Растёт</div>
        <div class="pg-v"><Icon name="sprout" /> {{ sprouts }}</div>
        <div class="pg-s">слова, которые ещё учатся: не хватает очков до {{ KNOWN_STREAK }}</div>
      </div>
      <div class="pg-card">
        <div class="pg-k">Полито сегодня</div>
        <div class="pg-v"><Icon name="sparkle" /> {{ watered }}</div>
        <div class="pg-s">верный ответ в игре, тренажёрах или повторении поливает слово</div>
      </div>
      <div class="pg-card" :class="{ gd_thirst: thirsty.length }">
        <div class="pg-k">Хотят пить</div>
        <div class="pg-v"><Icon name="bell" /> {{ thirsty.length }}</div>
        <RouterLink v-if="thirsty.length" :to="{ path: '/korean/cabinet', query: { tab: 'repeat' } }" class="pg-s gd-go">Полить в повторении →</RouterLink>
        <div v-else class="pg-s">все слова напоены</div>
      </div>
    </div>

    <div v-if="all.length" class="chips">
      <button class="chip" :class="{ on: !onlyThirsty }" @click="onlyThirsty = false">Весь сад · {{ all.length }}</button>
      <button class="chip" :class="{ on: onlyThirsty }" @click="onlyThirsty = true">Хотят пить · {{ thirsty.length }}</button>
    </div>

    <div v-if="all.length" class="gd-field">
      <div class="gd-flowers">
        <button
          v-for="p in shown"
          :key="p.word.n"
          class="gd-plant"
          :class="[p.stage, { on: picked?.word.n === p.word.n, wet: p.watered }]"
          :title="`${p.word.k} — ${p.word.t}`"
          @click="picked = picked?.word.n === p.word.n ? null : p"
        >
          <PlantIcon :stage="p.stage" />
        </button>
      </div>
      <p v-if="!shown.length" class="gd-empty">Все слова напоены <Icon name="sprout" /></p>
    </div>
    <div v-else class="empty">
      <Cat name="water" />
      Сад пока пуст. Ответь на любое слово в игре, тренажёре или «Сегодня» — оно прорастёт.<br />
      <RouterLink to="/game/home">Идти играть →</RouterLink>
    </div>

    <div v-if="picked" class="pg-card gd-info">
      <div class="gd-ico"><PlantIcon :stage="picked.stage" /></div>
      <div>
        <div class="gd-ko">{{ picked.word.k }} <small>{{ picked.word.r }}</small></div>
        <div class="gd-tr">{{ picked.word.t }}</div>
        <div class="pg-s">
          {{ STAGE_NAME[picked.stage] }} · очков {{ picked.stat.streak }} · всего {{ picked.stat.ok }}/{{ picked.stat.ok + picked.stat.bad }} ·
          отвечал {{ ago(picked.stat.last) }}<span v-if="cats(picked)"> · {{ cats(picked) }}</span>
        </div>
      </div>
    </div>

    <p class="pg-s gd-legend">
      <PlantIcon stage="seed" class="lg" /> семечко (ошибся) · <PlantIcon stage="sprout" class="lg" /> росток · <PlantIcon stage="bud" class="lg" /> бутон · цветок — слово выучено (у каждой темы свой оттенок) · хочет пить — пора повторить, завяло —
      давно не повторял. <PlantIcon stage="wilted" class="lg" /> возвращается в цветок после верного ответа.
    </p>
    </template>
  </div>
</template>
