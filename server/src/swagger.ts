/**
 * Swagger: описание API и страница для запросов из браузера, /api/docs (JSON: /api/docs-json).
 * Включается только переменной SWAGGER=1 (локально: SWAGGER=1 npm run server). Страница отдаётся мимо проверки токена,
 * поэтому на боевом сервере её не включать: Caddy пропускает наружу всё /api/*.
 * Запросы со страницы идут с токеном: кнопка Authorize, поле bearer.
 */
import { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

export const DOCS_PATH = 'api/docs'

export function setupSwagger(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('우리말 API')
    .setDescription('Сервер платформы 우리말: прогресс, заметки, картинки, календарь, гостевые токены. Всё, кроме /api/health и /api/public/*, закрыто токеном.')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'токен владельца или гостя (при защите кодом из письма — токен сеанса)' })
    .addSecurityRequirements('bearer')
    .build()
  const doc = SwaggerModule.createDocument(app, config)
  // группы по разделу адреса (/api/notes/... → notes), чтобы не расставлять @ApiTags в каждом контроллере
  for (const [url, item] of Object.entries(doc.paths)) {
    const tag = url.split('/')[2] || 'api'
    for (const op of Object.values(item)) if (op && typeof op === 'object' && 'responses' in op) op.tags = [tag]
  }
  SwaggerModule.setup(DOCS_PATH, app, doc, { customSiteTitle: '우리말 API', swaggerOptions: { persistAuthorization: false } })
}
