import { defineStore } from 'pinia'
import { quotes} from "@/data/quotes.ts";
export const useQuotesStore = defineStore('quotes', () => {
  return { quotes }
})
