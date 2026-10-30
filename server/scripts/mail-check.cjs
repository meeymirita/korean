/**
 * Проверка почты для кодов входа: читает SMTP_* из server/.env (через собранный config), проверяет вход в почту
 * и, если передан адрес, отправляет на него тестовое письмо. Запуск: npm --prefix server run mail:check [адрес]
 * Пароль нигде не печатается.
 */
require('../dist/config')
const nodemailer = require('nodemailer')

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
const missing = Object.entries({ SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM }).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.log('Не заданы в server/.env:', missing.join(', '))
  process.exit(1)
}
const port = Number(SMTP_PORT || 465)
console.log(`Почта: ${SMTP_HOST}:${port}, вход как ${SMTP_USER}, отправитель ${SMTP_FROM.trim()}`)
const t = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS }, connectionTimeout: 10000 })
const to = process.argv[2]
t.verify()
  .then(() => {
    console.log('OK: вход в почту принят')
    if (!to) return console.log('Чтобы отправить тестовое письмо: npm --prefix server run mail:check -- адрес@почта')
    return t.sendMail({ from: SMTP_FROM, to, subject: 'Проверка почты 우리말', text: 'Если вы это читаете, коды входа будут приходить.' }).then(() => console.log(`OK: тестовое письмо отправлено на ${to}`))
  })
  .catch(e => {
    console.log('Ошибка:', e.message)
    process.exit(1)
  })
