import { reactive } from 'vue'
import { errText } from '@/lib/http'

export interface ConfirmOptions {
  title: string
  text?: string
  /** подпись кнопки подтверждения */
  ok?: string
  cancel?: string
  /** опасное действие: кнопка красная, фокус на «Отмена» */
  danger?: boolean
  /** окно просит ввести токен: ответом будет введённая строка */
  token?: boolean
}

interface State extends ConfirmOptions {
  open: boolean
  resolve: ((answer: boolean | string) => void) | null
  /** действие, которое выполняется при вводе токена; ошибка остаётся в окне, и можно ввести токен ещё раз */
  action: ((token: string) => Promise<unknown>) | null
  error: string
  busy: boolean
}

/** Одно общее окно подтверждения на весь сайт (`ConfirmDialog.vue` в App.vue) вместо встроенного confirm() браузера. */
export const confirmState = reactive<State>({ open: false, title: '', resolve: null, action: null, error: '', busy: false })

/** Показывает окно и возвращает true, если нажали подтверждение. Новый вопрос закрывает предыдущий ответом «нет». */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return open({ ...options, token: false }).then(a => a === true)
}

/** Окно с полем для токена (опасные действия: сброс прогресса, гостевой доступ). Возвращает введённый токен или null, если отменили. */
export function askToken(options: ConfirmOptions): Promise<string | null> {
  return open({ ok: 'Подтвердить', danger: true, ...options, token: true }).then(a => (typeof a === 'string' && a ? a : null))
}

/**
 * Окно с токеном, которое само выполняет действие: пока сервер не принял токен, окно остаётся открытым и показывает ошибку внутри себя.
 * Возвращает true, если действие выполнено, и false, если окно закрыли.
 */
export async function askTokenDo(options: ConfirmOptions, action: (token: string) => Promise<unknown>): Promise<boolean> {
  const a = await open({ ok: 'Подтвердить', danger: true, ...options, token: true }, action)
  return a === 'done'
}

function open(options: ConfirmOptions, action: ((token: string) => Promise<unknown>) | null = null): Promise<boolean | string> {
  confirmState.resolve?.(false)
  return new Promise(resolve => {
    Object.assign(confirmState, { cancel: 'Отмена', ok: 'Да', text: '', danger: false, token: false }, options, { open: true, resolve, action, error: '', busy: false })
  })
}

/** Ответ окна: для обычного вопроса true/false, для окна с токеном строка (или false при отмене). */
export function answerConfirm(yes: boolean, value = '') {
  const done = confirmState.resolve
  confirmState.open = false
  confirmState.resolve = null
  confirmState.action = null
  done?.(yes ? (confirmState.token && value ? value : true) : false)
}

/** Нажали «Подтвердить» в окне с токеном: токен чистится от пробелов; если у окна есть действие, оно выполняется здесь. */
export async function submitToken(raw: string) {
  const token = raw.trim()
  if (!token || confirmState.busy) return
  const action = confirmState.action
  if (!action) return answerConfirm(true, token)
  confirmState.busy = true
  confirmState.error = ''
  try {
    await action(token)
    answerConfirm(true, 'done')
  } catch (e) {
    confirmState.error = errText(e) || 'Не получилось'
  } finally {
    confirmState.busy = false
  }
}
