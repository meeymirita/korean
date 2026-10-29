import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useProgressStore } from './stores/progress'

import App from './App.vue'
import router from './router'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)

void useProgressStore(pinia).init()

app.mount('#app')
