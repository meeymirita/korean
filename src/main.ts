import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useProgressStore } from './stores/progress'

import App from './App.vue'
import router from './router'

/** Ссылка вида /?guest=токен входит сразу как гость; сам токен после входа убирается из адреса. */
const guest = new URLSearchParams(location.search).get('guest')

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)
if (guest) {
  void router.isReady().then(() => {
    const { guest: _token, ...query } = router.currentRoute.value.query
    return router.replace({ query, hash: router.currentRoute.value.hash })
  })
}

const progress = useProgressStore(pinia)

// владельца ссылка не трогает: его токен остаётся
if (guest && !progress.unlocked) void progress.connect(guest)
else void progress.init()

app.mount('#app')
