/** Виды общедоступных учебных материалов для текстового поиска. */
export type SearchCategory = 'word' | 'grammar' | 'sentence' | 'reference' | 'letter' | 'form' | 'game'
export type PrivateSearchCategory = 'note' | 'image'

/** Документ публичного учебного каталога; личные данные сюда не входят. */
export interface StaticSearchDocument {
  id: string
  category: SearchCategory
  title: string
  text: string
  target?: string
  group?: string
}

/** Ограниченная выдача для сайта. */
export interface StaticSearchHit {
  id: string
  category: SearchCategory
  title: string
  text: string
  target?: string
  group?: string
}

export interface SearchResponse {
  query: string
  hits: StaticSearchHit[]
  total: number
  limit: number
  offset: number
}

/** Закрытая выдача кабинета: содержимое документов клиенту не возвращается. */
export interface PrivateSearchHit {
  id: string
  category: PrivateSearchCategory
}

export interface PrivateSearchResponse {
  query: string
  hits: PrivateSearchHit[]
  total: number
  limit: number
}

export interface SearchServiceStatus {
  configured: boolean
  available: boolean
  indexed: boolean
  documents: number
  message: string
}

export interface MeiliTask {
  /** номер задачи в ответе на запись (POST/PATCH/DELETE) */
  taskUid?: number
  /** то же число в ответе на GET /tasks/{номер}: там поле называется uid */
  uid?: number
  status?: 'enqueued' | 'processing' | 'succeeded' | 'failed' | string
  error?: { message?: string }
}
