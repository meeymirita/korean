/** Видеокурс, по которому идут уроки 1–30 (канал учителя Яна). */
export const CHANNEL = 'https://www.youtube.com/@koreanteacherYang'
export const COURSE = {
  name: '양쌤의 한국어 교실',
  teacher: 'Учитель Ян',
  channel: CHANNEL,
  telegram: 'https://t.me/koreanteacheryang',
  instagram: 'https://www.instagram.com/kr_teacher_yang',
}

/** Видео лежат на сервере вне репозитория (Caddy отдаёт `/video/…`), файл на урок: `lesson-05.mp4`, `lesson-16-1.mp4`. */
export const VIDEO_DIR = '/video'

/** Адрес видеоурока по подписи карточки: «Урок 5», «Урок 16-1» (часть 1, `lesson-05.mp4`) или «Часть 2 · Урок 5» (`part2-05.mp4`); у карточки без урока видео нет. */
export function videoOf(l?: string): string | undefined {
  const m = /^(?:Часть (2) · )?Урок (\d+)(-\d)?$/.exec(l ?? '')
  if (!m) return undefined
  return `${VIDEO_DIR}/${m[1] ? 'part2' : 'lesson'}-${m[2]!.padStart(2, '0')}${m[3] ?? ''}.mp4`
}
