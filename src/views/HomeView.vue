<!--
  HomeView.vue — Ana Sayfa Bileşeni
  ===================================
  <script setup> syntax'ı:
    - Vue 3 Composition API'nin kısa yazımıdır
    - import edilen değişkenler otomatik olarak template'e aktarılır
    - return { } yazmaya gerek yoktur
-->

<script setup>
import { useAppStore } from '@/stores'

// Pinia store'dan uygulama bilgisi çekilir
const store = useAppStore()
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center">
    <div class="text-center space-y-6">
      <div class="flex justify-center">
        <img
          src="/techdesk-brand-logo.png"
          alt="TechDesk Logo"
          class="w-20 h-20 rounded-2xl border border-white/20 shadow-xl shadow-blue-900/40"
        />
      </div>
      <!-- Uygulama Başlığı -->
      <h1 class="text-5xl font-bold text-white tracking-tight">
        {{ store.appName }}
      </h1>

      <!-- Alt Başlık -->
      <p class="text-blue-300 text-lg">
        Vue 3 + Vite + Tailwind CSS + Supabase ile geliştirildi
      </p>

      <!-- Durum Kartı -->
      <div class="bg-white/10 backdrop-blur-md rounded-2xl p-6 max-w-md mx-auto border border-white/20">
        <p class="text-emerald-400 font-semibold text-sm uppercase tracking-wider">
          ✅ Proje İskeleti Hazır
        </p>
        <p class="text-slate-300 text-sm mt-2">
          Tüm bağımlılıklar kurulu, geliştirmeye başlayabilirsiniz.
        </p>
      </div>
    </div>
  </div>
</template>
