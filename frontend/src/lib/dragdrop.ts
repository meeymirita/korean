import { gsap } from 'gsap'
import { nextTick } from 'vue'

/**
 * Перетаскивание плитки в цель (пропуск, строку ответа) на GSAP Draggable: один помощник для игры на чистом DOM и для экранов Vue.
 * Мышь, палец и перо идут одним путём (pointer-события), прокрутку страницы на время перетаскивания Draggable блокирует сам.
 * Обычное нажатие на плитку остаётся нажатием: Draggable пропускает его и гасит «лишний» click только после настоящего перетаскивания.
 * Плагин грузится лениво и только в браузере (код страниц выполняется и на сервере).
 */
type DraggableClass = typeof import('gsap/Draggable').Draggable
type DraggableItem = InstanceType<DraggableClass>

let plugin: Promise<DraggableClass> | null = null
const load = () =>
  (plugin ??= import('gsap/Draggable').then(m => {
    gsap.registerPlugin(m.Draggable)
    return m.Draggable
  }))

export interface DragDropOptions {
  /** Плитки, которые можно тянуть. */
  tiles: ArrayLike<Element>
  /** Цели на этот момент (пропуски могут блокироваться и появляться по ходу задания). */
  targets: () => ArrayLike<Element>
  /** Плитку отпустили над целью; `x`, `y` это точка отпускания в координатах окна. */
  onDrop: (tile: HTMLElement, target: HTMLElement, x: number, y: number) => void
  /** Класс цели, над которой сейчас плитка (по умолчанию `drop-over`). */
  overClass?: string
  /** Класс плитки, пока её тянут (по умолчанию `dragging`). */
  dragClass?: string
  /** Селектор «ручки» внутри плитки: тянуть можно только за неё (остальная плитка прокручивается и нажимается как обычно). Нет ручки в плитке: плитка не тянется. */
  handle?: string
  /** Перетаскивание закончилось (над целью или нет): так экран может не принять отпускание кнопки за нажатие на плитку. */
  onEnd?: () => void
  /** `false`: плитка после бросания остаётся там, где её отпустили, и её возвращает сам вызывающий (например, плавной перестановкой). По умолчанию `true`. */
  resetOnDrop?: boolean
}

/** Насколько точка может не дотянуть до цели, чтобы всё равно считаться попаданием (пальцем и пером трудно попасть в узкий пропуск). */
const PAD = 14

/** Цель под точкой: сначала та, в чей прямоугольник (с запасом) попала точка, иначе та, с которой плитка пересеклась сильнее всего. */
export function targetAt(targets: ArrayLike<Element>, x: number, y: number, tile?: DOMRect): HTMLElement | null {
  const list = Array.from(targets).filter((t): t is HTMLElement => t instanceof HTMLElement)
  let best: HTMLElement | null = null
  let bestDist = Infinity
  for (const t of list) {
    const r = t.getBoundingClientRect()
    if (x < r.left - PAD || x > r.right + PAD || y < r.top - PAD || y > r.bottom + PAD) continue
    const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
    if (d < bestDist) {
      best = t
      bestDist = d
    }
  }
  if (best || !tile) return best
  let bestArea = 0
  for (const t of list) {
    const r = t.getBoundingClientRect()
    const w = Math.min(r.right, tile.right) - Math.max(r.left, tile.left)
    const h = Math.min(r.bottom, tile.bottom) - Math.max(r.top, tile.top)
    const area = w > 0 && h > 0 ? w * h : 0
    // пересечение засчитывается, если накрыта хотя бы треть цели или плитки
    if (area > bestArea && area >= Math.min(r.width * r.height, tile.width * tile.height) / 3) {
      best = t
      bestArea = area
    }
  }
  return best
}

