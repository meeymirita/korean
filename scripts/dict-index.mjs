// Индексирует большой словарь (krdict_ko_ru.json) в Meilisearch без запуска сервера.
// Нужны MEILISEARCH_URL и MEILISEARCH_MASTER_KEY (как у сервера) и собранный сервер (npm run server:build).
// Файл: первым аргументом, иначе DICT_FILE, иначе материалы/словарь-krdict/krdict_ko_ru.json.
import { fileURLToPath } from 'node:url'
import { DictService } from '../backend/dist/dict/dict.service.js'

const file = process.argv[2] || process.env.DICT_FILE || fileURLToPath(new URL('../материалы/словарь-krdict/krdict_ko_ru.json', import.meta.url))
const t = Date.now()
const res = await new DictService().reindex(file)
console.log(`готово за ${Math.round((Date.now() - t) / 1000)} с:`, res)
