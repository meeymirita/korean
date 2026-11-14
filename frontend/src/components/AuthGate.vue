<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { errText } from '@/lib/http'
import { RouterLink } from 'vue-router'
import { useCodeLogin, type CodeChannel, type CodeChannels } from '@/composables/useCodeLogin'
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
    codeError.value = errText(e) // например «код уже отправлен, новый через 40 с»: сам код при этом дошёл
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
    codeError.value = errText(e)
    code.value = ''
  } finally {
    busy.value = false
  }
}
/* ---------- вход по коду без токена: Телеграм или Почта (код из 6 цифр) ---------- */
const cl = useCodeLogin()
/** choose: три кнопки, token: поле токена, code: ввод кода из Telegram или почты. */
const method = ref<'choose' | 'token' | 'code'>('choose')
const channel = ref<CodeChannel>('telegram')
const avail = ref<CodeChannels | null>(null)
/** Пока способы не загрузились, кнопки показываются; если сервер вход по коду выключил или не отвечает, остаётся только поле токена. */
const view = computed(() => (progress.needs2fa ? 'twofa' : method.value === 'code' ? 'code' : method.value === 'token' || (avail.value && !avail.value.enabled) ? 'token' : 'choose'))
onMounted(async () => {
  try {
    avail.value = await cl.channels()
  } catch {
    avail.value = { enabled: false, telegram: false, mail: false }
  }
})
async function chooseChannel(ch: CodeChannel) {
  if (!avail.value?.[ch]) return
  channel.value = ch
  method.value = 'code'
  code.value = ''
  codeError.value = ''
  await sendByChannel()
}
async function sendByChannel() {
  if (sending.value || left.value > 0) return
  sending.value = true
  codeError.value = ''
  try {
    await cl.send(channel.value)
    countdown(RESEND)
  } catch (e) {
    const wait = (e as { wait?: number }).wait
    if (wait) countdown(wait)
    codeError.value = errText(e)
  } finally {
    sending.value = false
  }
}
async function submitByCode() {
  if (code.value.trim().length !== 6 || busy.value) return
  busy.value = true
  codeError.value = ''
  try {
    await cl.verify(code.value.trim())
    code.value = ''
  } catch (e) {
    codeError.value = errText(e)
    code.value = ''
  } finally {
    busy.value = false
  }
}
function toChoose() {
  method.value = 'choose'
  code.value = ''
  codeError.value = ''
  clearInterval(tick)
  left.value = 0
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
      <template v-if="view === 'twofa'">
        <div class="gate-ico"><Icon name="mail" /></div>
        <h2>Код входа</h2>
        <p>Токен подошёл. Мы отправили код из 4 цифр: {{ sentTo || '…' }}. Он действует 10 минут.</p>
        <form class="gate-form" @submit.prevent="submitCode">
          <input v-model="code" inputmode="numeric" maxlength="4" pattern="\d{4}" placeholder="0000" autocomplete="one-time-code" aria-label="Код входа" autofocus @input="code.length === 4 && submitCode()" />
          <button type="submit" :disabled="busy || code.trim().length !== 4">{{ busy ? 'Проверяю…' : 'Войти' }}</button>
        </form>
        <p v-if="codeError" class="gate-err">{{ codeError }}</p>
        <p class="gate-help"><a v-if="left <= 0" href="#" @click.prevent="sendCode">Отправить код ещё раз</a><span v-else class="gate-wait">Отправить ещё раз через {{ left }} с</span> · <a href="#" @click.prevent="progress.disconnect()">Другой токен</a></p>
        <RouterLink to="/" class="gate-back">← На главную</RouterLink>
      </template>
      <template v-else-if="view === 'code'">
        <div class="gate-ico"><Icon name="mail" /></div>
        <h2>Код входа</h2>
        <p>Мы отправили код из 6 цифр {{ channel === 'telegram' ? 'в Telegram' : 'на почту' }}. Он действует 10 минут. Токен вводить не нужно.</p>
        <form class="gate-form" @submit.prevent="submitByCode">
          <input v-model="code" inputmode="numeric" maxlength="6" pattern="\d{6}" placeholder="000000" autocomplete="one-time-code" aria-label="Код входа" autofocus @input="code.length === 6 && submitByCode()" />
          <button type="submit" :disabled="busy || code.trim().length !== 6">{{ busy ? 'Проверяю…' : 'Войти' }}</button>
        </form>
        <p v-if="codeError" class="gate-err">{{ codeError }}</p>
        <p class="gate-help"><a v-if="left <= 0" href="#" @click.prevent="sendByChannel">Отправить код ещё раз</a><span v-else class="gate-wait">Отправить ещё раз через {{ left }} с</span> · <a href="#" @click.prevent="toChoose">Другой способ</a></p>
        <RouterLink to="/" class="gate-back">← На главную</RouterLink>
      </template>
      <template v-else-if="view === 'choose'">
        <div class="gate-ico"><Icon name="lock" /></div>
        <h2>Как войти?</h2>
        <p>Большой словарь, «О платформе» и история изменений открыты всем. Всё остальное работает после входа.</p>
        <div class="gate-methods">
          <button type="button" class="gate-method" @click="method = 'token'">
            <span class="gm-ico"><Icon name="key" /></span>
            <span class="gm-text"><b>Токен</b><small>Войдите с помощью вашего персонального токена.</small></span>
          </button>
          <button type="button" class="gate-method" :disabled="!!avail && !avail.telegram" @click="chooseChannel('telegram')">
            <span class="gm-ico"><Icon name="chat" /></span>
            <span class="gm-text"><b>Телеграм</b><small>{{ avail && !avail.telegram ? 'Не настроено на сервере.' : 'Быстрый вход через Telegram-бота. Без пароля.' }}</small></span>
          </button>
          <button type="button" class="gate-method" :disabled="!!avail && !avail.mail" @click="chooseChannel('mail')">
            <span class="gm-ico"><Icon name="mail" /></span>
            <span class="gm-text"><b>Почта</b><small>{{ avail && !avail.mail ? 'Не настроено на сервере.' : 'Получите код на вашу электронную почту. Код действует 10 минут.' }}</small></span>
          </button>
        </div>
        <p v-if="codeError" class="gate-err">{{ codeError }}</p>
        <p class="gate-help">
          По вопросам доступа пишите в Telegram:
          <a href="https://t.me/meeymirita" target="_blank" rel="noopener">@meeymirita</a>
        </p>
        <RouterLink to="/" class="gate-back">← На главную</RouterLink>
      </template>
      <template v-else>
      <div class="gate-ico"><Icon name="lock" /></div>
      <h2>Этот раздел открывается по токену</h2>
      <p>
        Большой словарь, «О платформе» и история изменений открыты всем. Всё остальное (слова, грамматика, справочник, задания,
        тренажёры, игра, повторение и личный кабинет) работает после входа по токену.
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
      <p v-if="avail?.enabled" class="gate-help"><a href="#" @click.prevent="method = 'choose'">← Другой способ входа</a></p>
      <RouterLink to="/" class="gate-back">← На главную</RouterLink>
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
/* выбор способа входа: три карточки в пастельном стиле */
.gate-methods { display: grid; gap: 12px; margin-top: 20px; text-align: left; }
.gate-method { display: flex; align-items: center; gap: 14px; padding: 14px 16px; font: inherit; color: var(--ink); text-align: left; cursor: pointer;
  background: linear-gradient(135deg, #fff3fa, #eef0ff); border: 1px solid #fff; border-radius: 20px; box-shadow: 0 8px 22px rgba(100, 87, 170, .12); transition: transform .2s, box-shadow .2s; }
.gate-method:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 14px 28px rgba(100, 87, 170, .22); }
.gate-method:disabled { opacity: .55; cursor: default; }
.gm-ico { display: grid; place-items: center; flex: none; width: 50px; height: 50px; font-size: 26px; background: rgba(255, 255, 255, .85); border-radius: 16px; }
.gm-text { display: flex; flex-direction: column; gap: 2px; }
.gm-text b { font-size: 18px; font-weight: 700; }
.gm-text small { font-size: 13px; line-height: 1.4; color: var(--muted); }
.gate-help a:hover { text-decoration: underline; }
.gate-back { display: inline-block; margin-top: 18px; font-size: 14px; font-weight: 600; color: var(--gold); }
.gate-back:hover { text-decoration: underline; }
</style>
