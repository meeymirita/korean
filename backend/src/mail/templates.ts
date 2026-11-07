/** Письма платформы в стиле сайта: таблицы и встроенные стили (почтовые программы не понимают современный CSS), у каждого письма есть и текстовая версия. */
export interface Mail {
  subject: string
  text: string
  html: string
  /** версия для Telegram: HTML-разметка Telegram (b, i, code, blockquote, a) и кнопка-ссылка под сообщением */
  tg?: { html: string; button?: { text: string; url: string } }
  /** тема в Telegram-группе (и имя баннера tg-<тема>.png в frontend/public/tg) */
  topic?: TgTopic
}

export const TG_TOPICS = ['login', 'remind', 'digest', 'lesson', 'backup', 'alert'] as const
export type TgTopic = (typeof TG_TOPICS)[number]
/** Названия тем группы, как в Telegram и на вкладке «Telegram» кабинета. */
export const TG_TOPIC_NAMES: Record<TgTopic, string> = { login: 'Вход', remind: 'Напоминания', digest: 'Подборка слов', lesson: 'Созвон', backup: 'Копии', alert: 'Тревоги' }

/** Сердечко темы: по нему сразу видно, откуда сообщение. */
export const TG_HEART: Record<TgTopic, string> = { login: '💙', remind: '🩷', digest: '💜', lesson: '🩵', backup: '🤍', alert: '❤️' }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Сообщение Telegram в духе письма: шапка с сердечками темы, заголовок, текст, врезка и подпись. */
function tgCard(o: { topic: TgTopic; kicker?: string; title: string; lead?: string; body?: string; note?: string; foot: string; button?: { text: string; url: string } }) {
  const h = TG_HEART[o.topic]
  const html = [
    `${h} <b>우리말</b> ${h}`,
    `${h} ─ ─ ─ ─ ─ ─ ─ ─ ${h}`,
    '',
    o.kicker ? `<i>${esc(o.kicker)}</i>` : '',
    `${h} <b>${esc(o.title)}</b>`,
    o.lead ? `\n${esc(o.lead)}` : '',
    o.body ? `\n${o.body}` : '',
    o.note ? `\n<blockquote>${esc(o.note)}</blockquote>` : '',
    `\n<i>${h} ${esc(o.foot)}</i>`,
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n')
  return { html, button: o.button }
}

/** Письмо с кодом. login — вход на сайт, enable — подтверждение адреса при включении защиты. */
export function codeMail(code: string, purpose: 'login' | 'enable', minutes = 10): Mail {
  const login = purpose === 'login'
  const title = login ? 'Код для входа' : 'Подтверждение почты'
  const lead = login ? 'Вы вводите токен на сайте, и мы просим второй шаг. Введите этот код в окне входа.' : 'Введите этот код в настройках кабинета, и защита кодом из письма включится.'
  const digits = code.split('')
  const boxes = digits
    .map(d => `<td style="padding:0 5px"><div style="width:52px;height:64px;line-height:64px;text-align:center;font-size:34px;font-weight:700;color:#37378f;background:#f1ecff;border:1px solid #ddd3ff;border-radius:14px;font-family:Arial,Helvetica,sans-serif">${esc(d)}</div></td>`)
    .join('')
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1eaff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(title)}: ${esc(code)}. Действует ${minutes} минут.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eaff"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1e2350">
  <tr><td style="padding:22px 28px;background:#f4e9fd;background-image:linear-gradient(135deg,#f9e8fb,#e7eaff 55%,#fff0f6)">
    <span style="font-size:24px;color:#6a5cd0;vertical-align:middle">&#10035;</span>
    <span style="font-size:18px;font-weight:700;letter-spacing:3px;vertical-align:middle;margin-left:8px">우리말</span>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.2;color:#1e2350">${esc(title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6c70a8">${esc(lead)}</p>
  </td></tr>
  <tr><td align="center" style="padding:20px 28px 8px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>${boxes}</tr></table>
  </td></tr>
  <tr><td align="center" style="padding:8px 28px 20px;font-size:13px;color:#8b8fc4">Код действует ${minutes} минут и подходит один раз.</td></tr>
  <tr><td style="padding:0 28px 26px">
    <div style="border-left:4px solid #d64da9;background:#fff5f9;padding:12px 16px;border-radius:0 14px 14px 0;font-size:14px;line-height:1.6;color:#1e2350">
      Если вы не входили на сайт, никому не называйте код и смените токен в файле <b>backend/.env</b>.
    </div>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#fbf8ff;border-top:1px solid #eee9ff;font-size:12px;line-height:1.7;color:#8b8fc4">
    Это служебное письмо платформы 우리말 (korean.meeymirita.ru). Оно приходит только когда вы входите или меняете защиту. Отвечать на него не нужно.
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = `${title} для 우리말: ${code}\n\n${lead}\nКод действует ${minutes} минут и подходит один раз.\n\nЕсли вы не входили на сайт, никому не называйте код и смените токен в файле backend/.env.\n\nЭто служебное письмо платформы 우리말 (korean.meeymirita.ru), отвечать на него не нужно.`
  const tg = tgCard({
    topic: 'login',
    title,
    lead,
    body: `<b>Ваш код:</b>\n<code>${esc(code)}</code>\n<i>нажмите на код, чтобы скопировать · действует ${minutes} минут, один раз</i>`,
    note: 'Если вы не входили на сайт, никому не называйте код и смените токен в файле backend/.env.',
    foot: 'Служебное сообщение платформы 우리말 (korean.meeymirita.ru).',
  })
  return { subject: `${title}: ${code}`, text, html, tg, topic: 'login' }
}