/** Включает перетаскивание; возвращает функцию, которая его выключает (вызвать перед сменой задания). */
export function dragDrop(o: DragDropOptions): () => void {
  if (typeof window === 'undefined') return () => {}
  const overClass = o.overClass ?? 'drop-over'
  const dragClass = o.dragClass ?? 'dragging'
  let items: DraggableItem[] = []
  let dead = false
  let over: HTMLElement | null = null
  const setOver = (t: HTMLElement | null) => {
    if (over === t) return
    over?.classList.remove(overClass)
    over = t
    over?.classList.add(overClass)
  }
  const point = (d: DraggableItem) => ({ x: d.pointerX - window.scrollX, y: d.pointerY - window.scrollY })
  const find = (d: DraggableItem) => {
    const p = point(d)
    // саму тянутую плитку целью не считаем: она едет под точкой и всегда «выигрывала» бы у соседних
    const targets = Array.from(o.targets()).filter(t => t !== d.target)
    return targetAt(targets, p.x, p.y, (d.target as HTMLElement).getBoundingClientRect())
  }

  load().then(Draggable => {
    if (dead) return
    const config = {
      type: 'x,y' as const,
      zIndexBoost: true,
      minimumMovement: 6,
      onDragStart(this: DraggableItem) {
        ;(this.target as HTMLElement).classList.add(dragClass)
      },
      onDrag(this: DraggableItem) {
        setOver(find(this))
      },
      onDragEnd(this: DraggableItem) {
        const tile = this.target as HTMLElement
        const target = find(this)
        const p = point(this)
        setOver(null)
        tile.classList.remove(dragClass)
        o.onEnd?.()
        if (target) {
          // плитка сразу на своём месте в банке: ответ показывает сама цель
          if (o.resetOnDrop !== false) gsap.set(tile, { x: 0, y: 0, clearProps: 'transform' })
          o.onDrop(tile, target, p.x, p.y)
        } else {
          gsap.to(tile, { x: 0, y: 0, duration: 0.28, ease: 'back.out(1.6)', clearProps: 'transform' })
        }
      },
    }
    const tiles = Array.from(o.tiles)
    items = o.handle
      ? tiles.flatMap(t => {
          const trigger = t.querySelector(o.handle!)
          return trigger ? Draggable.create(t, { ...config, trigger }) : []
        })
      : Draggable.create(tiles, config)
    // без перетаскивания всё по-прежнему работает нажатием: ошибку плагина (старый браузер, тестовая среда) не показываем
  }).catch(() => {})

  return () => {
    dead = true
    setOver(null)
    items.forEach(d => d.kill())
    items = []
  }
}

export interface EdgeDragOptions {
  /** Ручка (край окна), за которую тянут. Ей нужен `touch-action: none`, иначе на iPad перо «срывается». */
  handle: HTMLElement
  /** Ручку нажали: вызывающий запоминает исходный размер. */
  onStart?: () => void
  /** Ручку тянут: `dx` это сдвиг по горизонтали от места нажатия (влево отрицательный). */
  onMove: (dx: number) => void
  /** Ручку отпустили. */
  onEnd?: () => void
}

/**
 * Перетаскивание края окна (растягивание) на GSAP Draggable. Двигается невидимая «заместительная» заготовка, а сама ручка стоит на месте:
 * размер меняет вызывающий в `onMove`. Возвращает функцию, которая всё убирает (вызвать при закрытии окна).
 */
export function dragEdge(o: EdgeDragOptions): () => void {
  if (typeof window === 'undefined') return () => {}
  let dead = false
  let stop = () => {}
  void load().then(Draggable => {
    if (dead) return
    const proxy = document.createElement('div')
    proxy.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none'
    document.body.appendChild(proxy)
    const [d] = Draggable.create(proxy, {
      type: 'x',
      trigger: o.handle,
      zIndexBoost: false,
      onPress() {
        gsap.set(proxy, { x: 0 })
        this.update()
        o.onStart?.()
      },
      onDrag() {
        o.onMove(this.x)
      },
      onRelease() {
        o.onEnd?.()
      },
    })
    stop = () => {
      d?.kill()
      proxy.remove()
    }
  })
  return () => {
    dead = true
    stop()
  }
}

export interface DragSortOptions {
  /** Плитки (корешки), которые можно переставлять. */
  items: ArrayLike<Element>
  /** Место плитки на полке: оно стоит на месте, пока плитку тянут, и по нему считается «куда вставить». По умолчанию сама плитка. */
  slot?: (tile: HTMLElement) => HTMLElement
  /** Имя плитки для `onMove`. */
  idOf: (tile: HTMLElement) => string
  /** Тянутая плитка `id` встала до (`after: false`) или после (`true`) соседа `overId`: вызывающий переставляет свой список, помощник ждёт обновления DOM. */
  onMove: (id: string, overId: string, after: boolean) => void
  /** Перестановка закончилась. */
  onEnd?: () => void
  /** Класс плитки, пока её тянут (по умолчанию `dragging`). */
  dragClass?: string
}

/**
 * Перестановка плиток внутри ряда на GSAP Draggable. Плитка едет под рукой, соседи плавно (FLIP) раздвигаются, при отпускании плитка мягко встаёт на своё место.
 * Порядок меняет вызывающий (`onMove`), а плитку после смены места в DOM помощник возвращает под руку.
 */
