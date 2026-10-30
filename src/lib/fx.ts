import { gsap } from 'gsap'

/** Анимации тренажёров. Если в системе включено «уменьшить движение», всё происходит сразу, без анимации. */
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Карточки выезжают каскадом. */
export function cascade(els: ArrayLike<Element>) {
  if (calm() || !els.length) return
  gsap.from(els, { opacity: 0, y: 14, scale: 0.97, duration: 0.38, stagger: 0.04, ease: 'power2.out', clearProps: 'opacity,transform' })
}

/** Верный ответ: карточка «вскакивает». */
export function pop(el: Element | null | undefined) {
  if (calm() || !el) return
  gsap.fromTo(el, { scale: 1 }, { scale: 1.07, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'transform' })
}

/** Неверный ответ: карточка вздрагивает. */
export function shake(el: Element | null | undefined) {
  if (calm() || !el) return
  gsap.fromTo(el, { x: 0 }, { x: 0, duration: 0.4, ease: 'none', keyframes: { x: [0, -7, 7, -5, 5, -2, 0] }, clearProps: 'transform' })
}

/** Линия «рисуется» от начала к концу. */
export function drawLine(path: SVGPathElement | null | undefined, then?: () => void) {
  if (!path) return then?.()
  if (calm()) return void setTimeout(() => then?.(), 400)
  const len = path.getTotalLength()
  gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len, opacity: 1 }, { strokeDashoffset: 0, duration: 0.25, ease: 'power1.out' })
  gsap.to(path, { opacity: 0, duration: 0.3, delay: 0.35, ease: 'power1.in', onComplete: then })
}

const SPARKS = ['🌸', '✨', '⭐', '💮', '🌷']

/** Всплеск звёзд и лепестков из точки экрана (конец раунда). */
export function burst(x: number, y: number, count = 18) {
  if (calm()) return
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span')
    s.textContent = SPARKS[i % SPARKS.length]!
    s.setAttribute('aria-hidden', 'true')
    s.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:400;pointer-events:none;font-size:${14 + Math.random() * 14}px;will-change:transform`
    document.body.append(s)
    const a = Math.random() * Math.PI * 2
    const d = 70 + Math.random() * 130
    gsap.to(s, {
      x: Math.cos(a) * d,
      y: Math.sin(a) * d - 40,
      rotation: (Math.random() - 0.5) * 240,
      opacity: 0,
      duration: 0.9 + Math.random() * 0.5,
      ease: 'power2.out',
      onComplete: () => s.remove(),
    })
  }
}