export interface BackupMailOptions {
  kind: 'archive' | 'big' | 'test' | 'nightly-fail' | 'stale' | 'disk-fail'
  /** пояснение для тревожных писем (что сказал скрипт) или число часов без свежей копии */
  detail?: string
  /** имя файла-вложения (для archive) */
  name?: string
  /** размер полного архива, МБ */
  mb?: string
  /** номер письма и их число, если архив разрезан */
  part?: { i: number; n: number }
  when?: Date
}

const pre = (s: string) => `<div style="margin:8px 0 0;padding:12px 14px;background:#f6f3ff;border:1px solid #e4dcff;border-radius:12px;font-family:Menlo,Consolas,'Courier New',monospace;font-size:13px;line-height:1.6;color:#37378f;word-break:break-all">${esc(s)}</div>`
const step = (n: number, title: string, body: string) =>
  `<tr><td valign="top" style="padding:0 14px 16px 0;width:34px"><div style="width:30px;height:30px;line-height:30px;text-align:center;font-size:14px;font-weight:700;color:#fff;background:#8f7cf0;border-radius:50%">${n}</div></td><td style="padding:0 0 16px;font-size:14px;line-height:1.6;color:#1e2350"><b>${esc(title)}</b>${body}</td></tr>`

/** Письмо с копией платформы: красивое HTML и понятная текстовая версия с шагами «как открыть». Пароль в письмо не попадает. */
export function backupMail(o: BackupMailOptions): Mail {
  const when = (o.when ?? new Date()).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const part = o.part && o.part.n > 1 ? o.part : null
  const file = o.name ? (part ? `${o.name}.part${part.i}` : o.name) : 'korean-ДАТА.tar.gz.enc'
  const whole = o.name ?? 'korean-ДАТА.tar.gz.enc'
  const joinCmd = `cat ${whole}.part* > ${whole}`
  const openCmd = `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in ${whole} -out korean.tar.gz`
  const listCmd = 'tar -tzf korean.tar.gz | head'
  const unpackCmd = 'mkdir korean-restore && tar -xzf korean.tar.gz -C korean-restore'

  const titles = { archive: part ? `Копия платформы, часть ${part.i} из ${part.n}` : 'Резервная копия платформы', big: 'Архив слишком большой для почты', test: 'Проверка отправки', 'nightly-fail': 'Ночная копия не удалась', 'disk-fail': 'Копия не легла на Яндекс.Диск', stale: 'Ночная копия давно не делалась' }
  const leads = {
    archive: `Во вложении полный архив: база, картинки, файлы календаря и настройки${o.mb ? ` (${o.mb} МБ)` : ''}. Он зашифрован вашим паролем, поэтому открыть его без пароля нельзя.`,
    big: `Полный архив${o.mb ? ` (${o.mb} МБ)` : ''} не помещается в письма и остался на сервере в папке backend/data/export. Скачайте его оттуда вручную.`,
    test: 'Это проверочное письмо из «Настроек». Если оно пришло, почта для резервных копий настроена верно.',
    'nightly-fail': `Скрипт scripts/backup.sh завершился с ошибкой${o.detail ? `: ${o.detail}` : ''}. Последняя хорошая копия осталась на месте, но новой нет.`,
    'disk-fail': `Архив собран, но не загрузился на Диск${o.detail ? `: ${o.detail}` : ''}. Проверьте YADISK_TOKEN в .env и свободное место на Диске. Архив лежит на сервере в backend/data/export.`,
    stale: `Свежей ночной копии нет ${o.detail ?? 'больше суток'}: скрипт не запускался или завис. Проверьте таймер на сервере.`,
  }
  const alert = o.kind === 'nightly-fail' || o.kind === 'stale' || o.kind === 'disk-fail'
  const notice = alert
    ? 'Что сделать: на сервере выполните «systemctl status korean-backup.timer» и «bash scripts/backup.sh», посмотрите вывод. Подробности: docs/backup.md.'
    : 'Храните пароль архива отдельно от сервера: без него копию не открыть. Пароль в письме не указан намеренно.'
  const title = titles[o.kind]
  const lead = leads[o.kind]

  const howHtml =
    o.kind === 'archive'
      ? `<tr><td style="padding:4px 28px 6px"><div style="font-size:15px;font-weight:700;color:#1e2350;margin-bottom:12px">Как открыть</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${part ? step(1, 'Соберите все части', `<br><span style="color:#6c70a8">Скачайте все ${part.n} письма в одну папку и склейте по порядку:</span>${pre(joinCmd)}`) : ''}
${step(part ? 2 : 1, 'Расшифруйте', `<br><span style="color:#6c70a8">Откройте терминал в папке с файлом. Команда спросит пароль архива (BACKUP_PASSPHRASE); символы при вводе не видны, это нормально.</span>${pre(openCmd)}`)}
${step(part ? 3 : 2, 'Посмотрите, что внутри', pre(listCmd))}
${step(part ? 4 : 3, 'Распакуйте', `${pre(unpackCmd)}<br><span style="color:#6c70a8">После проверки удалите распакованное: в server.env лежат пароли.</span>`)}
</table></td></tr>`
      : ''
  const fileHtml =
    o.kind === 'archive'
      ? `<tr><td style="padding:6px 28px 18px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td style="padding:12px 16px;background:#f1ecff;border:1px solid #ddd3ff;border-radius:14px;font-size:13px;color:#37378f"><b>Вложение</b><br><span style="font-family:Menlo,Consolas,'Courier New',monospace;word-break:break-all">${esc(file)}</span></td></tr></table></td></tr>`
      : ''
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f1eaff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(title)}. ${esc(when)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eaff"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1e2350">
  <tr><td style="padding:22px 28px;background:#f4e9fd;background-image:linear-gradient(135deg,#f9e8fb,#e7eaff 55%,#fff0f6)">
    <span style="font-size:24px;color:#6a5cd0;vertical-align:middle">&#10035;</span>
    <span style="font-size:18px;font-weight:700;letter-spacing:3px;vertical-align:middle;margin-left:8px">우리말</span>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8f7cf0;margin-bottom:6px">${esc(when)}</div>
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;color:#1e2350">${esc(title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6c70a8">${esc(lead)}</p>
  </td></tr>
  ${fileHtml}
  ${howHtml}
  <tr><td style="padding:0 28px 26px">
    <div style="border-left:4px solid #d64da9;background:#fff5f9;padding:12px 16px;border-radius:0 14px 14px 0;font-size:14px;line-height:1.6;color:#1e2350">
      ${esc(notice)}
    </div>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#fbf8ff;border-top:1px solid #eee9ff;font-size:12px;line-height:1.7;color:#8b8fc4">
    Это служебное письмо платформы 우리말 (korean.meeymirita.ru). Оно приходит по кнопке в «Настройках», раз в неделю и при сбое ночной копии. Отвечать на него не нужно. Подробности: docs/backup.md.
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  const textHow =
    o.kind === 'archive'
      ? `\n\nКак открыть (терминал в папке с файлом):\n${part ? `1. Склейте все части: ${joinCmd}\n2.` : '1.'} Расшифруйте (спросит пароль BACKUP_PASSPHRASE): ${openCmd}\n${part ? '3.' : '2.'} Посмотрите: ${listCmd}\n${part ? '4.' : '3.'} Распакуйте: ${unpackCmd}\nПосле проверки удалите распакованное: в server.env лежат пароли.`
      : ''
  const text = `${title} (우리말, ${when})\n\n${lead}${textHow}\n\n${alert ? notice : 'Храните пароль архива отдельно от сервера. Подробности: docs/backup.md.'}`
  const topic: TgTopic = alert || o.kind === 'big' ? 'alert' : 'backup'
  const tg = tgCard({
    topic,
    kicker: when,
    title,
    lead,
    note: notice,
    foot: 'Служебное сообщение платформы 우리말. Подробности: docs/backup.md.',
  })
  return { tg, topic, subject: `우리말: ${o.kind === 'nightly-fail' ? 'ночная копия не удалась' : o.kind === 'disk-fail' ? 'копия не легла на Диск' : o.kind === 'stale' ? 'ночная копия давно не делалась' : o.kind === 'test' ? 'проверка отправки' : o.kind === 'big' ? 'архив слишком большой для почты' : `резервная копия${part ? ` (часть ${part.i} из ${part.n})` : ''}`}`, text, html }
}

