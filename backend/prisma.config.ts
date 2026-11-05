import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Prisma generate runs during the image build, before Compose injects runtime env.
    url: process.env.DATABASE_URL ?? 'postgresql://build:build@127.0.0.1:5432/build',
  },
})
