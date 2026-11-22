/** Темы влогов для фильтра под вкладками авторов «Влога»: у каждого видео (по номеру `yt`) ровно одна тема. Новый влог без темы тест не пропустит. */
export const VLOG_TOPICS = [
  { id: 'shop', label: 'Магазины и дела' },
  { id: 'food', label: 'Еда и кафе' },
  { id: 'walk', label: 'Прогулки и город' },
  { id: 'trip', label: 'Поездки' },
  { id: 'daily', label: 'Быт и день' },
  { id: 'season', label: 'Праздники и сезоны' },
  { id: 'talk', label: 'Знакомство и слова' },
] as const

export type VlogTopic = (typeof VLOG_TOPICS)[number]['id']

export const VLOG_TOPIC: Record<string, VlogTopic> = {
  // Jaerim
  OEyKAUhc6gU: 'walk', vc3hGLgyXL4: 'trip', ufDM439eOqU: 'walk', hBGbIvyU5G4: 'daily', ZNSUgWjytUw: 'shop', LWGNKfztgcI: 'daily',
  SEywQdBW8W4: 'walk', 'pzqtJI-FxJg': 'season', ddDyB0MGxJs: 'daily', OS8rnqXM2KI: 'shop', 'IGEj-oDKyw8': 'shop', gwo2Bwc3_V0: 'daily',
  l2EmMNRa5Y0: 'shop', Szv3gPqohbg: 'shop', 'EU-bWknoYc8': 'trip', ewL6SaZzjyU: 'shop', BWINkN8QbkU: 'daily', '9lOJxJBRj1I': 'food',
  eXgzit1jiwI: 'walk', Xhm37Rybhv0: 'trip', dsg4N8AvEZ4: 'daily', Q7_UmOUi1XE: 'season', '79Pwq7MTUPE': 'daily', r2lXjL7l4xI: 'season',
  dpzJkC7hptY: 'walk', rNclAN43VQ0: 'food', paToZla2CK8: 'shop', Gy_nMwa51nY: 'shop', 'XknpI48lT-g': 'daily', 'z-R0eTXKtpo': 'food',
  // Dora
  Jex4XTA3BDg: 'talk', W7ErKzubTjY: 'daily', '7T3l2syFC_s': 'walk', uPKRQhaYeMg: 'season', ENLlmkwv6jk: 'walk', P1WgK4TxJYE: 'shop',
  MFgVfcqBkJ0: 'shop', '8u47xrx3Ffw': 'trip', QJanmo9TXc8: 'walk', '4qXLtgcswWY': 'daily', cIAydgtc7zE: 'shop', wtIzSP2fDOk: 'daily',
  // Ria Korea
  qlMmOiQPLsc: 'walk', NGPw_UD_D9U: 'talk', EpGocbJZ3jc: 'shop', '9W4jYPAn1GY': 'season', FY9_RtFt84U: 'daily', 'o-X_6t45Sic': 'shop', Oh8fiYihNhM: 'season',
  // ChoiSusu
  '29mdX4IG7YI': 'daily', _kPYR0gBstk: 'daily', '932sf30NQzE': 'daily', R2WQ6wQCr1Y: 'walk', B1NfSUKXaTs: 'shop', qoidYvlCiPM: 'trip',
  'MNsHXC_-HVA': 'daily', wquDm0eqMMU: 'shop', ZzcszvIgT_8: 'food', '6y6YoL-TjYQ': 'food', '3GYl0X6tk2M': 'food', '23C9rdaLOCc': 'season', BnTS2DOdMSY: 'daily',
  // Соня (уроки на русском: списки слов)
  '320kkUFKfys': 'talk', c2IuofCwVQM: 'talk', soIe113WbV8: 'talk',
}

/** Длина видео для фильтра: короткие до 6 минут, средние 6–10, длинные дольше 10; длительность 0 (пока неизвестна) ни в одну группу не входит. */
export const VLOG_LENGTHS = [
  { id: 'short', label: 'до 6 мин', test: (s: number) => s > 0 && s < 360 },
  { id: 'mid', label: '6–10 мин', test: (s: number) => s >= 360 && s <= 600 },
  { id: 'long', label: 'дольше 10 мин', test: (s: number) => s > 600 },
] as const
