<!--
  App.vue — Kök Uygulama Bileşeni
  ===================================
  Uygulama başlangıcında:
    1. initAuth() çağrılarak mevcut oturum kontrol edilir
    2. isLoading true iken loading spinner gösterilir
    3. Oturum kontrolü tamamlandıktan sonra RouterView render edilir

  onMounted():
    - Bileşen DOM'a bağlandığında bir kez çalışır
    - Burada auth başlatma işlemi yapılır
-->

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const SESSION_TIMEOUT_MINUTES = 120

// ─── Oturum Zaman Aşımı Mantığı ────────────────────────────
let timeoutTimer = null

const resetTimer = () => {
  if (timeoutTimer) clearTimeout(timeoutTimer)

  // Sadece giriş yapmış kullanıcılar için zamanlayıcıyı çalıştır
  if (authStore.isAuthenticated) {
    const timeoutMs = SESSION_TIMEOUT_MINUTES * 60 * 1000
    timeoutTimer = setTimeout(async () => {
      console.warn('Oturum zaman aşımına uğradı.')
      await authStore.signOut()
      router.push('/login')
    }, timeoutMs)
  }
}

// Global etkinlik dinleyicileri (kullanıcı hareket ettiğinde süreyi sıfırlar)
const events = ['mousemove', 'keydown', 'scroll', 'click']
const recoverSessionOnReturn = async () => {
  if (document.visibilityState === 'visible') {
    await authStore.recoverSession()
    window.dispatchEvent(new Event('techdesk:resume'))
  }
}

const setupListeners = () => {
  events.forEach(event => window.addEventListener(event, resetTimer))
  document.addEventListener('visibilitychange', recoverSessionOnReturn)
  window.addEventListener('focus', recoverSessionOnReturn)
  window.addEventListener('online', recoverSessionOnReturn)
}
const cleanupListeners = () => {
  events.forEach(event => window.removeEventListener(event, resetTimer))
  document.removeEventListener('visibilitychange', recoverSessionOnReturn)
  window.removeEventListener('focus', recoverSessionOnReturn)
  window.removeEventListener('online', recoverSessionOnReturn)
  if (timeoutTimer) clearTimeout(timeoutTimer)
}

// Uygulama başlangıcında oturum kontrolü
onMounted(async () => {
  await authStore.initAuth()

  // Dinleyicileri başlat ve sayacı kur
  setupListeners()
  resetTimer()
})

onUnmounted(() => {
  cleanupListeners()
})
</script>

<template>
  <!-- Loading Ekranı — Auth kontrolü yapılırken gösterilir -->
  <div
    v-if="authStore.isLoading"
    class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center"
  >
    <div class="text-center space-y-4">
      <!-- Dönen animasyon -->
      <div class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-blue-300 text-sm">Yükleniyor...</p>
    </div>
  </div>

  <!-- Ana Uygulama — Auth kontrolü tamamlandıktan sonra -->
  <RouterView v-else />
</template>
