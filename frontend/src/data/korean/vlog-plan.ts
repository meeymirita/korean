/** Влоги плейлиста автора (Daily Korean with Jaerim) в порядке от простого к сложному (по числу слов в речи): для заглушек в списке «Влога». Готовый влог лежит в `vlogs.ts` и подменяет заглушку по номеру `yt`. */
export interface VlogPlanItem {
  yt: string
  /** название на ютубе, пока нет своего */
  title: string
  /** длительность, секунды; 0 = пока неизвестна */
  dur: number
  /** автор канала (`name` из `VLOG_AUTHORS`); не указан = Daily Korean with Jaerim */
  author?: string
}

/** Авторы влогов: по вкладке на каждого. `slug` — папка для скачивания (`~/Movies/Korean-videos/vlog/<slug>`), `tab` — подпись вкладки. */
export const VLOG_AUTHORS = [
  { name: 'Daily Korean with Jaerim', slug: 'jaerim', tab: 'Jaerim' },
  { name: 'Dora\'s Slow Korean', slug: 'dora', tab: 'Dora' },
  { name: 'Ria Korea 리아 코리아', slug: 'ria', tab: 'Ria Korea' },
  { name: '최수수 ChoiSusu', slug: 'choisusu', tab: 'ChoiSusu' },
] as const

export const DEFAULT_AUTHOR = VLOG_AUTHORS[0].name

