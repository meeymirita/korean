/** Категории публичных документов в поисковом индексе. */
export type SearchCategory = 'word' | 'grammar' | 'sentence' | 'reference' | 'letter' | 'form' | 'game'

/** Состояние серверного поискового сервиса для кабинета владельца. */
export interface SearchServiceStatus {
  configured: boolean
  available: boolean
  indexed: boolean
  documents: number
  message: string
}

/** Результат закрытого поиска кабинета без содержимого личной записи. */
export interface PrivateSearchReply {
  query: string
  hits: { id: string; category: 'note' | 'image' }[]
  total: number
  limit: number
}
