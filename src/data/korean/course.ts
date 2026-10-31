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

/** Адрес видеоурока по подписи карточки («Урок 5», «Урок 16-1»); у карточки без урока видео нет. */
export function videoOf(l?: string): string | undefined {
  const m = /^Урок (\d+)(-\d)?$/.exec(l ?? '')
  return m ? `${VIDEO_DIR}/lesson-${m[1]!.padStart(2, '0')}${m[2] ?? ''}.mp4` : undefined
}
