/**
 * main.js — Uygulama Giriş Noktası
 * ===================================
 * Bu dosya Vue uygulamasını oluşturur ve tüm eklentileri (plugin) bağlar.
 *
 * createApp(App)  → Kök bileşenden uygulama örneği oluşturur
 * .use(plugin)    → Eklenti kaydeder (router, pinia vb.)
 * .mount('#app')  → index.html'deki <div id="app"> öğesine bağlar
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'

// 1) Vue uygulama örneğini oluştur
const app = createApp(App)

// 2) Pinia (state management) eklentisini kaydet
app.use(createPinia())

// 3) Vue Router eklentisini kaydet
app.use(router)

// 4) Uygulamayı DOM'a bağla
app.mount('#app')
