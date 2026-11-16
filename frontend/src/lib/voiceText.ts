export interface VoicePiece {
  text: string
  /** Корейская фраза (её показываем крупно, по нажатию разбираем). */
  ko: boolean
}

/** Реплика собеседника по кускам: корейские фразы (хангыль с пробелами и знаками между словами) отдельно от русского текста. */
export function splitKorean(text: string): VoicePiece[] {
  const out: VoicePiece[] = []
  for (const [i, part] of text.split(/([가-힣]+(?:[ ,]+[가-힣]+)*[.?!~]?)/).entries()) {
    if (part) out.push({ text: part, ko: i % 2 === 1 })
  }
  return out
}

/** Корейская часть реплики без конечного знака: именно её разбирает «Как собрано». */
export const koreanOnly = (t: string) => t.replace(/[.?!~]+$/, '').trim()

/** Ширина окна голоса при растягивании: не уже 340 px и не шире окна браузера (с полями по 12 px). */
export const clampPanelWidth = (w: number, viewport: number, min = 340) => Math.round(Math.max(Math.min(min, viewport - 24), Math.min(w, viewport - 24)))