export interface ReminderMailOptions {
  /** серия дней с верными ответами, оканчивающаяся вчера */
  streak?: number
  /** адрес сайта для кнопки */
  site?: string
}

/** Письмо-напоминание: сегодня ещё нет ответов, хватит пяти минут. */
export function reminderMail(o: ReminderMailOptions = {}): Mail {
  const site = (o.site || 'https://korean.meeymirita.ru').replace(/\/$/, '')
  const link = `${site}/korean/quick`
  const streak = o.streak && o.streak > 0 ? o.streak : 0
  const days = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дня' : 'дней')
  const lead = streak ? `Сегодня ещё не было ни одного ответа. Серия ${streak} ${days(streak)} подряд оборвётся, если не позаниматься. Хватит пяти минут.` : 'Сегодня ещё не было ни одного ответа. Хватит пяти минут: десять заданий вперемешку.'
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Пора заниматься</title></head>
<body style="margin:0;padding:0;background:#f1eaff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eaff"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1e2350">
  <tr><td style="padding:22px 28px;background:#f4e9fd;background-image:linear-gradient(135deg,#f9e8fb,#e7eaff 55%,#fff0f6)">
    <span style="font-size:24px;color:#6a5cd0;vertical-align:middle">&#10035;</span>
    <span style="font-size:18px;font-weight:700;letter-spacing:3px;vertical-align:middle;margin-left:8px">우리말</span>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;color:#1e2350">Пора заниматься</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6c70a8">${esc(lead)}</p>
  </td></tr>
  <tr><td align="center" style="padding:22px 28px 26px">
    <a href="${esc(link)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;background:#7863ff;border-radius:14px;text-decoration:none">Пять минут</a>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#fbf8ff;border-top:1px solid #eee9ff;font-size:12px;line-height:1.7;color:#8b8fc4">
    Это напоминание платформы 우리말. Время и включение настраиваются в кабинете, в «Настройках». Отвечать на письмо не нужно.
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = `Пора заниматься (우리말)\n\n${lead}\n\nОткрыть: ${link}\n\nВремя и включение: кабинет, «Настройки».`
  const tg = tgCard({ topic: 'remind', title: 'Пора заниматься', lead, foot: 'Время и включение: кабинет, «Настройки».', button: { text: 'Пять минут', url: link } })
  return { subject: '우리말: пора заниматься', text, html, tg, topic: 'remind' }
}

