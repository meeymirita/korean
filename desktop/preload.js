// Единственное, что страница «нет сети» может попросить у оболочки: повторить загрузку сайта.
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('urimal', { retry: () => ipcRenderer.send('retry') })
