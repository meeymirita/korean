// Тесты (tests/) напрямую импортируют pinia и vue (setActivePinia, nextTick), а те же модули грузит и Vite внутри
// tests/_load.mjs из frontend/node_modules — если это будут две разные установки пакета, у pinia два разных
// глобальных состояния и setActivePinia() из теста не видит стор, который берёт load(). Поэтому у корня нет своих
// копий pinia/vue в package.json: этот скрипт (запускается сам после `npm install` в корне) делает node_modules/pinia
// и node_modules/vue символическими ссылками на копии внутри frontend/, чтобы Node резолвил их в один и тот же файл.
import { existsSync, lstatSync, rmSync, symlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

for (const pkg of ['pinia', 'vue']) {
  const target = `${root}frontend/node_modules/${pkg}`
  const link = `${root}node_modules/${pkg}`
  if (!existsSync(target)) {
    console.warn(`пропускаю ${pkg}: нет frontend/node_modules/${pkg} — сначала npm install внутри frontend/`)
    continue
  }
  if (existsSync(link) || lstatSync(link, { throwIfNoEntry: false })) rmSync(link, { recursive: true, force: true })
  symlinkSync(`../frontend/node_modules/${pkg}`, link, 'dir')
}
