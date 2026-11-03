import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = new URL('../frontend/src/', import.meta.url).pathname
const walk = d => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
const files = walk(SRC)

/** Классы, которые встречаются в готовой разметке справочников (`pages.ts`, `v-html`): им нельзя совпадать с «голыми» глобальными классами компонентов. */
const pagesHtml = readFileSync(join(SRC, 'data/korean/pages.ts'), 'utf8')
const usedInHtml = new Set([...pagesHtml.matchAll(/class="([^"$]+)"/g)].flatMap(m => m[1].split(/\s+/)))

/** Голые селекторы вида `.имя {` из <style> без scoped: они действуют на всём сайте. */
function bareGlobalClasses(vue) {
  const out = []
  for (const m of vue.matchAll(/<style(?![^>]*scoped)[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '')
    for (const r of css.matchAll(/(?:^|\})\s*\.([A-Za-z_][\w-]*)\s*\{/g)) out.push(r[1])
  }
  return out
}

test('глобальные стили компонентов не совпадают по имени с классами справочников (так окно заметки закрыло экран на «Числах»)', () => {
  for (const f of files.filter(x => x.endsWith('.vue'))) {
    for (const c of bareGlobalClasses(readFileSync(f, 'utf8'))) {
      assert.ok(!usedInHtml.has(c), `${f.replace(SRC, '')}: глобальный класс .${c} совпадает с классом в разметке справочников, переименуй`)
    }
  }
})

test('корень окна заметки не называется .nm', () => {
  const modal = readFileSync(join(SRC, 'components/cabinet/NoteModal.vue'), 'utf8')
  assert.ok(!/class="nm"/.test(modal) && !/^\.nm \{/m.test(modal))
})
