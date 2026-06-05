<!--
  LoginView.vue — Giriş Sayfası
  ==============================
  Supabase Auth ile e-posta/şifre girişi.
  - useAuthStore → signIn() action'ı çağrılır
  - Başarılı giriş → /dashboard'a yönlendirilir
  - v-model → form verilerini reaktif olarak bağlar
  - @submit.prevent → form submit edildiğinde sayfa yenilenmesini engeller
-->

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// ─── Router & Store ────────────────────────────────────────
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

// ─── Reaktif Form Verileri ─────────────────────────────────
// ref() → reaktif değişken oluşturur, template'de otomatik güncellenir
const email = ref('')
const password = ref('')
const errorMsg = ref('')

// ─── Form Submit Handler ───────────────────────────────────
const handleLogin = async () => {
  errorMsg.value = '' // Önceki hata mesajını temizle

  // Auth store'daki signIn action'ını çağır
  const { success, error } = await authStore.signIn(email.value, password.value)

  if (success) {
    // Korunan bir sayfadan login'e geldiyse oraya geri don
    const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    router.push(redirectPath)
  } else {
    // Hata mesajını göster
    errorMsg.value = error || 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
    <!-- Login Kartı -->
    <div class="w-full max-w-md">
      <!-- Logo / Başlık -->
      <div class="text-center mb-8">
        <div class="flex justify-center mb-4">
          <img
            src="/techdesk-brand-logo.png"
            alt="TechDesk Logo"
            class="w-16 h-16 rounded-xl border border-white/20 shadow-xl shadow-blue-900/40"
          />
        </div>
        <h1 class="text-4xl font-bold text-white mb-2">TechDesk</h1>
        <p class="text-blue-300 text-sm">Kurumsal IT Destek Sistemi</p>
      </div>

      <!-- Form Kartı -->
      <div class="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-2xl">
        <h2 class="text-2xl font-semibold text-white mb-6 text-center">Giriş Yap</h2>

        <!-- Hata Mesajı -->
        <div
          v-if="errorMsg"
          class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm"
        >
          {{ errorMsg }}
        </div>

        <!-- Form -->
        <form @submit.prevent="handleLogin" class="space-y-5">
          <!-- E-posta Alanı -->
          <div>
            <label for="email" class="block text-sm font-medium text-blue-200 mb-2">
              E-posta Adresi
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              required
              placeholder="personel@sirket.com"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <!-- Şifre Alanı -->
          <div>
            <label for="password" class="block text-sm font-medium text-blue-200 mb-2">
              Şifre
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              placeholder="••••••••"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <!-- Giriş Yap Butonu -->
          <button
            type="submit"
            :disabled="authStore.actionLoading"
            class="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-blue-600/30"
          >
            <span v-if="authStore.actionLoading">Giriş yapılıyor...</span>
            <span v-else>Giriş Yap</span>
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-slate-400">
          Yeni hesaplar yalnızca yönetici tarafından sistem içinden oluşturulur.
        </p>
      </div>
    </div>
  </div>
</template>
