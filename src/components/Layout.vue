<!--
  Layout.vue — Ana Uygulama Düzeni
  ==================================
  Giriş yapan kullanıcılar için ana yapı bileşeni.

  Yapı:
  ┌─────────────────────────────────────────────┐
  │                  Header                     │
  ├──────────┬──────────────────────────────────┤
  │          │                                  │
  │ Sidebar  │         <router-view />          │
  │  (Menü)  │         (Sayfa İçeriği)          │
  │          │                                  │
  └──────────┴──────────────────────────────────┘

  Özellikler:
  - Sidebar rol bazlı menü gösterir (admin, it_staff, user)
  - Mobilde sidebar hamburger menüyle açılır/kapanır
  - Header'da kullanıcı bilgisi ve çıkış butonu
  - <slot /> veya <RouterView /> ile sayfa içeriği render edilir
-->

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'

// ─── Router & Store ────────────────────────────────────────
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()

// ─── Bildirim Dropdown ──────────────────────────────────────
const showNotifications = ref(false)

const toggleNotifications = async () => {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value && notificationsStore.unreadCount > 0) {
    await notificationsStore.markAllAsRead()
  }
}

// Dışarı tıklandığında kapat
const closeNotifications = (e) => {
  if (!e.target.closest('#notification-panel') && !e.target.closest('#notification-btn')) {
    showNotifications.value = false
  }
}

onMounted(async () => {
  if (authStore.user) {
    await notificationsStore.fetchNotifications(authStore.user.id)
    notificationsStore.subscribeToNotifications(authStore.user.id)
  }
  document.addEventListener('click', closeNotifications)
})

onUnmounted(() => {
  notificationsStore.unsubscribe()
  document.removeEventListener('click', closeNotifications)
})

