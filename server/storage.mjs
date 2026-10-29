/** Файлы с данными: запись через временный файл по очереди и ежедневные копии прогресса и заметок. */
import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BACKUPS, DATA_DIR, FILE, KEEP_BACKUPS, NOTES_FILE } from './config.mjs'

/** Записи идут строго по очереди: два запроса не могут одновременно писать во временный файл. */
let queue = Promise.resolve()
export const enqueue = task => {
  const run = queue.then(task)
  queue = run.catch(() => {})
  return run
}

/** Запись через временный файл: файл не может остаться наполовину записанным. */
export async function writeAtomic(file, text) {
  await mkdir(DATA_DIR, { recursive: true })
  const tmp = file + '.tmp'
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

/** Один раз в день кладём копию файла (`<prefix>-ГГГГ-ММ-ДД.json`) и храним последние KEEP_BACKUPS штук. */
async function backup(file, prefix) {
  const day = new Date().toISOString().slice(0, 10)
  const target = path.join(BACKUPS, `${prefix}-${day}.json`)
  try {
    await mkdir(BACKUPS, { recursive: true })
    try {
      await readFile(target)
    } catch {
      await copyFile(file, target)
    }
    const files = (await readdir(BACKUPS)).filter(f => f.startsWith(prefix + '-')).sort()
    for (const old of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) await unlink(path.join(BACKUPS, old))
  } catch {
    /* копии — дополнительная страховка, их отсутствие не должно ломать сохранение */
  }
}

/** Прогресс владельца; пустой объект, если файла ещё нет. */
export async function readProgress() {
  try {
    return JSON.parse(await readFile(FILE, 'utf8'))
  } catch {
    return {}
  }
}

export const saveProgress = data =>
  enqueue(async () => {
    await backup(FILE, 'progress')
    await writeAtomic(FILE, JSON.stringify(data, null, 2))
  })

/** Заметки владельца; пустой объект, если файла ещё нет. */
export async function readNotes() {
  try {
    return JSON.parse(await readFile(NOTES_FILE, 'utf8'))
  } catch {
    return {}
  }
}

export const saveNotes = data =>
  enqueue(async () => {
    await backup(NOTES_FILE, 'notes')
    await writeAtomic(NOTES_FILE, JSON.stringify(data, null, 2))
  })
