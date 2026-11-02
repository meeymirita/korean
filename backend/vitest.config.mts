import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

// Тесты Nest (e2e через @nestjs/testing и supertest). swc нужен ради декораторов и метаданных типов (иначе внедрение зависимостей не работает).
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup-env.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { target: 'es2022', parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
})