// Tarih format
const formatNotifDate = (dateStr) => {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now - d
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Az önce'
  if (diffMins < 60) return `${diffMins} dk önce`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs} saat önce`
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
}

// ─── Sidebar Aç/Kapa (mobil için) ─────────────────────────
const sidebarOpen = ref(false)
const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

// ─── Çıkış Yap ────────────────────────────────────────────
const handleLogout = async () => {
  try {
    await authStore.signOut()
  } catch (e) {
    console.error('Çıkış hatası:', e)
  } finally {
    // Hata olsa bile store'u temizle ve login'e yönlendir
    authStore.user = null
    authStore.profile = null
    router.push('/login')
  }
}

// ─── Rol Etiketleri ────────────────────────────────────────
const roleLabels = {
  user: 'Son Kullanıcı',
  it_staff: 'IT Personeli',
  admin: 'Yönetici',
}

// Rol için renk badge'i
const roleBadgeClass = computed(() => {
  const classes = {
    admin: 'bg-red-500/20 text-red-300 border-red-500/30',
    it_staff: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    user: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  }
  return classes[authStore.userRole] || classes.user
})

// ─── Menü Tanımları ────────────────────────────────────────
// roles: Bu menü öğesini hangi roller görebilir?
// Belirtilmezse → herkes görebilir
const menuItems = computed(() => {
  const allItems = [
    {
      label: 'Dashboard',
      icon: '📊',
      path: '/dashboard',
    },
    {
      label: 'Taleplerim',
      icon: '📋',
      path: '/tickets',
      roles: ['user'], // Sadece normal kullanıcılar
    },
    {
      label: 'Yeni Talep',
      icon: '➕',
      path: '/tickets/new',
      roles: ['user'], // Sadece normal kullanıcılar
    },
    {
      label: 'Ekipmanlarım',
      icon: '💻',
      path: '/my-assets',
      roles: ['user'],
    },
    {
      label: 'Tüm Talepler',
      icon: '📁',
      path: '/tickets/all',
      roles: ['it_staff', 'admin'],
    },
    {
      label: 'İstatistikler',
      icon: '📈',
      path: '/stats',
      roles: ['it_staff', 'admin'],
    },
    {
      label: 'Memnuniyet',
      icon: '⭐',
      path: '/ratings',
      roles: ['it_staff', 'admin'],
    },
    {
      label: 'Bilgi Bankası',
      icon: '📚',
      path: '/knowledge-base',
    },
    {
      label: 'Demirbaş Yönetimi',
      icon: '🖥️',
      path: '/admin/assets',
      roles: ['admin'],
    },
    {
      label: 'Kullanıcı Yönetimi',
      icon: '👥',
      path: '/admin/users',
      roles: ['admin'],
    },
    {
      label: 'Duyuru Panosu',
      icon: '📢',
      path: '/admin/announcements',
      roles: ['admin'],
    },
    {
      label: 'Sistem Günlüğü',
      icon: '🧾',
      path: '/logs',
      roles: ['admin'],
    },
  ]

  // Kullanıcının rolüne göre filtrele
  return allItems.filter((item) => {
    if (!item.roles) return true // roles tanımlı değilse herkes görebilir
    return item.roles.includes(authStore.userRole)
  })
})

// Aktif menü öğesini belirle (mevcut route ile karşılaştır)
const isActive = (path) => {
  return route.path === path || route.path.startsWith(path + '/')
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">

    <!-- ═══════════════ HEADER ═══════════════ -->
    <header class="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-30">
      <div class="flex items-center justify-between h-16 px-4 lg:px-6">
        <!-- Sol: Hamburger + Logo -->
        <div class="flex items-center space-x-4">
          <!-- Hamburger Menü Butonu (sadece mobilde) -->
          <button
            @click="toggleSidebar"
            class="lg:hidden text-slate-400 hover:text-white transition-colors"
          >
            <!-- Hamburger ikonu -->
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                v-if="!sidebarOpen"
                stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
              <path
                v-else
                stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          <!-- Logo -->
          <div class="flex items-center space-x-3">
            <img
              src="/favicon-techdesk.png"
              alt="TechDesk Logo"
              class="w-8 h-8 rounded-lg border border-white/20"
            />
            <span class="text-white font-bold text-lg hidden sm:inline">TechDesk</span>
          </div>
        </div>

        <!-- Sağ: Kullanıcı Bilgisi + Bildirim + Çıkış -->
        <div class="flex items-center space-x-3">
          <!-- Rol Badge -->
          <span :class="['px-3 py-1 text-xs font-medium rounded-full border hidden sm:inline', roleBadgeClass]">
            {{ roleLabels[authStore.userRole] || authStore.userRole }}
          </span>

          <!-- Kullanıcı Adı -->
          <div class="text-right hidden md:block">
            <p class="text-white text-sm font-medium leading-tight">
              {{ authStore.fullName || authStore.emailAddress }}
            </p>
            <p class="text-slate-400 text-xs">
              {{ authStore.emailAddress }}
            </p>
          </div>

          <!-- 🔔 Bildirim Zili -->
          <div class="relative">
            <button
              id="notification-btn"
              @click.stop="toggleNotifications"
              class="relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <!-- Okunmamış Sayıcı -->
              <span
                v-if="notificationsStore.unreadCount > 0"
                class="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse"
              >
                {{ notificationsStore.unreadCount > 9 ? '9+' : notificationsStore.unreadCount }}
              </span>
            </button>

            <!-- Bildirim Dropdown Paneli -->
            <div
              id="notification-panel"
              v-if="showNotifications"
              class="absolute right-0 top-11 w-80 bg-slate-900/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl z-50 overflow-hidden"
            >
              <!-- Panel Başlığı -->
              <div class="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 class="text-white font-semibold text-sm">Bildirimler</h3>
                <button
                  v-if="notificationsStore.notifications.length > 0"
                  @click="notificationsStore.markAllAsRead()"
                  class="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Tamamını Okundu Yap
                </button>
              </div>

              <!-- Liste -->
              <div class="max-h-80 overflow-y-auto">
                <!-- Boş Durum -->
                <div
                  v-if="notificationsStore.sortedNotifications.length === 0"
                  class="py-10 text-center"
                >
                  <div class="text-3xl mb-2">🔔</div>
                  <p class="text-slate-500 text-sm">Bildirim bulunmuyor.</p>
                </div>

                <!-- Bildirimler -->
                <div
                  v-for="n in notificationsStore.sortedNotifications"
                  :key="n.id"
                  :class="[
                    'flex items-start gap-3 px-4 py-3 border-b border-white/5 transition-colors hover:bg-white/5',
                    !n.is_read ? 'bg-blue-500/5' : ''
                  ]"
                >
                  <!-- Tip İkonu -->
                  <div :class="[
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5',
                    n.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                    n.type === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-blue-500/20 text-blue-400'
                  ]">
                    {{ n.type === 'success' ? '✅' : n.type === 'warning' ? '⚠️' : 'ℹ️' }}
                  </div>

                  <!-- İçerik -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-white text-xs font-semibold leading-snug">{{ n.title }}</p>
                      <!-- Okunmamış noktası -->
                      <span v-if="!n.is_read" class="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-1"></span>
                    </div>
                    <p class="text-slate-400 text-xs mt-0.5 leading-snug">{{ n.body }}</p>
                    <p class="text-slate-600 text-[10px] mt-1">{{ formatNotifDate(n.created_at) }}</p>
                  </div>

                  <!-- Sil Butonu -->
                  <button
                    @click="notificationsStore.deleteNotification(n.id)"
                    class="text-slate-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Çıkış Butonu -->
          <button
            @click="handleLogout"
            class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 hover:text-red-200 text-sm font-medium rounded-xl border border-red-500/30 transition-all duration-200"
          >
            Çıkış
          </button>
        </div>
      </div>
    </header>

    <!-- ═══════════════ BODY (Sidebar + İçerik) ═══════════════ -->
    <div class="flex flex-1 overflow-hidden">

      <!-- ─── Mobil Overlay (sidebar açıkken arka plan karartması) ─── -->
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 bg-black/50 z-20 lg:hidden"
        @click="sidebarOpen = false"
      />

      <!-- ═══════════════ SIDEBAR ═══════════════ -->
      <aside
        :class="[
          'fixed lg:static inset-y-0 left-0 z-20 w-64 transform transition-transform duration-300 ease-in-out',
          'bg-slate-900/95 backdrop-blur-xl border-r border-white/10',
          'flex flex-col pt-16 lg:pt-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        ]"
      >
        <!-- Sidebar Başlık -->
        <div class="px-6 py-5 border-b border-white/10">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Menü
          </p>
        </div>

        <!-- Menü Öğeleri -->
        <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <router-link
            v-for="item in menuItems"
            :key="item.path"
            :to="item.path"
            @click="sidebarOpen = false"
            :data-active="isActive(item.path)"
            :class="[
              'td-sidebar-item flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
              isActive(item.path)
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            ]"
          >
            <span class="text-lg">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </router-link>
        </nav>

        <!-- Sidebar Alt Bilgi -->
        <div class="px-6 py-4 border-t border-white/10">
          <p class="text-xs text-slate-600">TechDesk v1.0</p>
          <p class="text-xs text-slate-600">Kurumsal IT Destek</p>
        </div>
      </aside>

      <!-- ═══════════════ ANA İÇERİK ═══════════════ -->
      <main class="flex-1 overflow-y-auto p-6 lg:p-8">
        <!--
          RouterView: Aktif route'un bileşeni burada render edilir.
          Layout, tüm korumalı sayfalar için ortak bir çerçeve sağlar.
        -->
        <RouterView :key="$route.fullPath" />
      </main>
    </div>
  </div>
</template>
