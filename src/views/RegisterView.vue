<!--
  RegisterView.vue — Kayıt Sayfası
  =================================
  Supabase Auth ile yeni kullanıcı kaydı.
  - signUp() → e-posta, şifre ve ad-soyad ile kayıt
  - metadata olarak full_name gönderilir → trigger profiles'a yazar
  - Başarılı kayıt → /login sayfasına yönlendirilir
-->

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// ─── Router & Store ────────────────────────────────────────
const router = useRouter()
const authStore = useAuthStore()

// ─── Reaktif Form Verileri ─────────────────────────────────
const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMsg = ref('')
const successMsg = ref('')

// ─── Form Submit Handler ───────────────────────────────────
const handleRegister = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  // Şifre eşleşme kontrolü
  if (password.value !== confirmPassword.value) {
    errorMsg.value = 'Şifreler eşleşmiyor!'
    return
  }

  // Şifre uzunluk kontrolü
  if (password.value.length < 6) {
    errorMsg.value = 'Şifre en az 6 karakter olmalıdır.'
    return
  }

  // Auth store'daki signUp action'ını çağır
  const { success, error } = await authStore.signUp(
    email.value,
    password.value,
    fullName.value
  )

  if (success) {
    successMsg.value = 'Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...'
    // 2 saniye sonra login sayfasına yönlendir
    setTimeout(() => router.push('/login'), 2000)
  } else {
    errorMsg.value = error || 'Kayıt başarısız. Lütfen tekrar deneyin.'
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
    <!-- Register Kartı -->
    <div class="w-full max-w-md">
      <!-- Logo / Başlık -->
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-white mb-2">🖥️ TechDesk</h1>
        <p class="text-blue-300 text-sm">Kurumsal IT Destek Sistemi</p>
      </div>

      <!-- Form Kartı -->
      <div class="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 shadow-2xl">
        <h2 class="text-2xl font-semibold text-white mb-6 text-center">Kayıt Ol</h2>

        <!-- Başarı Mesajı -->
        <div
          v-if="successMsg"
          class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 px-4 py-3 rounded-xl mb-6 text-sm"
        >
          {{ successMsg }}
        </div>

        <!-- Hata Mesajı -->
        <div
          v-if="errorMsg"
          class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm"
        >
          {{ errorMsg }}
        </div>

        <!-- Form -->
        <form @submit.prevent="handleRegister" class="space-y-5">
          <!-- Ad Soyad -->
          <div>
            <label for="fullName" class="block text-sm font-medium text-blue-200 mb-2">
              Ad Soyad
            </label>
            <input
              id="fullName"
              v-model="fullName"
              type="text"
              required
              placeholder="Ali Veli"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

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
              placeholder="En az 6 karakter"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <!-- Şifre Tekrar -->
          <div>
            <label for="confirmPassword" class="block text-sm font-medium text-blue-200 mb-2">
              Şifre Tekrar
            </label>
            <input
              id="confirmPassword"
              v-model="confirmPassword"
              type="password"
              required
              placeholder="Şifrenizi tekrar girin"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <!-- Kayıt Ol Butonu -->
          <button
            type="submit"
            :disabled="authStore.actionLoading"
            class="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-600/30"
          >
            <span v-if="authStore.actionLoading">Kayıt yapılıyor...</span>
            <span v-else>Kayıt Ol</span>
          </button>
        </form>

        <!-- Giriş Yap Linki -->
        <p class="mt-6 text-center text-sm text-slate-400">
          Zaten hesabın var mı?
          <router-link
            to="/login"
            class="text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            Giriş Yap
          </router-link>
        </p>
      </div>
    </div>
  </div>
</template>