export function dragSort(o: DragSortOptions): () => void {
  if (typeof window === 'undefined') return () => {}
  const dragClass = o.dragClass ?? 'dragging'
  const slotOf = o.slot ?? ((t: HTMLElement) => t)
  let items: DraggableItem[] = []
  let dead = false
  let busy = false
  load().then(Draggable => {
    if (dead) return
    const tiles = Array.from(o.items).filter((t): t is HTMLElement => t instanceof HTMLElement)
    items = Draggable.create(tiles, {
      type: 'x,y' as const,
      zIndexBoost: true,
      minimumMovement: 6,
      onDragStart(this: DraggableItem) {
        ;(this.target as HTMLElement).classList.add(dragClass)
      },
      onDrag(this: DraggableItem) {
        if (busy) return
        const tile = this.target as HTMLElement
        const x = this.pointerX - window.scrollX
        const y = this.pointerY - window.scrollY
        const own = slotOf(tile).getBoundingClientRect()
        // пока рука над своим местом, порядок не меняем
        if (x > own.left && x < own.right && y > own.top - 30 && y < own.bottom) return
        let best: HTMLElement | null = null
        let bestDist = 120
        let after = false
        for (const t of tiles) {
          if (t === tile) continue
          const r = slotOf(t).getBoundingClientRect()
          const cx = r.left + r.width / 2
          const d = Math.hypot(x - cx, (y - (r.top + r.height / 2)) * 1.4)
          if (d < bestDist) {
            best = t
            bestDist = d
            after = x > cx
          }
        }
        if (!best) return
        busy = true
        const sync = () => this.update()
        const before = tile.getBoundingClientRect()
        const first = tiles.filter(t => t !== tile).map(t => [slotOf(t), slotOf(t).getBoundingClientRect()] as const)
        o.onMove(o.idOf(tile), o.idOf(best), after)
        void nextTick().then(() => {
          const now = tile.getBoundingClientRect()
          gsap.set(tile, { x: `+=${before.left - now.left}`, y: `+=${before.top - now.top}` })
          sync()
          for (const [el, r] of first) {
            const n = el.getBoundingClientRect()
            const dx = r.left - n.left
            const dy = r.top - n.top
            if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.3,1)' })
          }
          busy = false
        })
      },
      onDragEnd(this: DraggableItem) {
        const tile = this.target as HTMLElement
        tile.classList.remove(dragClass)
        gsap.to(tile, { x: 0, y: 0, duration: 0.28, ease: 'back.out(1.6)', clearProps: 'transform' })
        o.onEnd?.()
      },
    })
  }).catch(() => {})
  return () => {
    dead = true
    items.forEach(d => d.kill())
    items = []
  }
}

export interface DragPointerOptions {
  /** Область, за которую тянут (разворот книги). Нужен `touch-action: none`. Кнопки внутри остаются нажимаемыми и перетаскивание не начинают. */
  trigger: HTMLElement
  /** Нажали: `x`, `y` в координатах окна. */
  onPress?: (x: number, y: number) => void
  /** Движение началось (после небольшого сдвига). */
  onStart?: (x: number, y: number) => void
  /** Рука движется. */
  onMove: (x: number, y: number) => void
  /** Отпустили; `vx` и `vy` это скорость руки в пикселях за миллисекунду, `moved` была ли настоящая протяжка. */
  onEnd?: (x: number, y: number, vx: number, vy: number, moved: boolean) => void
}

/** Положение руки (мыши, пальца, пера) во время перетаскивания области, со скоростью при отпускании: для листания книги за угол. Тот же GSAP Draggable, двигается невидимая заготовка. */
export function dragPointer(o: DragPointerOptions): () => void {
  if (typeof window === 'undefined') return () => {}
  let dead = false
  let stop = () => {}
  void load().then(Draggable => {
    if (dead) return
    const proxy = document.createElement('div')
    proxy.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none'
    document.body.appendChild(proxy)
    let last = { x: 0, y: 0, t: 0 }
    let v = { x: 0, y: 0 }
    let moved = false
    const at = (d: DraggableItem) => ({ x: d.pointerX - window.scrollX, y: d.pointerY - window.scrollY })
    const [d] = Draggable.create(proxy, {
      type: 'x,y',
      trigger: o.trigger,
      zIndexBoost: false,
      minimumMovement: 6,
      dragClickables: false,
      onPress(this: DraggableItem) {
        gsap.set(proxy, { x: 0, y: 0 })
        this.update()
        moved = false
        v = { x: 0, y: 0 }
        const p = at(this)
        last = { ...p, t: performance.now() }
        o.onPress?.(p.x, p.y)
      },
      onDragStart(this: DraggableItem) {
        moved = true
        const p = at(this)
        o.onStart?.(p.x, p.y)
      },
      onDrag(this: DraggableItem) {
        const p = at(this)
        const now = performance.now()
        const dt = Math.max(1, now - last.t)
        v = { x: (p.x - last.x) / dt, y: (p.y - last.y) / dt }
        last = { ...p, t: now }
        o.onMove(p.x, p.y)
      },
      onRelease(this: DraggableItem) {
        const p = at(this)
        o.onEnd?.(p.x, p.y, v.x, v.y, moved)
      },
    })
    stop = () => {
      d?.kill()
      proxy.remove()
    }
  })
  return () => {
    dead = true
    stop()
  }
}
