<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { answerConfirm, confirmState, submitToken } from '@/composables/useConfirm'

const cancelBtn = ref<HTMLButtonElement>()
const okBtn = ref<HTMLButtonElement>()
const field = ref<HTMLInputElement>()
const value = ref('')
const submit = async () => {
  if (!confirmState.token) return answerConfirm(true)
  if (!value.value.trim()) return
  await submitToken(value.value)
  // ошибка остаётся в окне: токен можно поправить и нажать ещё раз
  if (confirmState.open && confirmState.error) {
    await nextTick()
    field.value?.select()
  }
}
const cancel = () => {
  value.value = ''
  answerConfirm(false)
}

watch(
  () => confirmState.open,
  async open => {
    if (!open) return
    await nextTick()
    value.value = ''
    if (confirmState.token) return field.value?.focus() // для токена фокус в поле
    // опасное действие: фокус на «Отмена», чтобы случайный Enter ничего не удалил
    ;(confirmState.danger ? cancelBtn : okBtn).value?.focus()
  },
)

function onKey(e: KeyboardEvent) {
  if (confirmState.open && e.key === 'Escape') {
    e.stopPropagation()
    cancel()
  }
}
onMounted(() => document.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <Transition name="cf">
      <div v-if="confirmState.open" class="cf" @click.self="cancel()">
        <div class="cf-box" role="alertdialog" aria-modal="true" aria-labelledby="cf-title">
          <h2 id="cf-title">{{ confirmState.title }}</h2>
          <p v-if="confirmState.text">{{ confirmState.text }}</p>
          <form v-if="confirmState.token" class="cf-token" @submit.prevent="submit">
            <input ref="field" v-model="value" type="password" autocomplete="current-password" placeholder="токен" aria-label="Токен" :class="{ bad: confirmState.error }" :disabled="confirmState.busy" @input="confirmState.error = ''" />
            <p v-if="confirmState.error" class="cf-err" role="alert">{{ confirmState.error }}</p>
          </form>
          <div class="cf-acts">
            <button ref="cancelBtn" class="cf-cancel" @click="cancel()">{{ confirmState.cancel }}</button>
            <button ref="okBtn" class="cf-ok" :class="{ danger: confirmState.danger }" :disabled="confirmState.busy" @click="submit()">{{ confirmState.busy ? 'Проверяю…' : confirmState.ok }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.cf { position: fixed; inset: 0; z-index: 500; display: grid; place-items: center; padding: 24px; background: rgba(32, 38, 92, .5); backdrop-filter: blur(6px);
  font-family: 'Archivo', 'Noto Sans KR', sans-serif; color: #20265c; }
.cf-box { width: min(420px, 100%); padding: 26px 28px; text-align: center; background: #f6f1ff; border: 1px solid #fff; border-radius: 24px;
  box-shadow: 0 40px 80px -30px rgba(32, 38, 92, .5); }
.cf-box h2 { margin: 0; font-size: 20px; font-weight: 700; line-height: 1.25; overflow-wrap: anywhere; }
.cf-box p { margin: 10px 0 0; font-size: 14px; line-height: 1.55; color: #6c70a8; }
.cf-token { margin-top: 16px; }
.cf-token input { width: 100%; padding: 12px 16px; font: inherit; font-size: 15px; text-align: center; color: #20265c; background: #fff; border: 1px solid #e7def8; border-radius: 99px; outline: none; }
.cf-token input.bad { border-color: #c4503f; background: #fff5f3; }
.cf-token .cf-err { margin: 8px 0 0; font-size: 13px; font-weight: 600; color: #b44634; }
.cf-ok:disabled { opacity: .6; cursor: default; }
.cf-token input:focus { border-color: #b7a8ee; box-shadow: 0 0 0 3px rgba(143, 124, 240, .16); }
.cf-acts { display: flex; justify-content: center; gap: 10px; margin-top: 22px; }
.cf-acts button { min-width: 110px; padding: 11px 22px; font: inherit; font-size: 14px; font-weight: 600; border-radius: 99px; cursor: pointer; transition: .2s; }
.cf-cancel { color: #625bb9; background: #eee9ff; border: 0; }
.cf-cancel:hover { background: #e3dcff; }
.cf-ok { color: #37378f; background: linear-gradient(100deg, #f8b9e9, #9de4ff); border: 0; }
.cf-ok.danger { color: #fff; background: #c4503f; }
.cf-ok:hover { filter: brightness(1.06); }
.cf-acts button:focus-visible { outline: 2px solid #8f7cf0; outline-offset: 2px; }
.cf-enter-active, .cf-leave-active { transition: opacity .18s; }
.cf-enter-from, .cf-leave-to { opacity: 0; }
</style>
