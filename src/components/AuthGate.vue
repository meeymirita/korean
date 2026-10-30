<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useTwoFa } from '@/composables/useTwoFa'
import { useProgressStore } from '@/stores/progress'

const progress = useProgressStore()
const token = ref('')
const busy = ref(false)

/* ---------- второй шаг: код из письма ---------- */
const tf = useTwoFa()
const code = ref('')
const sentTo = ref('')
const codeError = ref('')
const sending = ref(false)
/** Сколько секунд осталось до новой отправки кода (сервер тоже не шлёт чаще, чем раз в 30 секунд). */
const RESEND = 30
const left = ref(0)
let tick: ReturnType<typeof setInterval> | undefined
function countdown(seconds: number) {
  clearInterval(tick)
  left.value = seconds
  if (seconds <= 0) return
  tick = setInterval(() => {
    left.value -= 1
    if (left.value <= 0) clearInterval(tick)
  }, 1000)
}
onBeforeUnmount(() => clearInterval(tick))

async function sendCode() {
  if (sending.value || left.value > 0) return
  sending.value = true
  codeError.value = ''
  try {
    sentTo.value = await tf.sendLoginCode()
    countdown(RESEND)
  } catch (e) {
    const wait = (e as { wait?: number }).wait
    if (wait) countdown(wait)
    codeError.value = (e as Error).message // например «код уже отправлен, новый через 40 с»: сам код при этом дошёл
  } finally {
    sending.value = false
  }
}
async function submitCode() {
  if (code.value.trim().length !== 4 || busy.value) return
  busy.value = true
  codeError.value = ''
  try {
    await tf.verifyLogin(code.value.trim())
    code.value = ''
  } catch (e) {
    codeError.value = (e as Error).message
    code.value = ''
  } finally {
    busy.value = false
  }
}
// как только сервер попросил код, письмо уходит само; повторный заход на страницу не засыпает почту (у сервера пауза между письмами)
watch(() => progress.needs2fa, on => on && void sendCode(), { immediate: true })

async function submit() {
  if (!token.value.trim() || busy.value) return
  busy.value = true
  await progress.connect(token.value)
  busy.value = false
  if (progress.unlocked) token.value = ''
}
</script>

<template>
  <div class="gate">
    <div class="gate-card">
      <template v-if="progress.needs2fa">
        <div class="gate-ico">✉️</div>
        <h2>Код из письма</h2>
        <p>Токен подошёл. Мы отправили код из 4 цифр на {{ sentTo || 'вашу почту' }}. Он действует 10 минут.</p>
        <form class="gate-form" @submit.prevent="submitCode">
          <input v-model="code" inputmode="numeric" maxlength="4" pattern="\d{4}" placeholder="0000" autocomplete="one-time-code" aria-label="Код из письма" autofocus @input="code.length === 4 && submitCode()" />
          <button type="submit" :disabled="busy || code.trim().length !== 4">{{ busy ? 'Проверяю…' : 'Войти' }}</button>
        </form>
        <p v-if="codeError" class="gate-err">{{ codeError }}</p>
        <p class="gate-help"><a v-if="left <= 0" href="#" @click.prevent="sendCode">Отправить код ещё раз</a><span v-else class="gate-wait">Отправить ещё раз через {{ left }} с</span> · <a href="#" @click.prevent="progress.disconnect()">Другой токен</a></p>
        <RouterLink to="/korean/words" class="gate-back">← К справочникам</RouterLink>
      </template>
      <template v-else>
      <div class="gate-ico">🔒</div>
      <h2>Этот раздел открывается по токену</h2>
      <p>
        Справочники открыты всем: слова, грамматика, шпаргалка, разговорник, хангыль, алфавит, правила чтения, примеры и числа.
        Задания, тренажёры, игра, повторение и личный кабинет работают после входа по токену.
      </p>
      <form class="gate-form" @submit.prevent="submit">
        <input v-model="token" type="password" placeholder="токен" autocomplete="current-password" aria-label="Токен" />
        <button type="submit" :disabled="busy">{{ busy ? 'Проверяю…' : 'Открыть' }}</button>
      </form>
      <p v-if="progress.sync === 'error' && progress.syncMessage" class="gate-err">{{ progress.syncMessage }}</p>
      <p class="gate-help">
        По вопросам доступа пишите в Telegram:
        <a href="https://t.me/meeymirita" target="_blank" rel="noopener">@meeymirita</a>
      </p>
      <RouterLink to="/korean/words" class="gate-back">← К справочникам</RouterLink>
      </template>
    </div>
  </div>
</template>

<style>
.gate { display: grid; place-items: center; min-height: calc(100vh - 80px); padding: 36px 20px; }
.gate-card { width: min(520px, 100%); padding: 32px 30px; text-align: center; background: var(--surface, rgba(248, 247, 244, .92));
  border: 1px solid var(--line, rgba(168, 130, 47, .3)); border-radius: 22px; box-shadow: var(--shadow, 0 30px 60px -34px rgba(40, 38, 34, .45)); }
.gate-ico { font-size: 40px; line-height: 1; }
.gate-card h2 { margin: 12px 0 0; font-family: var(--serif, 'Cormorant Garamond', serif); font-size: 34px; font-weight: 600; line-height: 1.1; }
.gate-card p { margin: 12px 0 0; font-size: 14.5px; line-height: 1.55; color: var(--muted); }
.gate-form { display: flex; gap: 8px; margin-top: 20px; }
.gate-form input { flex: 1; min-width: 0; padding: 12px 14px; font: inherit; background: var(--bg); border: 1px solid var(--line, rgba(168, 130, 47, .35));
  border-radius: 12px; outline: none; color: var(--ink); }
.gate-form input:focus { border-color: var(--gold); }
.gate-form button { padding: 0 22px; font: inherit; font-weight: 600; color: #fff; background: var(--accent, var(--gold)); border: 0; border-radius: 12px; cursor: pointer; }
.gate-form button:disabled { opacity: .6; cursor: default; }
.gate-card .gate-err { color: var(--bad, #a4402f); font-weight: 600; }
.gate-card .gate-help { margin-top: 16px; font-size: 14px; }
.gate-help a { color: var(--gold); font-weight: 600; }
.gate-wait { color: var(--muted); }
.gate-help a:hover { text-decoration: underline; }
.gate-back { display: inline-block; margin-top: 18px; font-size: 14px; font-weight: 600; color: var(--gold); }
.gate-back:hover { text-decoration: underline; }
</style>
