import { gsap } from 'gsap'

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
    return targetAt(o.targets(), p.x, p.y, (d.target as HTMLElement).getBoundingClientRect())
  }

  load().then(Draggable => {
    if (dead) return
    items = Draggable.create(Array.from(o.tiles), {
      type: 'x,y',
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
        if (target) {
          // плитка сразу на своём месте в банке: ответ показывает сама цель
          gsap.set(tile, { x: 0, y: 0, clearProps: 'transform' })
          o.onDrop(tile, target, p.x, p.y)
        } else {
          gsap.to(tile, { x: 0, y: 0, duration: 0.28, ease: 'back.out(1.6)', clearProps: 'transform' })
        }
      },
    })
    // без перетаскивания всё по-прежнему работает нажатием: ошибку плагина (старый браузер, тестовая среда) не показываем
  }).catch(() => {})

  return () => {
    dead = true
    setOver(null)
    items.forEach(d => d.kill())
    items = []
  }
}
