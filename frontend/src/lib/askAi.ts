import { askChat, richReply, type ChatMsg } from './chat'
import { useProgressStore } from '@/stores/progress'
import { analyze, SEG_LABEL } from '@/data/korean/parse'
import { TRANSLATIONS } from '@/data/korean/translations'

/**
 * «Спросить ИИ» в окнах разбора: кнопка и панель чата на чистом DOM (движок игры не на Vue, так что одна реализация для игры и для Vue-окон).
 * Модель получает разбор с экрана (`contextOf`), вопросы считаются отдельным лимитом сервера (`CHAT_EXPLAIN_LIMIT`) и сохраняются в историю чатов.
 */

/** Разбор предложения словами: корейское, перевод, из каких частей собрано (то же, что видит ученик в «Как собрано»). */
export function breakdownContext(ko: string, extra: string[] = []): string {
  const parts = analyze(ko).map(s => `${s.text} (${SEG_LABEL[s.type]}${s.type === 'unknown' ? ', нет в словаре' : `: ${s.gloss}`})`)
  const ru = TRANSLATIONS[ko]
  return [`Предложение: ${ko}`, ru ? `Перевод: ${ru}` : '', `Как собрано: ${parts.join('; ')}`, ...extra].filter(Boolean).join('\n')
}

/** «Спросить ИИ» доступен только владельцу после входа: помощник закрыт токеном (как страница чата). */
export function canAskAi(): boolean {
  const p = useProgressStore()
  return p.unlocked && p.role === 'owner'
}

const QUICK = ['Объясни проще', 'Почему здесь эта частица?', 'Дай ещё примеры', 'В чём моя ошибка?']

type Node = HTMLElement
const h = (tag: string, cls = '', text = ''): Node => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

/** Ответ модели карточками (тот же разбор строк, что в чате): хангыль выделен, «фраза — перевод» отдельной строкой. */
function drawReply(into: Node, text: string) {
  for (const l of richReply(text)) {
    if (l.kind === 'phrase') {
      const row = h('div', 'ask-phrase')
      row.append(h('span', 'ask-ko', l.ko), ...(l.ru ? [h('span', 'ask-ru', l.ru)] : []))
      into.append(row)
      continue
    }
    const row = h('div', `ask-line ${l.kind}`)
    if (l.num) row.append(h('b', 'ask-n', `${l.num}.`))
    else if (l.bullet) row.append(h('b', 'ask-n', '•'))
    for (const p of l.parts) row.append(h(p.bold ? 'b' : 'span', p.ko ? 'ask-ko' : '', p.text))
    into.append(row)
  }
}

/**
 * Строит кнопку «Спросить ИИ» и панель. `contextOf` вызывается при каждом вопросе (на экране мог смениться разбор).
 * `onToggle(открыта)` нужен окну игры, чтобы сдвинуть разбор. Панель кладёт `mount(panel)` туда, где ей место; возвращает кнопку.
 */
export function buildAskAi(contextOf: () => string, mount: (panel: Node) => void, onToggle?: (open: boolean) => void): Node {
  const btn = h('button', 'ask-btn', 'Спросить ИИ') as HTMLButtonElement
  btn.type = 'button'
  const panel = h('div', 'ask-panel')
  panel.hidden = true
  const log = h('div', 'ask-log')
  const quick = h('div', 'ask-quick')
  const form = h('form', 'ask-form') as HTMLFormElement
  const input = h('input', 'ask-in') as HTMLInputElement
  input.type = 'text'
  input.maxLength = 400
  input.placeholder = 'Спроси про это предложение…'
  const send = h('button', 'ask-send', 'Спросить') as HTMLButtonElement
  send.type = 'submit'
  form.append(input, send)
  const note = h('p', 'ask-note', 'Отвечает бесплатная модель и может ошибаться: сверяй с разбором. Личного не пиши.')
  panel.append(h('div', 'ask-head', 'Спросить ИИ'), log, quick, form, note)
  mount(panel)

  const msgs: ChatMsg[] = []
  let conv: string | undefined
  let busy = false
  const say = (cls: string, text: string): Node => {
    const m = h('div', `ask-msg ${cls}`)
    if (cls === 'bot') drawReply(m, text)
    else m.textContent = text
    log.append(m)
    log.scrollTop = log.scrollHeight
    return m
  }
  async function ask(q: string) {
    const text = q.trim()
    if (!text || busy) return
    busy = true
    send.disabled = true
    quick.hidden = true
    say('me', text)
    const wait = say('wait', 'Думаю…')
    msgs.push({ role: 'user', text })
    try {
      const r = await askChat(useProgressStore().bearer, msgs, conv ?? 'new', contextOf())
      conv = r.conv ?? conv
      msgs.push({ role: 'assistant', text: r.reply })
      wait.remove()
      say('bot', r.reply)
    } catch (e) {
      msgs.pop()
      wait.remove()
      say('err', e instanceof Error ? e.message : 'Не получилось спросить')
    } finally {
      busy = false
      send.disabled = false
      input.focus({ preventScroll: true })
    }
  }
  for (const t of QUICK) {
    const b = h('button', 'ask-chip', t) as HTMLButtonElement
    b.type = 'button'
    b.addEventListener('click', () => void ask(t))
    quick.append(b)
  }
  form.addEventListener('submit', e => {
    e.preventDefault()
    const v = input.value
    input.value = ''
    void ask(v)
  })
  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden
    btn.classList.toggle('on', !panel.hidden)
    onToggle?.(!panel.hidden)
    if (!panel.hidden) input.focus({ preventScroll: true })
  })
  return btn
}
