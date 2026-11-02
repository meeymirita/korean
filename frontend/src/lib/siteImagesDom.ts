import { watch } from 'vue'
import type { Pinia } from 'pinia'
import { NEUTRAL, isNeutral, placementStyle } from '@/lib/siteImages'
import { siteImageKey } from '@/lib/siteImages'
import { useSiteImagesStore } from '@/stores/siteImages'

/**
 * Подмена картинок на странице. Следит за всеми <img> сайта: у картинок из `src/assets` ставит ключ (`data-si-key`),
 * а если владелец картинку заменил или подвинул, показывает новую (`data-si-orig` помнит исходный адрес).
 * Картинки со своим слоем (`data-si-own`, фон блоков главной) рисуются сами и сюда не подменяются.
 */
export function initSiteImages(pinia: Pinia) {
  const store = useSiteImagesStore(pinia)

  function apply(img: HTMLImageElement) {
    if (img.dataset.siOwn !== undefined || img.closest('[data-si-skip]')) return
    const cur = img.getAttribute('src') ?? ''
    // адрес сменился не нами (например, Vue подставил другую картинку): запоминаем его как исходный
    if (cur !== img.dataset.siSet) {
      img.dataset.siOrig = cur
      const key = siteImageKey(cur, location.href)
      if (key) img.dataset.siKey = key
      else delete img.dataset.siKey
      delete img.dataset.siSet
    }
    const key = img.dataset.siKey
    if (!key) return
    const o = store.effective(key)
    const want = o?.src ? o.src : (img.dataset.siOrig ?? cur)
    if (cur !== want) img.setAttribute('src', want)
    if (o?.src) img.dataset.siSet = o.src
    else delete img.dataset.siSet
    const place = o ?? { ...NEUTRAL }
    if (!isNeutral(place) || img.dataset.siPos) {
      const st = placementStyle(key, place)
      img.style.objectPosition = st.objectPosition!
      img.style.transform = st.transform!
      img.style.transformOrigin = st.transformOrigin!
      if (isNeutral(place)) delete img.dataset.siPos
      else img.dataset.siPos = '1'
    }
  }

  let queued = false
  function scan() {
    queued = false
    document.querySelectorAll('img').forEach(apply)
  }
  const schedule = () => {
    if (!queued) {
      queued = true
      requestAnimationFrame(scan)
    }
  }

  new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] })
  watch(() => [store.items, store.draft], schedule, { deep: true })
  scan()
}
