// Собирает docs/**/*.md в один файл index.html (читалка документации: меню по файлам, поиск по тексту, оглавление, тёмная тема).
// Запуск: cd tools/docs-reader && npm install && node build.mjs, потом открыть index.html (в git не кладётся).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const DOCS = join(here, '../../docs')
const GROUPS = [
  ['Начало', ['home-and-theme', 'progress', 'data', 'game', 'games-catalog']],
  ['Тренажёры', ['trainers/']],
  ['Сервер и выкладка', ['server', 'docker', 'hosting', 'backup', 'disk-and-telegram', 'telegram']],
  ['Возможности', ['dict', 'chat', 'voice', 'music', 'manhwa', 'bot', 'mac-app', 'desktop-skill']],
  ['Идеи и дизайн', ['ideas']],
]
const files = []
const walk = d => readdirSync(d).forEach(f => {
  const p = join(d, f)
  statSync(p).isDirectory() ? walk(p) : f.endsWith('.md') && files.push(relative(DOCS, p).replace(/\.md$/, ''))
})
walk(DOCS)
const docs = files.sort().map(id => {
  const md = readFileSync(join(DOCS, id + '.md'), 'utf8')
  const title = /^#\s+(.+)$/m.exec(md)?.[1]?.replace(/[`*]/g, '') ?? id
  const group = GROUPS.find(([, m]) => m.some(x => (x.endsWith('/') ? id.startsWith(x) : id === x)))?.[0] ?? 'Прочее'
  return { id, title, group, md }
})
const order = [...GROUPS.map(g => g[0]), 'Прочее']
const marked = readFileSync(join(here, 'node_modules/marked/lib/marked.umd.js'), 'utf8')
const data = JSON.stringify({ docs, order }).replace(/</g, '\\u003c')
const tpl = readFileSync(join(here, 'template.html'), 'utf8')
writeFileSync(join(here, 'index.html'), tpl.replace('/*MARKED*/', () => marked.replace(/<\/script/g, '<\\/script')).replace('/*DATA*/', () => data))
console.log(docs.length + ' файлов → index.html')
