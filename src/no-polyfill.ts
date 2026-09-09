// no @sec-ant/readable-stream import — the missing polyfill is what this entry point exists to show
import { createApp } from 'vue'
import FallbackPage from './FallbackPage.vue'

createApp(FallbackPage).mount('#app')
