export interface Site {
  name: string
  url: string
  desc: string
}
export interface SiteGroup {
  id: string
  title: string
  sites: Site[]
}

/** Подборка внешних сайтов для практики. Ссылки открываются в новой вкладке. */
export const SITE_GROUPS: SiteGroup[] = [
  {
    id: 'dict',
    title: 'Словари и переводчики',
    sites: [
      { name: 'Naver Dictionary', url: 'https://dict.naver.com', desc: 'Самый полный корейский словарь с примерами; есть русский.' },
      { name: '한국어기초사전 (Learner’s Dictionary)', url: 'https://krdict.korean.go.kr', desc: 'Словарь для изучающих от Национального института корейского языка, с переводом на русский.' },
      { name: '표준국어대사전', url: 'https://stdict.korean.go.kr', desc: 'Толковый словарь для тех, кто уже читает по-корейски: значения, примеры, происхождение слова.' },
      { name: 'Papago', url: 'https://papago.naver.com', desc: 'Переводчик от Naver, хорошо справляется с корейским и русским.' },
    ],
  },
  {
    id: 'lessons',
    title: 'Уроки и грамматика',
    sites: [
      { name: 'Talk To Me In Korean', url: 'https://www.talktomeinkorean.com', desc: 'Уроки и подкасты с нуля до продвинутого уровня, понятные объяснения.' },
      { name: 'How to Study Korean', url: 'https://www.howtostudykorean.com', desc: 'Последовательный бесплатный курс грамматики по уровням.' },
      { name: 'Учитель Ян (YouTube)', url: 'https://www.youtube.com/@koreanteacherYang', desc: 'Видеокурс, по которому идут карточки грамматики на этой платформе.' },
      { name: '세종학당 (King Sejong Institute)', url: 'https://www.sejonghakdang.org', desc: 'Государственная платформа с онлайн-курсами корейского для иностранцев.' },
      { name: 'Институт языкового образования СНУ', url: 'https://lei.snu.ac.kr', desc: 'Сайт института Сеульского национального университета, откуда учебник «서울대 한국어+».' },
    ],
  },
  {
    id: 'practice',
    title: 'Слушать и повторять',
    sites: [
      { name: 'Forvo', url: 'https://forvo.com', desc: 'Слова в произношении носителей: послушать, как звучит именно это слово.' },
      { name: 'Anki', url: 'https://apps.ankiweb.net', desc: 'Карточки с интервальным повторением, если хочется своих колод вне платформы.' },
    ],
  },
  {
    id: 'talk',
    title: 'Общение с носителями',
    sites: [
      { name: 'HelloTalk', url: 'https://www.hellotalk.com', desc: 'Языковой обмен в переписке: вы помогаете с русским, вам с корейским.' },
      { name: 'Tandem', url: 'https://tandem.net', desc: 'Ещё один языковой обмен с текстом, голосом и видео.' },
    ],
  },
  {
    id: 'exam',
    title: 'Экзамен',
    sites: [{ name: 'TOPIK', url: 'https://www.topik.go.kr', desc: 'Официальный экзамен по корейскому: расписание, формат, прошлые варианты.' }],
  },
]
