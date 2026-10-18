import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { watch } from 'vue'
import App from './App.vue'
import { locale, t } from './i18n/index.js'
import './styles.css'

watch(
  locale,
  () => {
    document.title = t('game.title')
  },
  { immediate: true },
)

const app = createApp(App)
app.use(createPinia())
app.mount('#app')