export const VLOG_PLAN: VlogPlanItem[] = [
  { yt: 'Q7_UmOUi1XE', dur: 316, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input – Lunar New Year Soup (Tteokguk)' },
  { yt: 'z-R0eTXKtpo', dur: 247, title: 'Slow Korean Listening for Beginners | Korean Winter Snacks' },
  { yt: 'ZNSUgWjytUw', dur: 335, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input at a Bookstore' },
  { yt: 'ewL6SaZzjyU', dur: 395, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input at a Hair Salon' },
  { yt: 'dpzJkC7hptY', dur: 420, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input in Seoul (Walking Vlog)' },
  { yt: '79Pwq7MTUPE', dur: 243, title: 'Learn Korean with Easy Listening | Beginner Lesson' },
  { yt: '9lOJxJBRj1I', dur: 334, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input at an Ice Cream Shop' },
  { yt: 'hBGbIvyU5G4', dur: 343, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input with a Birthday Story' },
  { yt: 'paToZla2CK8', dur: 437, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input in a Supermarket' },
  { yt: 'ddDyB0MGxJs', dur: 387, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input While Playing a Claw Machine' },
  { yt: 'pzqtJI-FxJg', dur: 403, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input with Christmas Cards' },
  { yt: 'XknpI48lT-g', dur: 482, title: 'If You’re a BEGINNER, WATCH THIS! | Weekend Routine (Market & Park) | Comprehensible Korean Input' },
  { yt: 'IGEj-oDKyw8', dur: 580, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input at a Convenience Store' },
  { yt: 'eXgzit1jiwI', dur: 549, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input – A Walk in Istanbul' },
  { yt: 'vc3hGLgyXL4', dur: 621, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input at the Airport' },
  { yt: 'LWGNKfztgcI', dur: 653, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input for a Breakfast Routine' },
  { yt: 'Szv3gPqohbg', dur: 654, title: 'If You’re a Beginner, WATCH THIS! | Slow Korean + Real-Life Conversations' },
  { yt: 'BWINkN8QbkU', dur: 549, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input : Daily Life' },
  { yt: 'r2lXjL7l4xI', dur: 569, title: 'If You’re a BEGINNER, WATCH THIS! | Comprehensible Korean Input with a New Year Calendar' },
  { yt: 'ufDM439eOqU', dur: 755, title: 'If You’re a Beginner, WATCH THIS! | Slow Korean + Real-Life Conversations' },
  { yt: 'l2EmMNRa5Y0', dur: 667, title: 'If You\'re a Beginner, WATCH THIS!  | Shopping at Daiso' },
  { yt: 'gwo2Bwc3_V0', dur: 936, title: 'If You\'re a Beginner, WATCH THIS! | Daily Routine + Real-Life Conversations' },
  { yt: 'OS8rnqXM2KI', dur: 749, title: 'If You’re a Beginner, WATCH THIS! | Real-Life Korean Conversations (Dentist, Pharmacy, Cafe)' },
  { yt: 'OEyKAUhc6gU', dur: 926, title: 'If You’re a Beginner, WATCH THIS! | Real-Life Korean Vlog' },
  { yt: 'SEywQdBW8W4', dur: 837, title: 'If You’re a Beginner, WATCH THIS! | Real-Life Korean Vlog' },
  { yt: 'EU-bWknoYc8', dur: 1146, title: 'If You’re a BEGINNER, WATCH THIS! | Exploring Korea\'s Ancient Capital' },
  { yt: 'dsg4N8AvEZ4', dur: 921, title: 'LEARN KOREAN naturally with this Vlog | Slow Korean & Real-Life Conversations' },
  { yt: 'rNclAN43VQ0', dur: 922, title: 'Learn Korean the EASY way | Slow Korean + Real- Life Conversations' },
  { yt: 'Gy_nMwa51nY', dur: 822, title: 'Korean You Can Actually Understand | Slow Korean + Real-Life Conversations (Grocery Shopping)' },
  { yt: 'Xhm37Rybhv0', dur: 955, title: 'Learn Korean the EASY way | Slow Korean + Real- Life Conversations (A Day in Jeju)' },
  { yt: 'Jex4XTA3BDg', dur: 175, author: "Dora's Slow Korean", title: "[Slow Korean] How to Introduce Yourself | Learn Korean for Beginners" },
  { yt: 'W7ErKzubTjY', dur: 342, author: "Dora's Slow Korean", title: "My Daily Routine in Korea | Learn Korean with Comprehensible Input" },
  { yt: '7T3l2syFC_s', dur: 400, author: "Dora's Slow Korean", title: "[Slow Korean] Hiking in Seoul | Learn Korean for Beginners" },
  { yt: 'uPKRQhaYeMg', dur: 422, author: "Dora's Slow Korean", title: "[Slow Korean] What Koreans Do on Chuseok (Thanksgiving) | Learn Korean for Beginners" },
  { yt: 'ENLlmkwv6jk', dur: 529, author: "Dora's Slow Korean", title: "[Slow Korean] A Day at Gyeongbokgung Palace | Learn Korean for Beginners" },
  { yt: 'P1WgK4TxJYE', dur: 534, author: "Dora's Slow Korean", title: "[Slow Korean] Convenience Store Shopping & Eating | Learn Korean for Beginners" },
  { yt: 'MFgVfcqBkJ0', dur: 582, author: "Dora's Slow Korean", title: "[Slow Korean] Shopping at Daiso | Learn Korean for Beginners" },
  { yt: '8u47xrx3Ffw', dur: 587, author: "Dora's Slow Korean", title: "[Slow Korean] Traveling Outside Seoul: Daejeon | Learn Korean for Beginners" },
  { yt: 'QJanmo9TXc8', dur: 631, author: "Dora's Slow Korean", title: "[Slow Korean] A Day in Seoul | Learn Korean for Beginners" },
  { yt: '4qXLtgcswWY', dur: 642, author: "Dora's Slow Korean", title: "[Slow Korean] A Day at a Korean Cinema | Learn Korean for Beginners (Casual Korean ver.)" },
  { yt: 'cIAydgtc7zE', dur: 842, author: "Dora's Slow Korean", title: "[Slow Korean] A Day in Seoul (Department Store Shopping) | Learn Korean for Beginners" },
  { yt: 'wtIzSP2fDOk', dur: 851, author: "Dora's Slow Korean", title: "[Slow Korean] A Day in Korea Vlog | Learn Korean for Beginners" },
  { yt: 'qlMmOiQPLsc', dur: 407, author: "Ria Korea 리아 코리아", title: "Slow Korean Vlog | Super Easy Korean for Beginners | Korean Comprehensible input" },
  { yt: 'NGPw_UD_D9U', dur: 0, author: "Ria Korea 리아 코리아", title: "Must-Know Korean Verbs" },
  { yt: 'EpGocbJZ3jc', dur: 0, author: "Ria Korea 리아 코리아", title: "Shop with Me at a Korean Supermarket" },
  { yt: '9W4jYPAn1GY', dur: 0, author: "Ria Korea 리아 코리아", title: "Learn Korean in the Snow" },
  { yt: 'FY9_RtFt84U', dur: 0, author: "Ria Korea 리아 코리아", title: "Easy Korean at the Movie Theater" },
  { yt: 'o-X_6t45Sic', dur: 0, author: "Ria Korea 리아 코리아", title: "Learn Korean at a Hair Salon" },
  { yt: 'Oh8fiYihNhM', dur: 0, author: "Ria Korea 리아 코리아", title: "Easy Korean Comprehensible Input: Cherry Blossoms" },
  { yt: '29mdX4IG7YI', dur: 0, author: "최수수 ChoiSusu", title: "Short story: Morning Routine" },
  { yt: '_kPYR0gBstk', dur: 0, author: "최수수 ChoiSusu", title: "Short story: Hobby" },
  { yt: '932sf30NQzE', dur: 0, author: "최수수 ChoiSusu", title: "Short story: Health" },
  { yt: 'R2WQ6wQCr1Y', dur: 0, author: "최수수 ChoiSusu", title: "Short story: My Neighborhood" },
  { yt: 'B1NfSUKXaTs', dur: 0, author: "최수수 ChoiSusu", title: "Short story: Buying Clothes" },
  { yt: 'qoidYvlCiPM', dur: 0, author: "최수수 ChoiSusu", title: "Short story: Preparing for a Trip" },
  { yt: 'MNsHXC_-HVA', dur: 0, author: "최수수 ChoiSusu", title: "Short story: Housework" },
  { yt: 'wquDm0eqMMU', dur: 0, author: "최수수 ChoiSusu", title: "Beginner Podcast: Korean Convenience Stores" },
  { yt: 'ZzcszvIgT_8', dur: 0, author: "최수수 ChoiSusu", title: "Beginner Podcast: Korean Summer Foods" },
  { yt: '6y6YoL-TjYQ', dur: 0, author: "최수수 ChoiSusu", title: "Beginner Podcast: Ordering at a Korean Restaurant" },
  { yt: '3GYl0X6tk2M', dur: 0, author: "최수수 ChoiSusu", title: "Beginner Podcast: Ordering Food Delivery" },
  { yt: '23C9rdaLOCc', dur: 0, author: "최수수 ChoiSusu", title: "Beginner Podcast: Chuseok" },
  { yt: 'BnTS2DOdMSY', dur: 0, author: "최수수 ChoiSusu", title: "Beginner Podcast: Apartments in Korea" },
]

/** Видео плейлиста «только для участников канала» (Members Only): платный доступ у автора, скачать и разобрать нельзя, в списке не показываются. */
export const VLOG_LOCKED: VlogPlanItem[] = [
  { yt: '5v1KJX-jz58', dur: 264, title: 'Real-Life Korean Conversations | Dentist, Pharmacy, Banchan Shop, Cafe (Members Only)' },
  { yt: '095jPLJRYhE', dur: 133, title: 'Real-Life Korean Conversations | Traditional Korean market, Donut shop, Restaurant, Starbucks' },
  { yt: '0U6wOLBrRXo', dur: 87, title: '[FULL] Real-Life Korean Conversations | Restaurant, Cafe, Bakery (Members Only)' },
  { yt: 'FmQTR3fVKvs', dur: 188, title: 'Real-Life Korean Conversations | Cafe, Pharmacy, Olive Young, Laundry (Members Only)' },
]
