import { gsap } from 'gsap'
import { stillCss } from '@/lib/fx'

/**
 * Анимации всего сайта на GSAP (только в браузере; запускает `plugins/motion.client.ts`).
 * Правила: ничего не должно остаться невидимым или сдвинутым (после анимации `clearProps`), всё выключается,
 * если в системе включено «уменьшить движение», и ни одна анимация не ждёт: страница с первой секунды рабочая.
 * Свои пробные настройки двигай здесь: селекторы и числа вынесены в константы.
 */
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
export const motionCalm = calm

/** Карточки и ряды, которые выезжают, когда доходят до экрана. */
export const REVEAL = [
  '.gc', '.gh-card', '.shx-card', '.tw-flip', '.nt-card', '.im-card', '.cl-card', '.pc-card', '.bd-card', '.shp-item', '.pg-card', '.ov-card',
  '.wk-stat', '.pg-recc', '.td-set', '.rs-item', '.sb', '.gh-block', '.word', '.task', '.md-b',
].join(',')

/** Блоки, которые не анимируем: фиксированные окна, меню и всё, что уже управляется своим Transition. */
const SKIP = '[data-no-motion], .tst, .stm, .cf, .sw, .dr, .study-side, .study-shell > aside, dialog'

/** Ключ «уже показан»: нужен, чтобы карточка не выезжала дважды (например, при перерисовке списка). */
const SHOWN = 'data-m'

/** Страница появилась: её блоки мягко выезжают друг за другом. */
export function enterPage(root: ParentNode = document) {
  if (calm()) return
  // страницы раздела: блоки внутри .wrap; главная: рамка, заметки и подвал
  const found = root.querySelectorAll<HTMLElement>('.wrap > *')
  const blocks = [...(found.length ? found : root.querySelectorAll<HTMLElement>('.home .nav, .home .stage > *, .home .note, .home .footer'))].filter(el => !el.matches(SKIP) && !el.closest('[data-no-motion]') && getComputedStyle(el).position !== 'fixed').slice(0, 14)
  if (!blocks.length) return
  blocks.forEach(el => el.setAttribute(SHOWN, '1'))
  const back = stillCss(blocks)
  gsap.from(blocks, { opacity: 0, y: 18, duration: 0.55, stagger: 0.06, ease: 'power3.out', clearProps: 'opacity,transform', overwrite: 'auto', onComplete: back })
}

/** Вкладка поменялась внутри страницы (кабинет, каталог игр): содержимое мягко появляется заново. */
export function swapTab(root: ParentNode = document) {
  if (calm()) return
  const el = root.querySelector<HTMLElement>('.cb-body, .gh-panel')
  if (el) gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', clearProps: 'opacity,transform', overwrite: 'auto' })
}

/** Левое меню раздела при первом открытии: пункты по очереди. */
export function enterMenu(root: ParentNode = document) {
  if (calm()) return
  const links = root.querySelectorAll('.study-links a, .gh-groups .gh-grp')
  if (links.length) gsap.from(links, { opacity: 0, x: -14, duration: 0.45, stagger: 0.035, ease: 'power2.out', clearProps: 'opacity,transform' })
}

