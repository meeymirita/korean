/**
 * Сервер сайта: NestJS + Prisma + PostgreSQL. Токен владельца берётся из backend/.env (PROGRESS_TOKEN=секрет) или из переменной окружения.
 * Слушает только 127.0.0.1: наружу его выставляет Caddy (reverse_proxy /api/* → порт сервера).
 * Запуск: npm run build, затем npm start (в разработке npm run dev).
 */
import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { DATA_DIR, MAX_JSON, PORT, SWAGGER, TOKEN } from './config.js'
import { RateLimiter, requestTimeout, securityHeaders } from './security.js'
import { DOCS_PATH, setupSwagger } from './swagger.js'
import { MetricsService } from './metrics.service.js'

async function bootstrap() {
  if (!TOKEN) {
    console.error('Не задан PROGRESS_TOKEN. Создай файл backend/.env со строкой PROGRESS_TOKEN=придумай-секрет (образец: backend/.env.example).')
    process.exit(1)
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'], bodyParser: false })
  if (TOKEN.length < 20) console.warn('ВНИМАНИЕ: токен короче 20 символов, его легко подобрать. Замени: openssl rand -base64 24')
  app.disable('x-powered-by')
  // за Caddy (на сервере или в Docker-сети): настоящий адрес берётся из X-Forwarded-For только от своих прокси (loopback и частные сети Docker).
  // Без этого все посетители выглядели бы одним адресом, а неверные попытки одного блокировали бы всех, включая владельца.
  app.set('trust proxy', (process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal').split(',').map(x => x.trim()).filter(Boolean))
  app.use(securityHeaders)
  app.use(app.get(RateLimiter).middleware)
  app.use(requestTimeout)
  app.use(app.get(MetricsService).middleware)
  // отчёты браузера о нарушении CSP приходят со своим типом содержимого (csp-report.controller.ts)
  app.useBodyParser('json', { limit: MAX_JSON, type: ['application/json', 'application/csp-report', 'application/reports+json'] })
  app.setGlobalPrefix('api')
  app.enableShutdownHooks()
  if (SWAGGER) setupSwagger(app)
  const server = await app.listen(PORT, process.env.HOST || '127.0.0.1')
  // медленные и зависшие соединения закрываются (защита от «медленных» атак)
  server.headersTimeout = 15_000
  server.requestTimeout = 190_000
  server.keepAliveTimeout = 5_000
  server.maxHeadersCount = 60
  server.maxRequestsPerSocket = 200
  console.log(`Сервер: http://127.0.0.1:${PORT}/api, данные в ${DATA_DIR}`)
  if (SWAGGER) console.warn(`Swagger открыт без токена: http://127.0.0.1:${PORT}/${DOCS_PATH} (на боевом сервере SWAGGER не включать)`)
}
void bootstrap()