export interface LessonMailOptions {
  /** во сколько созвон, ЧЧ:ММ */
  time: string
  /** адрес сайта для кнопки */
  site?: string
}

/** Письмо-напоминание о созвоне с учителем: уходит в выбранный день недели в выбранное время. */
export function lessonMail(o: LessonMailOptions): Mail {
  const site = (o.site || 'https://korean.meeymirita.ru').replace(/\/$/, '')
  const link = `${site}/korean/cabinet`
  const lead = `Сегодня созвон в ${o.time}. Можно быстро пробежаться по словам и грамматике перед ним.`
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Сегодня созвон</title></head>
<body style="margin:0;padding:0;background:#f1eaff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eaff"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1e2350">
  <tr><td style="padding:22px 28px;background:#f4e9fd;background-image:linear-gradient(135deg,#f9e8fb,#e7eaff 55%,#fff0f6)">
    <span style="font-size:24px;color:#6a5cd0;vertical-align:middle">&#10035;</span>
    <span style="font-size:18px;font-weight:700;letter-spacing:3px;vertical-align:middle;margin-left:8px">우리말</span>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <h1 style="margin:0 0 10px;font-size:24px;line-height:1.2;color:#1e2350">Сегодня созвон</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#6c70a8">${esc(lead)}</p>
  </td></tr>
  <tr><td align="center" style="padding:22px 28px 26px">
    <a href="${esc(link)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;background:#7863ff;border-radius:14px;text-decoration:none">Открыть кабинет</a>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#fbf8ff;border-top:1px solid #eee9ff;font-size:12px;line-height:1.7;color:#8b8fc4">
    Это напоминание платформы 우리말. День, время и включение настраиваются в кабинете, во вкладке «Уведомления». Отвечать на письмо не нужно.
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = `Сегодня созвон (우리말)\n\n${lead}\n\nОткрыть: ${link}\n\nДень, время и включение: кабинет, «Уведомления».`
  const tg = tgCard({ topic: 'lesson', title: 'Сегодня созвон', lead, foot: 'День, время и включение: кабинет, «Уведомления».', button: { text: 'Открыть кабинет', url: link } })
  return { subject: '우리말: сегодня созвон', text, html, tg, topic: 'lesson' }
}

