/** Письма платформы в стиле сайта: таблицы и встроенные стили (почтовые программы не понимают современный CSS), у каждого письма есть и текстовая версия. */
export interface Mail {
  subject: string
  text: string
  html: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

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
      Если вы не входили на сайт, никому не называйте код и смените токен в файле <b>server/.env</b>.
    </div>
  </td></tr>
  <tr><td style="padding:16px 28px;background:#fbf8ff;border-top:1px solid #eee9ff;font-size:12px;line-height:1.7;color:#8b8fc4">
    Это служебное письмо платформы 우리말 (korean.meeymirita.ru). Оно приходит только когда вы входите или меняете защиту. Отвечать на него не нужно.
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = `${title} для 우리말: ${code}\n\n${lead}\nКод действует ${minutes} минут и подходит один раз.\n\nЕсли вы не входили на сайт, никому не называйте код и смените токен в файле server/.env.\n\nЭто служебное письмо платформы 우리말 (korean.meeymirita.ru), отвечать на него не нужно.`
  return { subject: `${title}: ${code}`, text, html }
}
