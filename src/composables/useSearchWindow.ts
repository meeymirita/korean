import { ref } from 'vue'

/** Окно поиска по платформе (кнопка справа вверху или Ctrl/Cmd + K): состояние общее, запрос помнится, пока страница открыта. */
export const searchOpen = ref(false)
export const searchQuery = ref('')

export const openSearch = () => (searchOpen.value = true)
export const closeSearch = () => (searchOpen.value = false)
export const toggleSearch = () => (searchOpen.value = !searchOpen.value)
