/** Влоги плейлиста автора (Daily Korean with Jaerim) в порядке от простого к сложному (по числу слов в речи; видео без доступа в конце): для заглушек в списке «Влога». Готовый влог лежит в `vlogs.ts` и подменяет заглушку по номеру `yt`. */
export interface VlogPlanItem {
  yt: string
  /** название на ютубе, пока нет своего */
  title: string
  /** длительность, секунды */
  dur: number
}

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
  { yt: '5v1KJX-jz58', dur: 264, title: 'Real-Life Korean Conversations | Dentist, Pharmacy, Banchan Shop, Cafe (Members Only)' },
  { yt: '095jPLJRYhE', dur: 133, title: 'Real-Life Korean Conversations | Traditional Korean market, Donut shop, Restaurant, Starbucks' },
  { yt: '0U6wOLBrRXo', dur: 87, title: '[FULL] Real-Life Korean Conversations | Restaurant, Cafe, Bakery (Members Only)' },
  { yt: 'FmQTR3fVKvs', dur: 188, title: 'Real-Life Korean Conversations | Cafe, Pharmacy, Olive Young, Laundry (Members Only)' },
]
