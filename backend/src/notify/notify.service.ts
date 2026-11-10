/**
 * Уведомления: Telegram (основной путь) с запасом на почту.
 * .env: TELEGRAM_BOT_TOKEN (из @BotFather), TELEGRAM_CHAT_ID (число; узнать: написать боту /start и открыть getUpdates).
 * Группа с темами: TELEGRAM_GROUP_ID (число -100…), TELEGRAM_TOPIC_LOGIN|REMIND|DIGEST|LESSON|BACKUP|ALERT (номера тем), каждое уведомление уходит
 * в свою тему с баннером (<TELEGRAM_BANNER_BASE>/tg/tg-<тема>.png, файлы лежат в frontend/public/tg). С группой личный чат (TELEGRAM_CHAT_ID) не используется вовсе, код входа тоже идёт в тему «Вход».
 * Для тестов: TELEGRAM_DUMP_FILE=путь — сообщения не уходят, а дописываются строками JSON в файл.
 */
import { Injectable, Optional } from '@nestjs/common'
import { Db } from '../db/db.service.js'
import { appendFileSync } from 'node:fs'
import { MailService } from '../mail/mail.service.js'
import { tgButtonFor, TG_HEART, TG_TOPICS, TG_TOPIC_ABOUT, TG_TOPIC_NAMES, sampleMail, topicTestMail, type Mail, type TgTopic } from '../mail/templates.js'
import { logError } from '../log.js'

/** Версия баннеров в адресе: Telegram запоминает картинку по адресу, поэтому при замене файлов в frontend/public/tg число надо увеличить. */
const BANNER_VERSION = '3'

/** Без анимированных эмодзи: тег tg-emoji заменяется обычным символом внутри него, иконки кнопок убираются. */
const stripCustom = (v: unknown): unknown =>
  typeof v === 'string'
    ? v.replace(/<tg-emoji emoji-id="\d+">([^<]*)<\/tg-emoji>/g, '$1')
    : Array.isArray(v)
      ? v.map(stripCustom)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'icon_custom_emoji_id').map(([k, x]) => [k, stripCustom(x)]))
        : v

type TgResult = { message_id?: number; photo?: { file_id: string }[]; file_path?: string } | true | undefined

const plain = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

@Injectable()
export class NotifyService {
  constructor(
    private readonly mail: MailService,
    @Optional() private readonly db?: Db,
  ) {}

  private dumpId = 0

  /** Настроен ли Telegram. */
  telegram() {
    return !!process.env.TELEGRAM_DUMP_FILE || !!(process.env.TELEGRAM_BOT_TOKEN && (process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_GROUP_ID))
  }

  private validMail(to?: string) {
    return !!to && to.includes('@')
  }

  /** Есть ли куда слать: Telegram или (почта и адрес). */
  ready(mailTo?: string) {
    return this.telegram() || (this.mail.configured() && this.validMail(mailTo))
  }

  /** Куда придёт, для показа в кабинете. */
  label(mailTo?: string) {
    if (this.telegram()) return 'Telegram'
    return this.validMail(mailTo) ? maskTo(mailTo!) : ''
  }

  /** Отправляет в Telegram; не вышло или не настроен — письмом (если есть адрес). Ошибка, если не ушло никуда. */
  async send(m: Mail, mailTo?: string, files: { filename: string; path: string }[] = []) {
    let tgError: Error | undefined
    if (!files.length && this.telegram()) {
      try {
        await this.sendTelegram(m)
        return
      } catch (e) {
        tgError = e as Error
        logError('Telegram не отправил:', tgError.message)
      }
    }
    if (this.mail.configured() && this.validMail(mailTo)) {
      await this.mail.send(mailTo!, m.subject, m.text, m.html, files)
      return
    }
    throw tgError ?? new Error('некуда отправлять: настройте Telegram (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) или почту')
  }

  /** Куда слать: если задана группа, только в тему группы (личный чат бота не используется, даже для кода входа); иначе личный чат. Нет номера темы: не отправляем (запасная почта). */
  private route(m: Mail): { chat_id: string; message_thread_id?: number; banner?: string } | undefined {
    const env = process.env
    if (env.TELEGRAM_GROUP_ID) {
      const thread = m.topic ? Number(env[`TELEGRAM_TOPIC_${m.topic.toUpperCase()}`]) : NaN
      if (!Number.isInteger(thread) || thread <= 0) return undefined
      const base = (env.TELEGRAM_BANNER_BASE || 'https://korean.meeymirita.ru').replace(/\/$/, '')
      return { chat_id: env.TELEGRAM_GROUP_ID, message_thread_id: thread, banner: `${base}/tg/tg-${m.topic}.png?v=${BANNER_VERSION}` }
    }
    return env.TELEGRAM_CHAT_ID ? { chat_id: env.TELEGRAM_CHAT_ID } : undefined
  }

