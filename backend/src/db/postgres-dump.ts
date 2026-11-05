/** Собирает аргументы pg_dump, удаляя из Prisma URL параметр schema и переводя его в --schema. */
export function postgresDumpConfig(file: string, env: NodeJS.ProcessEnv = process.env) {
  const source = env.PG_DUMP_DATABASE_URL || env.DATABASE_URL
  if (!source) throw new Error('Не задан DATABASE_URL для pg_dump')
  let url: URL
  try {
    url = new URL(source)
  } catch {
    throw new Error('DATABASE_URL для pg_dump имеет неверный формат')
  }
  const schema = env.PG_DUMP_SCHEMA || url.searchParams.get('schema') || ''
  url.searchParams.delete('schema')
  if (schema && !/^[a-zA-Z_][a-zA-Z0-9_$]{0,62}$/.test(schema)) throw new Error('Имя схемы PostgreSQL для pg_dump недопустимо')
  const args = ['--format=custom', '--no-owner', '--file', file]
  if (schema) args.push('--schema', schema)
  return { args, env: { PGDATABASE: url.toString() } }
}
