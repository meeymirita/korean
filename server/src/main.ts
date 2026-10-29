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

async function bootstrap() {
  if (!TOKEN) {
    console.error('Не задан PROGRESS_TOKEN. Создай файл server/.env со строкой PROGRESS_TOKEN=придумай-секрет (образец: server/.env.example).')
    process.exit(1)
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error', 'warn'], bodyParser: false })
  app.useBodyParser('json', { limit: MAX_JSON })
  app.setGlobalPrefix('api')
  app.enableShutdownHooks()
  await app.listen(PORT, '127.0.0.1')
  console.log(`Сервер: http://127.0.0.1:${PORT}/api, данные в ${DATA_DIR}`)
}
void bootstrap()
