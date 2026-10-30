import { ref } from 'vue'

/** Событие браузера «можно установить как приложение» (Chrome, Edge); в Safari его нет, там установка из меню. */
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let saved: InstallEvent | null = null
/** true, пока браузер готов показать окно установки. */
export const canInstall = ref(false)
/** Сайт уже открыт как установленное приложение. */
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** Регистрирует сервис-воркер (только в собранном сайте) и ловит событие установки. */
export function initPwa() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    saved = e as InstallEvent
    canInstall.value = true
  })
  window.addEventListener('appinstalled', () => {
    saved = null
    canInstall.value = false
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
  }
}

/** Показывает окно установки браузера; true, если установили. */
export async function installApp(): Promise<boolean> {
  if (!saved) return false
  await saved.prompt()
  const { outcome } = await saved.userChoice
  saved = null
  canInstall.value = false
  return outcome === 'accepted'
}
