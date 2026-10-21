import {defineStore} from 'pinia'
import {menu} from "@/data/menu.ts";
export const useMenuStore = defineStore('menu', () => {
    return { menu }
})
