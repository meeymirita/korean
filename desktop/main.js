// 우리말 для Mac: окно вокруг боевого сайта. Сайт обновляется сам, оболочку пересобирать почти не нужно (docs/mac-app.md).
// Безопасность: contextIsolation, sandbox, без nodeIntegration; только свой адрес внутри окна, всё чужое в обычном браузере; токен нигде не пишется и не логируется.
const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme, session, systemPreferences } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SITE = process.env.URIMAL_SITE || 'https://korean.meeymirita.ru'
const ORIGIN = new URL(SITE).origin
const PARTITION = 'persist:urimal'
const STATE_FILE = () => path.join(app.getPath('userData'), 'window.json')
/** Как часто спрашивать «пора повторить»: раз в 5 минут и после каждой загрузки страницы. */
const BADGE_EVERY_MS = 5 * 60 * 1000

let win = null
let badgeTimer = null

const own = url => {
  try {
    return new URL(url).origin === ORIGIN
  } catch {
    return false
  }
}
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'))
  } catch {
    return {}
  }
}
function saveState() {
  if (!win || win.isDestroyed() || win.isMinimized()) return
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify({ ...win.getBounds(), maximized: win.isMaximized() }))
  } catch {
    /* окно запомнит положение в другой раз */
  }
}

/** Число слов «пора повторить» читаем из самого сайта (его хранилище Pinia), без токенов и запросов из оболочки. Формула как в `data/review.ts`: интервалы 0/1/3/7/14/30 дней. */
const DUE_JS = `(() => {
  try {
    const app = document.querySelector('#__nuxt')?.__vue_app__
    const words = app?.config.globalProperties.$pinia.state.value.progress?.data?.words
    if (!words) return -1
    const iv = [0, 1, 3, 7, 14, 30], now = Date.now()
    let n = 0
    for (const s of Object.values(words)) {
      if (!s || s.ok + s.bad === 0) continue
      if (now - s.last >= iv[Math.min(s.streak, 5)] * 86400000) n++
    }
    return n
  } catch { return -1 }
})()`
async function updateBadge() {
  if (!win || win.isDestroyed() || !own(win.webContents.getURL())) return
  try {
    const n = await win.webContents.executeJavaScript(DUE_JS)
    if (process.platform === 'darwin') app.dock.setBadge(n > 0 ? String(n) : '')
  } catch {
    /* страница ещё грузится */
  }
}

function createWindow() {
  const st = readState()
  win = new BrowserWindow({
    width: st.width || 1360,
    height: st.height || 880,
    x: st.x,
    y: st.y,
    minWidth: 420,
    minHeight: 560,
    title: '우리말',
    backgroundColor: '#fbf8ff',
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  if (st.maximized) win.maximize()
  for (const ev of ['resize', 'move', 'close']) win.on(ev, saveState)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (own(url)) void win.loadURL(url)
    else if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (own(url) || url.startsWith('file:')) return
    e.preventDefault()
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url)
  })
  // нет сети: своя страница с кнопкой «Повторить» вместо пустого окна
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return
    if (own(url) || url.startsWith(SITE)) void win.loadFile(path.join(__dirname, 'offline.html'))
  })
  win.webContents.on('did-finish-load', () => void updateBadge())
  void win.loadURL(SITE)
  win.on('closed', () => (win = null))
}

function lockDownPermissions() {
  const ses = session.fromPartition(PARTITION)
  // микрофон (голосовой собеседник), буфер обмена и полноэкранный режим нужны только своему сайту; остальное запрещено
  const ok = new Set(['media', 'clipboard-sanitized-write', 'fullscreen', 'notifications'])
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(ok.has(perm) && own(details.requestingUrl || wc.getURL())))
  ses.setPermissionCheckHandler((_wc, perm, origin) => ok.has(perm) && own(origin))
}

function buildMenu() {
  const reload = () => (win ? (own(win.webContents.getURL()) ? win.webContents.reload() : win.loadURL(SITE)) : undefined)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'Вид',
        submenu: [
          { label: 'Обновить', accelerator: 'CmdOrCtrl+R', click: reload },
          { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
          { role: 'zoomOut' },
          { role: 'resetZoom' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
          { type: 'separator' },
          { role: 'toggleDevTools', label: 'Инструменты разработчика' },
        ],
      },
      { role: 'windowMenu' },
    ]),
  )
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return createWindow()
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'system'
    lockDownPermissions()
    buildMenu()
    ipcMain.on('retry', () => win?.loadURL(SITE))
    // микрофон: запрос macOS один раз при первом запуске (описание в Info.plist)
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') void systemPreferences.askForMediaAccess('microphone')
    createWindow()
    badgeTimer = setInterval(() => void updateBadge(), BADGE_EVERY_MS)
    app.on('activate', () => {
      if (!win) createWindow()
    })
  })
  app.on('window-all-closed', () => {
    clearInterval(badgeTimer)
    app.quit()
  })
}
