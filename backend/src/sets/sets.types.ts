/** Снимок набора упражнений, сохранённый в PostgreSQL. */
export interface SetRow {
  id: string
  day: string
  right_n: number
  total_n: number
  data: string
  created: number
}
