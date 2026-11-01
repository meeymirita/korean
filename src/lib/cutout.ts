/**
 * Удаление фона у картинки, где «прозрачность» нарисована: белый фон или шахматка из белых и светло-серых клеток
 * (так выглядят картинки из генераторов, сохранённые с превью). Работает на пикселях RGBA и делает фон прозрачным:
 * 1) светлые почти бесцветные пиксели, связанные с краем картинки, это фон;
 * 2) замкнутые мелкие островки шахматки (между прядями волос) тоже фон, а белая заливка внутри рисунка (мех кота) остаётся;
 * 3) светлая кайма у контура съедается на 1 пиксель, граница слегка смягчается.
 * Возвращает долю пикселей, ставших прозрачными (0–1).
 */
export function cutoutBackground(px: Uint8ClampedArray, w: number, h: number): number {
  const n = w * h
  const cand = new Uint8Array(n)
  const mnA = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const r = px[i * 4]!, g = px[i * 4 + 1]!, b = px[i * 4 + 2]!, a = px[i * 4 + 3]!
    const mn = Math.min(r, g, b), mx = Math.max(r, g, b)
    mnA[i] = mn
    if (a > 0 && mn >= 236 && mx - mn <= 9) cand[i] = 1
  }
  const isBg = new Uint8Array(n)
  const seen = new Uint8Array(n)
  const stack = new Int32Array(n)
  const comp: number[] = []
  for (let s = 0; s < n; s++) {
    if (!cand[s] || seen[s]) continue
    let top = 0, size = 0, mid = 0, hi = 0, edge = false
    comp.length = 0
    stack[top++] = s
    seen[s] = 1
    while (top) {
      const i = stack[--top]!
      comp.push(i)
      size++
      const v = mnA[i]!
      if (v <= 249) mid++
      else if (v >= 252) hi++
      const x = i % w, y = (i - x) / w
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true
      if (x > 0 && cand[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1 }
      if (x < w - 1 && cand[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1 }
      if (y > 0 && cand[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w }
      if (y < h - 1 && cand[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w }
    }
    if (edge || (size <= 2500 && mid / size > 0.3 && hi / size > 0.3)) for (const i of comp) isBg[i] = 1
  }
  // съедаем светлую кайму вокруг фона на 1 пиксель
  const grow = new Uint8Array(isBg)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (isBg[i]) continue
      const r = px[i * 4]!, g = px[i * 4 + 1]!, b = px[i * 4 + 2]!
      if (mnA[i]! < 225 || Math.max(r, g, b) - mnA[i]! > 14) continue
      if ((x > 0 && isBg[i - 1]) || (x < w - 1 && isBg[i + 1]) || (y > 0 && isBg[i - w]) || (y < h - 1 && isBg[i + w])) grow[i] = 1
    }
  }
  let removed = 0
  for (let i = 0; i < n; i++) {
    if (grow[i]) {
      px[i * 4 + 3] = 0
      removed++
    }
  }
  // граница чуть мягче: светлые пиксели рядом с вырезанным становятся полупрозрачными
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (grow[i] || mnA[i]! < 205) continue
      if ((x > 0 && grow[i - 1]) || (x < w - 1 && grow[i + 1]) || (y > 0 && grow[i - w]) || (y < h - 1 && grow[i + w])) px[i * 4 + 3] = Math.min(px[i * 4 + 3]!, 170)
    }
  }
  return removed / n
}