  /** Запрос к Telegram (JSON или форма с файлом); возвращает result. В тестах (TELEGRAM_DUMP_FILE) вместо отправки пишет строку JSON в файл. */
  private async tgRaw(method: string, body: object | FormData): Promise<TgResult> {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (process.env.TELEGRAM_DUMP_FILE) {
      const line =
        body instanceof FormData
          ? { method, form: Object.fromEntries([...body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : { file: v.name, size: v.size, type: v.type }])) }
          : method === 'sendMessage'
            ? body
            : { method, ...body }
      appendFileSync(process.env.TELEGRAM_DUMP_FILE, JSON.stringify(line) + '\n')
      const id = ++this.dumpId
      return { message_id: id, photo: [{ file_id: `f${id}` }] }
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      ...(body instanceof FormData ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(body instanceof FormData ? 60_000 : 15_000),
    })
    if (!res.ok) {
      const r = (await res.json().catch(() => ({}))) as { description?: string }
      const kb = body instanceof FormData ? undefined : (body as { reply_markup?: { inline_keyboard: { style?: string }[][] } }).reply_markup
      // старый сервер Telegram не знает цвет кнопки: повторяем без него, чтобы сообщение всё равно дошло
      if (kb?.inline_keyboard.some(row => row.some(b => b.style)) && /style|button/i.test(r.description ?? '')) {
        return this.tgRaw(method, { ...body, reply_markup: { inline_keyboard: kb.inline_keyboard.map(row => row.map(({ style: _s, ...b }) => b)) } })
      }
      // анимированные эмодзи не приняты (нет Premium у владельца и т.п.): повторяем с обычными сердечками
      if (!(body instanceof FormData) && /emoji|entit/i.test(r.description ?? '') && /tg-emoji|icon_custom_emoji_id/.test(JSON.stringify(body))) {
        return this.tgRaw(method, stripCustom(body) as object)
      }
      throw new Error(`Telegram ${res.status}: ${r.description ?? 'ошибка'}`.replace(token!, '***'))
    }
    const ok = (await res.json().catch(() => ({}))) as { result?: TgResult }
    return ok.result
  }

  /** То же, но возвращает номер отправленного сообщения (по нему потом чистим тему). */
  private async tgCall(method: string, body: object): Promise<number | undefined> {
    const r = await this.tgRaw(method, body)
    return typeof r === 'object' && r ? r.message_id : undefined
  }

  /** Файл (текст) в тему группы: например, недельный отчёт в «Тревоги». Номер запоминается, тему можно очистить кнопкой. Ошибка, если тема не настроена. */
  async sendFileToTopic(topic: TgTopic, filename: string, content: string, caption: string) {
    const to = this.route({ topic } as Mail)
    if (!to?.message_thread_id) throw new Error(`тема «${TG_TOPIC_NAMES[topic]}» не настроена: нужны TELEGRAM_GROUP_ID и TELEGRAM_TOPIC_${topic.toUpperCase()} в .env`)
    const f = new FormData()
    f.set('chat_id', String(to.chat_id))
    f.set('message_thread_id', String(to.message_thread_id))
    f.set('caption', caption.slice(0, 1000))
    f.set('document', new Blob([content], { type: 'text/markdown;charset=utf-8' }), filename)
    const r = await this.tgRaw('sendDocument', f)
    const id = typeof r === 'object' && r ? r.message_id : undefined
    if (id) await this.remember(topic, [id])
  }

  /** Темы группы и настроены ли они (для вкладки «Telegram» в кабинете). */
  topics() {
    const env = process.env
    return {
      group: !!env.TELEGRAM_GROUP_ID && (!!env.TELEGRAM_BOT_TOKEN || !!env.TELEGRAM_DUMP_FILE),
      topics: TG_TOPICS.map(id => ({ id, name: TG_TOPIC_NAMES[id], ready: Number(env[`TELEGRAM_TOPIC_${id.toUpperCase()}`]) > 0 })),
    }
  }

  /** Пробное сообщение строго в тему группы (без запасного пути в личный чат и на почту). Ошибка с пояснением, если тема не настроена или Telegram не принял. */
  async sendToTopic(topic: TgTopic, text: string) {
    await this.deliverToTopic(topicTestMail(topic, text))
  }

  /** Настоящее сообщение темы с выдуманными данными, как оно придёт на самом деле. */
  async sendSample(topic: TgTopic) {
    await this.deliverToTopic(sampleMail(topic))
  }

  private async deliverToTopic(m: Mail) {
    if (!this.route(m)?.message_thread_id) {
      const t = m.topic!
      throw new Error(`тема «${TG_TOPIC_NAMES[t]}» не настроена: нужны TELEGRAM_GROUP_ID и TELEGRAM_TOPIC_${t.toUpperCase()} в .env`)
    }
    await this.sendTelegram(m)
  }

  private async sendTelegram(m: Mail) {
    const to = this.route(m)
    if (!to) throw new Error('Telegram: не задан ни чат, ни группа с темой')
    const text = (m.tg?.html ?? plain(m.text)).slice(0, 4000)
    const markup = m.tg?.button ? { reply_markup: { inline_keyboard: [[{ text: m.tg.button.text, url: m.tg.button.url, ...(m.tg.button.style ? { style: m.tg.button.style } : {}), ...(m.tg.button.iconEmojiId ? { icon_custom_emoji_id: m.tg.button.iconEmojiId } : {}) }]] } } : {}
    const { banner, ...target } = to
    const sent: number[] = []
    const keep = (id?: number) => {
      if (id) sent.push(id)
    }
    try {
      if (banner) {
        try {
          if (text.length <= 1000) {
            keep(await this.tgCall('sendPhoto', { ...target, photo: banner, caption: text, parse_mode: 'HTML', ...markup }))
            return
          }
          keep(await this.tgCall('sendPhoto', { ...target, photo: banner }))
        } catch (e) {
          // баннера ещё нет или Telegram его не скачал: шлём обычное сообщение
          logError('Telegram: баннер не ушёл, шлю текстом:', (e as Error).message)
        }
      }
      keep(await this.tgCall('sendMessage', { ...target, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...markup }))
    } finally {
      if (m.topic && target.message_thread_id) await this.remember(m.topic, sent)
    }
  }

  /** Запоминает номера сообщений бота в теме (последние 500), чтобы тему можно было очистить кнопкой. */
  private async remember(topic: TgTopic, ids: number[]) {
    if (!this.db || !ids.length) return
    try {
      const key = `tg:sent:${topic}`
      const list = JSON.parse((await this.db.getMeta(key)) ?? '[]') as number[]
      await this.db.setMeta(key, JSON.stringify([...list, ...ids].slice(-500)))
    } catch (e) {
      logError('Telegram: не запомнил номера сообщений:', (e as Error).message)
    }
  }

  /** Удаляет сообщения по номерам: пачками по 100, не прошла пачка — по одному. Возвращает, сколько удалилось. */
  private async deleteIds(chat_id: string, ids: number[]) {
    let removed = 0
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100)
      try {
        await this.tgCall('deleteMessages', { chat_id, message_ids: part })
        removed += part.length
      } catch {
        for (const id of part) {
          try {
            await this.tgCall('deleteMessage', { chat_id, message_id: id })
            removed++
          } catch {
            /* уже удалено или Telegram не даёт (служебное): пропускаем */
          }
        }
      }
    }
    return removed
  }

  /** Очищает одну тему: удаляет сообщения, которые в неё отправил сайт (свои записи владельца, например закреплённые описания, остаются). Возвращает число удалённых. */
  async clearTopic(topic: TgTopic) {
    const chat = process.env.TELEGRAM_GROUP_ID
    if (!chat) throw new Error('группа не подключена: нужен TELEGRAM_GROUP_ID в .env')
    const key = `tg:sent:${topic}`
    const ids = this.db ? (JSON.parse((await this.db.getMeta(key)) ?? '[]') as number[]) : []
    const removed = await this.deleteIds(chat, ids)
    await this.db?.setMeta(key, '[]')
    return removed
  }

  /** Очищает всю группу: все сообщения во всех темах (и в «General»), темы и их номера остаются. Закреплённые описания тоже удаляются. */
  async clearAll() {
    const chat = process.env.TELEGRAM_GROUP_ID
    if (!chat) throw new Error('группа не подключена: нужен TELEGRAM_GROUP_ID в .env')
    // номера сообщений общие для группы и растут по порядку: служебное сообщение даёт верхнюю границу
    const last = await this.tgCall('sendMessage', { chat_id: chat, text: '.' })
    if (!last) throw new Error('Telegram не принял служебное сообщение')
    const ids = Array.from({ length: last }, (_, i) => i + 1)
    const removed = await this.deleteIds(chat, ids)
    for (const t of TG_TOPICS) await this.db?.setMeta(`tg:sent:${t}`, '[]')
    const g = await this.guideLoad()
    if (g.messageId) await this.guideSave({ ...g, messageId: undefined })
    return removed
  }

  /* ---------- закреплённое сообщение в «General» ---------- */

  private guideMem: GuideState = {}

  private async guideLoad(): Promise<GuideState> {
    if (!this.db) return { ...this.guideMem }
    try {
      return JSON.parse((await this.db.getMeta('tg:guide')) ?? '{}') as GuideState
    } catch {
      return {}
    }
  }

  private async guideSave(st: GuideState) {
    this.guideMem = { ...st }
    await this.db?.setMeta('tg:guide', JSON.stringify(st))
  }

  private guideTopics() {
    const env = process.env
    const num = (env.TELEGRAM_GROUP_ID ?? '').replace(/^-100/, '')
    return TG_TOPICS.filter(t => Number(env[`TELEGRAM_TOPIC_${t.toUpperCase()}`]) > 0).map(t => ({ t, url: `https://t.me/c/${num}/${Number(env[`TELEGRAM_TOPIC_${t.toUpperCase()}`])}` }))
  }

  /** Текст сообщения по умолчанию: описание каждой темы со ссылкой и сердечком. */
  private guideDefaultText() {
    return [
      '💜 <b>우리말</b> 💜',
      '💜 ─ ─ ─ ─ ─ ─ ─ ─ 💜',
      '',
      '💜 <b>Уведомления платформы</b>',
      'Каждый вид сообщений приходит в свою тему:',
      '',
      ...this.guideTopics().map(({ t, url }) => `${TG_HEART[t]} <a href="${url}"><b>${TG_TOPIC_NAMES[t]}</b></a>: ${TG_TOPIC_ABOUT[t]}`),
      '',
      '<i>💜 Нажми на кнопку под сообщением, чтобы перейти в нужную тему.</i>',
    ].join('\n')
  }

  /** Кнопки-переходы под сообщением: по две в ряд, с сердечком темы. */
  private guideMarkup() {
    const buttons = this.guideTopics().map(({ t, url }) => {
      const b = tgButtonFor(t, TG_TOPIC_NAMES[t], url)
      return { text: b.text, url: b.url, style: b.style, ...(b.iconEmojiId ? { icon_custom_emoji_id: b.iconEmojiId } : {}) }
    })
    const rows: (typeof buttons)[] = []
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))
    return { inline_keyboard: rows }
  }

  /** Для редактора на вкладке: текст (свой или по умолчанию), есть ли баннер, отправлено ли сообщение. */
  async guideState() {
    const st = await this.guideLoad()
    return { text: st.text ?? this.guideDefaultText(), defaultText: this.guideDefaultText(), hasBanner: !!st.fileId, published: !!st.messageId }
  }

  /** Текущий баннер сообщения (скачивается у Telegram по сохранённому file_id), чтобы показать его в редакторе. */
  async guideBanner(): Promise<{ buffer: Buffer; mime: string } | undefined> {
    const st = await this.guideLoad()
    if (!st.fileId || process.env.TELEGRAM_DUMP_FILE) return undefined
    const info = await this.tgRaw('getFile', { file_id: st.fileId })
    const path = typeof info === 'object' && info ? info.file_path : undefined
    if (!path) return undefined
    const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${path}`, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return undefined
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }
  }

  /**
   * Сохраняет и отправляет сообщение в «General» и закрепляет его. Уже отправленное сообщение правится на месте (текст и баннер), а если править нельзя
   * или forceNew, отправляется новое, старое удаляется. Баннер загружается в Telegram, у нас хранится только его file_id.
   */
  async publishGuide(o: { text: string; file?: { buffer: Buffer; mimetype: string }; forceNew?: boolean }) {
    const chat = process.env.TELEGRAM_GROUP_ID
    if (!chat) throw new Error('группа не подключена: нужен TELEGRAM_GROUP_ID в .env')
    const text = o.text.trim()
    if (!text) throw new Error('введите текст сообщения')
    const st = await this.guideLoad()
    // свой баннер не загружен: берём tg-banner.png с сайта (frontend/public/tg)
    const defaultBanner = `${(process.env.TELEGRAM_BANNER_BASE || 'https://korean.meeymirita.ru').replace(/\/$/, '')}/tg/tg-banner.png?v=${BANNER_VERSION}`
    const wantPhoto = true
    const visible = text.replace(/<[^>]*>/g, '').length
    if (visible > (wantPhoto ? 1024 : 4000)) throw new Error(wantPhoto ? `с баннером текст не длиннее 1024 знаков, сейчас ${visible}` : `текст не длиннее 4000 знаков, сейчас ${visible}`)
    const reply_markup = this.guideMarkup()
    const markup = JSON.stringify(reply_markup)
    const form = (fields: Record<string, string | number>, field?: string) => {
      const f = new FormData()
      for (const [k, v] of Object.entries(fields)) f.append(k, String(v))
      if (o.file && field) f.append(field, new Blob([new Uint8Array(o.file.buffer)], { type: o.file.mimetype }), `banner.${o.file.mimetype.split('/')[1] ?? 'jpg'}`)
      return f
    }
    const fileIdOf = (r: TgResult) => (typeof r === 'object' && r?.photo?.length ? r.photo[r.photo.length - 1]!.file_id : undefined)
    const done = async (next: GuideState, edited: boolean) => {
      await this.guideSave({ ...next, text })
      return { edited, pinned: true }
    }

    if (!o.forceNew && st.messageId) {
      try {
        if (wantPhoto && st.kind === 'photo') {
          if (o.file) {
            const r = await this.tgRaw('editMessageMedia', form({ chat_id: chat, message_id: st.messageId, media: JSON.stringify({ type: 'photo', media: 'attach://banner', caption: text, parse_mode: 'HTML' }), reply_markup: markup }, 'banner'))
            return await done({ ...st, fileId: fileIdOf(r) ?? st.fileId }, true)
          }
          await this.tgRaw('editMessageCaption', { chat_id: chat, message_id: st.messageId, caption: text, parse_mode: 'HTML', reply_markup })
          return await done(st, true)
        }
        if (!wantPhoto && st.kind === 'text') {
          await this.tgRaw('editMessageText', { chat_id: chat, message_id: st.messageId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup })
          return await done(st, true)
        }
      } catch (e) {
        if (/not modified/i.test((e as Error).message)) return await done(st, true)
        // править нельзя (сообщение удалено или был текст, а теперь баннер): отправим новое
      }
    }

    let r: TgResult
    let next: GuideState
    if (wantPhoto) {
      try {
        r = o.file
          ? await this.tgRaw('sendPhoto', form({ chat_id: chat, caption: text, parse_mode: 'HTML', reply_markup: markup }, 'photo'))
          : await this.tgRaw('sendPhoto', { chat_id: chat, photo: st.fileId ?? defaultBanner, caption: text, parse_mode: 'HTML', reply_markup })
        next = { ...st, kind: 'photo', fileId: fileIdOf(r) ?? st.fileId }
      } catch (e) {
        if (o.file || st.fileId) throw e
        // баннера по умолчанию ещё нет на сайте (до выкладки): отправляем одним текстом
        logError('Telegram: баннер по умолчанию не ушёл, шлю текстом:', (e as Error).message)
        r = await this.tgRaw('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, reply_markup })
        next = { ...st, kind: 'text' }
      }
    } else {
      r = undefined
      next = { ...st }
    }
    const id = typeof r === 'object' && r ? r.message_id : undefined
    if (st.messageId) await this.tgCall('deleteMessage', { chat_id: chat, message_id: st.messageId }).catch(() => undefined)
    next.messageId = id
    let pinned = false
    if (id) {
      try {
        await this.tgCall('pinChatMessage', { chat_id: chat, message_id: id, disable_notification: true })
        pinned = true
      } catch (e) {
        logError('Telegram: не закрепил сообщение (нужно право «Закрепление сообщений»):', (e as Error).message)
      }
    }
    await this.guideSave({ ...next, text })
    return { edited: false, pinned }
  }
}

interface GuideState {
  text?: string
  fileId?: string
  messageId?: number
  kind?: 'photo' | 'text'
}

function maskTo(e: string) {
  const [name = '', domain = ''] = e.split('@')
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`
}
