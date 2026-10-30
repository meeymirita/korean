/**
 * Сервер сайта: NestJS + SQLite. Токен владельца берётся из server/.env (PROGRESS_TOKEN=секрет) или из переменной окружения.
 * Слушает только 127.0.0.1: наружу его выставляет Caddy (reverse_proxy /api/* → порт сервера).
 * Запуск: npm run build, затем npm start (в разработке npm run dev).
 */
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { DATA_DIR, MAX_JSON, PORT, TOKEN } from './config'
import { accessLogger, startLogCapture } from './logs/log-buffer'
import { RateLimiter, requestTimeout, securityHeaders } from './security'

startLogCapture() // журнал для кабинета: копим всё, что пишет сервер

async function bootstrap() {
  if (!TOKEN) {
    console.error('Не задан PROGRESS_TOKEN. Создай файл server/.env со строкой PROGRESS_TOKEN=придумай-секрет (образец: server/.env.example).')
    process.exit(1)
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'], bodyParser: false })
  if (TOKEN.length < 20) console.warn('ВНИМАНИЕ: токен короче 20 символов, его легко подобрать. Замени: openssl rand -base64 24')
  app.disable('x-powered-by')
  // за Caddy на этом же компьютере: настоящий адрес берётся из X-Forwarded-For только если запрос пришёл с loopback
  app.set('trust proxy', 'loopback')
  app.use(securityHeaders)
  app.use(accessLogger)
  app.use(app.get(RateLimiter).middleware)
  app.use(requestTimeout)
  app.useBodyParser('json', { limit: MAX_JSON })
  app.setGlobalPrefix('api')
  app.enableShutdownHooks()
  const server = await app.listen(PORT, '127.0.0.1')
  // медленные и зависшие соединения закрываются (защита от «медленных» атак)
  server.headersTimeout = 15_000
  server.requestTimeout = 190_000
  server.keepAliveTimeout = 5_000
  server.maxHeadersCount = 60
  server.maxRequestsPerSocket = 200
  console.log(`Сервер: http://127.0.0.1:${PORT}/api, данные в ${DATA_DIR}`)
}
void bootstrap()