/* ---------- появление карточек при прокрутке ---------- */
let io: IntersectionObserver | undefined
/** Карточки, которые ждут прокрутки: у них на это время выключены собственные CSS-переходы (вернёт `back`). */
const waiting = new WeakMap<HTMLElement, () => void>()
function reveal(el: HTMLElement) {
  const back = waiting.get(el) ?? (() => {})
  waiting.delete(el)
  gsap.fromTo(el, { opacity: 0, y: 26, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out', clearProps: 'opacity,transform', onComplete: back })
}
function watch(el: HTMLElement) {
  if (calm() || el.hasAttribute(SHOWN) || el.matches(SKIP) || el.closest(SKIP)) return
  el.setAttribute(SHOWN, '1')
  const r = el.getBoundingClientRect()
  // карточки в пределах первого экрана и выше просто остаются на месте (их показывает enterPage), ниже экрана ждут прокрутки
  if (r.top < innerHeight * 0.95) return
  waiting.set(el, stillCss([el]))
  gsap.set(el, { opacity: 0, y: 26 })
  io ??= new IntersectionObserver(
    entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        io!.unobserve(e.target)
        reveal(e.target as HTMLElement)
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.05 },
  )
  io.observe(el)
}

/* ---------- окна: плавное появление ---------- */
/** Окна, у которых уже есть свой Transition (подтверждение, поиск, шторка, плашки), не трогаем. */
const OWN_TRANSITION = '.cf-box, .sw-box, .dr .box, .pv-back'
function pop(dialog: HTMLElement) {
  if (calm() || dialog.hasAttribute(SHOWN) || dialog.matches(OWN_TRANSITION)) return
  dialog.setAttribute(SHOWN, '1')
  const back = dialog.parentElement && dialog.parentElement !== document.body ? dialog.parentElement : null
  const restore = stillCss([dialog])
  if (back) gsap.fromTo(back, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power1.out', clearProps: 'opacity' })
  gsap.fromTo(dialog, { opacity: 0, y: 26, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.5)', clearProps: 'opacity,transform', onComplete: restore })
}
/** Само окно как картинка (просмотр фото): картинка вылетает из центра. */
function popImage(back: HTMLElement) {
  const img = back.querySelector<HTMLElement>('.pv-img')
  if (calm() || back.hasAttribute(SHOWN) || !img) return
  back.setAttribute(SHOWN, '1')
  gsap.fromTo(back, { opacity: 0 }, { opacity: 1, duration: 0.2, clearProps: 'opacity' })
  gsap.fromTo(img, { scale: 0.86, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(1.4)', clearProps: 'opacity,transform' })
}

/* ---------- числа: плавно «досчитывают» до нового значения ---------- */
/** Меняет текст узла (тот же узел, что держит Vue: его собственные обновления потом работают как обычно). */
export function countTo(node: Text, to: number, from = 0) {
  if (calm() || !Number.isFinite(to) || !Number.isFinite(from) || from === to) {
    node.nodeValue = String(to)
    return
  }
  const o = { v: from }
  gsap.to(o, {
    v: to,
    duration: Math.min(2.8, 1 + Math.abs(to - from) / 20),
    ease: 'power2.out',
    snap: { v: 1 },
    onUpdate: () => (node.nodeValue = String(o.v)),
    onComplete: () => (node.nodeValue = String(to)),
    overwrite: true,
  })
}

/* ---------- кнопки: упругое нажатие ---------- */
/** Только то, что не перетаскивают: у перетаскиваемых карточек (`.opt`, `.wc-btn`) свои пружинки из `lib/fx.ts`. */
const PRESS = 'button.primary, button.ghost, .chip, .gh-card, .gc, .shx-card, .gh-tab, .gpart, .pg-lvl-btn, .btn-main, .qk-home'
function onPress(e: PointerEvent) {
  if (e.button !== 0) return
  const el = (e.target as Element | null)?.closest<HTMLElement>(PRESS)
  if (!el || el.matches('[disabled], [aria-disabled="true"]')) return
  const back = stillCss([el])
  gsap.to(el, { scale: 0.96, duration: 0.12, ease: 'power2.out', overwrite: 'auto' })
  const up = () => {
    gsap.to(el, { scale: 1, duration: 0.45, ease: 'elastic.out(1, 0.55)', clearProps: 'transform', overwrite: 'auto', onComplete: back })
    removeEventListener('pointerup', up)
    removeEventListener('pointercancel', up)
  }
  addEventListener('pointerup', up)
  addEventListener('pointercancel', up)
}

/** Подключает всё сразу; возвращает функцию, которая всё снимает. Вызывать один раз при старте в браузере. */
export function initMotion(): () => void {
  if (calm()) return () => {}
  document.documentElement.classList.add('motion')

  const scan = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>(REVEAL).forEach(watch)
    root.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]').forEach(pop)
    root.querySelectorAll<HTMLElement>('.pv-back').forEach(popImage)
  }
  scan(document)
  const mo = new MutationObserver(list => {
    for (const m of list) {
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return
        const el = n as HTMLElement
        if (el.matches(REVEAL)) watch(el)
        if (el.matches('[role="dialog"], [role="alertdialog"]')) pop(el)
        if (el.matches('.pv-back')) popImage(el)
        scan(el)
      })
    }
  })
  mo.observe(document.body, { childList: true, subtree: true })
  addEventListener('pointerdown', onPress, { passive: true })

  return () => {
    mo.disconnect()
    io?.disconnect()
    io = undefined
    removeEventListener('pointerdown', onPress)
    document.documentElement.classList.remove('motion')
  }
}