export interface DigestMailOptions {
  /** слова: [по-корейски, перевод] */
  words: [string, string][]
  /** предложения: [по-корейски, перевод] */
  sentences: [string, string][]
  /** время отправки ЧЧ:ММ (для темы и подвала) */
  time: string
  site?: string
}

const plural = (n: number, one: string, few: string, many: string) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many)

/** Письмо-подборка по времени: случайные слова и предложения на повторение. */
export function digestMail(o: DigestMailOptions): Mail {
  const site = (o.site || 'https://korean.meeymirita.ru').replace(/\/$/, '')
  const link = `${site}/korean/review`
  const nw = o.words.length
  const ns = o.sentences.length
  const parts = [nw ? `${nw} ${plural(nw, 'слово', 'слова', 'слов')}` : '', ns ? `${ns} ${plural(ns, 'предложение', 'предложения', 'предложений')}` : ''].filter(Boolean)
  const what = parts.join(' и ')
  const lead = `${nw ? `${nw} случайных ${plural(nw, 'слово', 'слова', 'слов')}` : ''}${nw && ns ? ' и ' : ''}${ns ? `${ns} ${plural(ns, 'предложение', 'предложения', 'предложений')}` : ''}. Всё из пройденного.`
  const label = (t: string) => `<div style="margin:20px 0 10px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#8f7cf0">${t}</div>`
  const wordRows = o.words
    .map(([k, r]) => `<tr><td style="padding:0 0 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ff;border-radius:12px"><tr><td style="padding:10px 14px;font-size:20px;font-weight:700;color:#37378f">${esc(k)}</td><td align="right" style="padding:10px 14px;font-size:14px;color:#6c70a8">${esc(r)}</td></tr></table></td></tr>`)
    .join('')
  const sentRows = o.sentences
    .map(([k, r]) => `<tr><td style="padding:0 0 8px"><div style="padding:12px 14px;border:1px solid #e4dcff;border-radius:14px"><div style="font-size:17px;font-weight:700;color:#37378f;line-height:1.4">${esc(k)}</div><div style="font-size:13px;color:#6c70a8;margin-top:2px">${esc(r)}</div></div></td></tr>`)
    .join('')
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Подборка на сегодня</title></head>
<body style="margin:0;padding:0;background:#f1eaff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(what)} на повторение.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1eaff"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:24px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1e2350">
  <tr><td style="padding:22px 28px;background:#f4e9fd;background-image:linear-gradient(135deg,#f9e8fb,#e7eaff 55%,#fff0f6)">
    <span style="font-size:24px;color:#6a5cd0;vertical-align:middle">&#10035;&#xFE0E;</span>
    <span style="font-size:18px;font-weight:700;letter-spacing:3px;vertical-align:middle;margin-left:8px">우리말</span>
  </td></tr>
  <tr><td style="padding:26px 28px 6px">
    <h1 style="margin:0 0 6px;font-size:22px;line-height:1.2;color:#1e2350">Подборка на сегодня</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#6c70a8">${esc(lead)}</p>
    ${nw ? label('Слова') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${wordRows}</table>` : ''}
    ${ns ? label('Предложения') + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sentRows}</table>` : ''}
  </td></tr>
  <tr><td align="center" style="padding:14px 28px 26px">
    <a href="${esc(link)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#37378f;background:#cfe9fb;background-image:linear-gradient(100deg,#f8b9e9,#9de4ff);border-radius:28px;text-decoration:none">Повторить на сайте</a>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#fbf8ff;border-top:1px solid #eee9ff;font-size:12px;line-height:1.7;color:#8b8fc4">
    Приходит в ${esc(o.time)} по часам сервера. Время и число слов меняются в кабинете, в «Настройках». Отвечать на письмо не нужно.
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = `Подборка на сегодня (우리말)\n\n${lead}\n${nw ? `\nСлова:\n${o.words.map(([k, r]) => `${k} — ${r}`).join('\n')}\n` : ''}${ns ? `\nПредложения:\n${o.sentences.map(([k, r]) => `${k}\n  ${r}`).join('\n')}\n` : ''}\nПовторить на сайте: ${link}\n\nВремя и число слов: кабинет, «Настройки».`
  const wordsTg = nw ? `💜 <b>СЛОВА</b>\n<blockquote>${o.words.map(([k, r]) => `<b>${esc(k)}</b> — ${esc(r)}`).join('\n')}</blockquote>` : ''
  const sentTg = ns ? `💜 <b>ПРЕДЛОЖЕНИЯ</b>\n<blockquote>${o.sentences.map(([k, r]) => `<b>${esc(k)}</b>\n<i>${esc(r)}</i>`).join('\n\n')}</blockquote>` : ''
  const tg = tgCard({ topic: 'digest', title: 'Подборка на сегодня', lead, body: [wordsTg, sentTg].filter(Boolean).join('\n'), foot: `Приходит в ${o.time}. Время и число слов: кабинет, «Настройки».`, button: { text: 'Повторить на сайте', url: link } })
  return { subject: `Повторение: ${o.time} · ${what}`, text, html, tg, topic: 'digest' }
}

