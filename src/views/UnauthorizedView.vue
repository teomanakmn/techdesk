<!--
  UnauthorizedView.vue — Yetkisiz Erişim Sayfası
  ================================================
  Kullanıcı, erişim yetkisi olmayan bir sayfaya gitmeye çalıştığında
  bu sayfa gösterilir (rol bazlı koruma tarafından yönlendirilir).
-->

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

// Geri dön butonu
const goBack = () => {
  if (authStore.isAuthenticated) {
    router.push('/dashboard')
  } else {
    router.push('/login')
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
    <div class="text-center space-y-6">
      <!-- İkon -->
      <div class="text-7xl">🔒</div>

      <!-- Başlık -->
      <h1 class="text-3xl font-bold text-white">Yetkisiz Erişim</h1>

      <!-- Açıklama -->
      <p class="text-slate-400 max-w-md mx-auto">
        Bu sayfaya erişim yetkiniz bulunmamaktadır.
        Farklı bir hesapla giriş yapın veya yöneticinizle iletişime geçin.
      </p>

      <!-- Geri Dön Butonu -->
      <button
        @click="goBack"
        class="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30"
      >
        Geri Dön
      </button>
    </div>
  </div>
</template>
