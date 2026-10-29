import {defineStore} from 'pinia'
import {menuGroups} from "@/data/menu.ts";
export const useMenuStore = defineStore('menu', () => {
    return { menuGroups }
})