/** Пробное сообщение в тему группы: свой текст в оформлении писем (шапка с сердечками темы, название темы, текст). */
export function topicTestMail(topic: TgTopic, text: string): Mail {
  const tg = tgCard({ topic, title: TG_TOPIC_NAMES[topic], lead: text, foot: 'Пробное сообщение из кабинета (вкладка «Telegram»).' })
  return { subject: `우리말: проба, тема «${TG_TOPIC_NAMES[topic]}»`, text, html: esc(text), tg, topic }
}

/** Настоящее сообщение темы с выдуманными данными: по кнопке «Пример сообщения» в кабинете видно, как оно придёт на самом деле. */
export function sampleMail(topic: TgTopic): Mail {
  switch (topic) {
    case 'login':
      return codeMail('4827', 'login')
    case 'remind':
      return reminderMail({ streak: 6 })
    case 'digest':
      return digestMail({
        words: [['안녕하세요', 'здравствуйте'], ['감사합니다', 'спасибо'], ['학교', 'школа'], ['친구', 'друг'], ['물', 'вода']],
        sentences: [['저는 학생이에요.', 'Я студент(ка).'], ['이것은 물이에요.', 'Это вода.']],
        time: '09:00',
      })
    case 'lesson':
      return lessonMail({ time: '19:30' })
    case 'backup':
      return backupMail({ kind: 'test' })
    case 'alert':
      return backupMail({ kind: 'disk-fail', detail: 'пример: на Диске закончилось место' })
  }
}
