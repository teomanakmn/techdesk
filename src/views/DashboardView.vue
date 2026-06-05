<!--
  DashboardView.vue — Rol Tabanlı Kontrol Paneli
  ================================================
  - admin / it_staff → Sistem geneli istatistikler (tüm talepler)
  - user             → Kişisel istatistikler (kendi talepleri)
-->

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as XLSX from 'xlsx'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabaseClient'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'

const authStore = useAuthStore()

// ─── Rol Kontrolü ─────────────────────────────────────────
const isAdminOrIT = computed(() =>
  ['admin', 'it_staff'].includes(authStore.userRole)
)

// ─── State ────────────────────────────────────────────────
const stats = ref({ open: 0, in_progress: 0, resolved: 0, total: 0 })
const recentTickets = ref([])
const totalUsers = ref(0)
const isLoadingStats = ref(true)
const csatAverage = ref(0)
const csatResponses = ref(0)
const isLoadingRatings = ref(true)
const exportLoading = ref({
  tickets: false,
  assets: false,
  users: false,
})

// ─── Etiket / Stil Tanımları ──────────────────────────────
const statusLabels = { open: 'Açık', in_progress: 'İşlemde', resolved: 'Çözüldü' }
const statusClasses = {
  open: 'bg-red-500/20 text-red-300 border-red-500/30',
  in_progress: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  resolved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}
const priorityLabels = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' }
const priorityClasses = {
  low: 'text-slate-400',
  medium: 'text-blue-400',
  high: 'text-amber-400',
  critical: 'text-red-400',
}

const roleLabels = {
  admin: 'Yönetici',
  it_staff: 'IT Personeli',
  user: 'Son Kullanıcı',
}

const resolvedRatio = computed(() =>
  stats.value.total > 0 ? Math.round((stats.value.resolved / stats.value.total) * 100) : 0
)

// ─── Admin / IT Staff: Sistem Geneli İstatistikler ────────
const fetchAdminStats = async () => {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, status, title, priority, created_at, user_id')
    .order('created_at', { ascending: false })

  if (error) throw error

  const tickets = data || []
  stats.value = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    total: tickets.length,
  }
  recentTickets.value = tickets.slice(0, 6)

  // Toplam kullanıcı sayısı:
  // RLS nedeniyle direkt profiles count bazen 1 döndüğü için admin RPC üzerinden alıyoruz.
  try {
    const { data: usersData, error: usersError } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (usersError) throw usersError
    totalUsers.value = (usersData || []).length
  } catch (usersCountError) {
    console.error('Toplam kullanıcı sayısı RPC ile alınamadı, fallback kullanılıyor:', usersCountError)
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
    totalUsers.value = count || 0
  }

  if (authStore.userRole === 'admin') {
    await fetchAdminRatings()
  }
}

const fetchAdminRatings = async () => {
  isLoadingRatings.value = true
  try {
    const { data, error } = await supabase
      .from('ratings')
      .select('id, score')

    if (error) throw error

    const ratings = data || []
    const totalScore = ratings.reduce((sum, item) => sum + (item.score || 0), 0)
    csatAverage.value = ratings.length ? Number((totalScore / ratings.length).toFixed(1)) : 0
    csatResponses.value = ratings.length
  } catch (error) {
    console.error('Memnuniyet istatistikleri yüklenemedi:', error)
    csatAverage.value = 0
    csatResponses.value = 0
  } finally {
    isLoadingRatings.value = false
  }
}

// ─── Normal Kullanıcı: Kişisel İstatistikler ──────────────
const fetchUserStats = async () => {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, status, title, priority, created_at')
    .eq('user_id', authStore.user.id)
    .order('created_at', { ascending: false })

  if (error) throw error

  const tickets = data || []
  stats.value = {
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    total: tickets.length,
  }
  recentTickets.value = tickets.slice(0, 5)
}

// ─── Tarih Formatlama ─────────────────────────────────────
const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

const formatExcelDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const getTodayForFilename = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const downloadExcelFile = (rows, sheetName, filePrefix) => {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, `TechDesk_${filePrefix}_${getTodayForFilename()}.xlsx`)
}

const exportTicketsToExcel = async () => {
  exportLoading.value.tickets = true
  try {
    const { data: usersData, error: usersError } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (usersError) throw usersError
    const profileNameMap = new Map((usersData || []).map((u) => [u.id, u.full_name?.trim() || '']))

    const { data, error } = await supabase
      .from('tickets')
      .select('title, description, status, priority, created_at, user_id, profiles:user_id(full_name), assets(name)')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = (data || []).map((ticket) => ({
      Tarih: formatExcelDate(ticket.created_at),
      Başlık: ticket.title || '-',
      Açıklama: ticket.description || '-',
      Durum: statusLabels[ticket.status] || ticket.status || '-',
      Öncelik: priorityLabels[ticket.priority] || ticket.priority || '-',
      'Talep Sahibi': ticket.profiles?.full_name?.trim() || profileNameMap.get(ticket.user_id) || 'Bilinmiyor',
      'İlgili Ekipman': ticket.assets?.name || 'Yok',
    }))

    const tickets = data || []
    const openCount = tickets.filter(t => t.status === 'open').length
    const inProgressCount = tickets.filter(t => t.status === 'in_progress').length
    const resolvedCount = tickets.filter(t => t.status === 'resolved').length
    const totalCount = tickets.length
    const resolvedRatio = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0

    const lowCount = tickets.filter(t => t.priority === 'low').length
    const mediumCount = tickets.filter(t => t.priority === 'medium').length
    const highCount = tickets.filter(t => t.priority === 'high').length
    const criticalCount = tickets.filter(t => t.priority === 'critical').length

    const summaryRows = [
      { Metrik: 'Toplam Talep', Değer: totalCount },
      { Metrik: 'Açık Talep', Değer: openCount },
      { Metrik: 'İşlemde Talep', Değer: inProgressCount },
      { Metrik: 'Çözüldü Talep', Değer: resolvedCount },
      { Metrik: 'Çözülme Oranı (%)', Değer: resolvedRatio },
      { Metrik: 'Düşük Öncelik', Değer: lowCount },
      { Metrik: 'Orta Öncelik', Değer: mediumCount },
      { Metrik: 'Yüksek Öncelik', Değer: highCount },
      { Metrik: 'Kritik Öncelik', Değer: criticalCount },
    ]

    const workbook = XLSX.utils.book_new()
    const ticketsSheet = XLSX.utils.json_to_sheet(rows)
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows)

    XLSX.utils.book_append_sheet(workbook, ticketsSheet, 'Talepler')
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Özet')
    XLSX.writeFile(workbook, `TechDesk_Talepler_${getTodayForFilename()}.xlsx`)
  } catch (error) {
    console.error('Talepler dışa aktarılamadı:', error)
    window.alert(`Talepler indirilemedi: ${error.message}`)
  } finally {
    exportLoading.value.tickets = false
  }
}

const exportAssetsToExcel = async () => {
  exportLoading.value.assets = true
  try {
    const { data: usersData, error: usersError } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (usersError) throw usersError
    const profileNameMap = new Map((usersData || []).map((u) => [u.id, u.full_name?.trim() || '']))

    const { data, error } = await supabase
      .from('assets')
      .select('name, serial_number, category, status, created_at, assigned_to, profiles!assets_assigned_to_fkey(full_name)')
      .order('created_at', { ascending: false })

    if (error) throw error

    const rows = (data || []).map((asset) => ({
      Tarih: formatExcelDate(asset.created_at),
      'Demirbaş Adı': asset.name || '-',
      'Seri Numarası': asset.serial_number || '-',
      Kategori: asset.category || '-',
      Durum: asset.status || '-',
      'Atanan Kişi': asset.profiles?.full_name?.trim() || profileNameMap.get(asset.assigned_to) || 'Atanmamış',
    }))

    downloadExcelFile(rows, 'Demirbaşlar', 'Demirbaşlar')
  } catch (error) {
    console.error('Demirbaşlar dışa aktarılamadı:', error)
    window.alert(`Demirbaşlar indirilemedi: ${error.message}`)
  } finally {
    exportLoading.value.assets = false
  }
}

const exportUsersToExcel = async () => {
  exportLoading.value.users = true
  try {
    const { data, error } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (error) throw error

    const rows = (data || []).map((user) => ({
      Tarih: formatExcelDate(user.created_at),
      'Ad Soyad': user.full_name || '-',
      'E-posta': user.email || '-',
      Rol: roleLabels[user.role] || user.role || '-',
    }))

    downloadExcelFile(rows, 'Kullanıcılar', 'Kullanıcılar')
  } catch (error) {
    console.error('Kullanıcılar dışa aktarılamadı:', error)
    window.alert(`Kullanıcılar indirilemedi: ${error.message}`)
  } finally {
    exportLoading.value.users = false
  }
}

onMounted(async () => {
  isLoadingStats.value = true
  try {
    if (isAdminOrIT.value) await fetchAdminStats()
    else await fetchUserStats()
  } catch (e) {
    console.error('Dashboard yükleme hatası:', e)
  } finally {
    isLoadingStats.value = false
  }
})

const refreshOnResume = async () => {
  if (!authStore.isAuthenticated) return
  isLoadingStats.value = true
  try {
    if (isAdminOrIT.value) await fetchAdminStats()
    else await fetchUserStats()
  } catch (error) {
    console.error('Sekme geri dönüşünde dashboard yenileme hatası:', error)
  } finally {
    isLoadingStats.value = false
  }
}

onMounted(() => {
  window.addEventListener('techdesk:resume', refreshOnResume)
})

onUnmounted(() => {
  window.removeEventListener('techdesk:resume', refreshOnResume)
})
</script>

<template>
  <!-- ══════════════════════════════════════════════════════
       ADMİN / IT STAFF GÖRÜNÜMÜ
  ═══════════════════════════════════════════════════════ -->
  <template v-if="isAdminOrIT">
    <!-- Başlık -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">
        Sistem Paneli
        <span class="ml-2 text-sm font-normal px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
          {{ authStore.userRole === 'admin' ? 'Admin' : 'IT Personeli' }}
        </span>
      </h1>
      <p class="text-blue-300 mt-1">Tüm sistem genelindeki talep ve kullanıcı istatistikleri.</p>
    </div>

    <div class="td-surface-card p-6 mb-8 td-stagger" style="animation-delay: 120ms;">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 class="text-lg font-semibold text-white">Raporlar</h2>
          <p class="text-sm text-slate-400 mt-1">Sistem verilerini Excel olarak dışa aktarabilirsiniz.</p>
        </div>
        <div class="flex flex-col sm:flex-row gap-3">
          <button
            @click="exportTicketsToExcel"
            :disabled="exportLoading.tickets"
            class="td-action-btn px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-emerald-600/25 transition-all"
          >
            {{ exportLoading.tickets ? 'Hazırlanıyor...' : 'Talepleri İndir (Excel)' }}
          </button>
          <button
            @click="exportAssetsToExcel"
            :disabled="exportLoading.assets"
            class="td-action-btn px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-blue-600/25 transition-all"
          >
            {{ exportLoading.assets ? 'Hazırlanıyor...' : 'Demirbaşları İndir (Excel)' }}
          </button>
          <button
            @click="exportUsersToExcel"
            :disabled="exportLoading.users"
            class="td-action-btn px-4 py-2.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-fuchsia-800 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-fuchsia-600/25 transition-all"
          >
            {{ exportLoading.users ? 'Hazırlanıyor...' : 'Kullanıcıları İndir (Excel)' }}
          </button>
        </div>
      </div>
    </div>

    <!-- İstatistik Kartları — 4 sütun -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      <!-- Toplam Talepler -->
      <div class="td-metric-card p-5 td-stagger" style="animation-delay: 160ms;">
        <div class="flex items-center justify-between mb-3">
          <p class="text-slate-400 text-sm">Toplam Talep</p>
          <div class="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-xl">📊</div>
        </div>
        <p class="text-3xl font-bold text-blue-400">
          <span v-if="isLoadingStats" class="animate-pulse">—</span>
          <span v-else>{{ stats.total }}</span>
        </p>
      </div>

      <!-- Açık -->
      <div class="td-metric-card p-5 td-stagger" style="animation-delay: 220ms;">
        <div class="flex items-center justify-between mb-3">
          <p class="text-slate-400 text-sm">Açık</p>
          <div class="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-xl">🔴</div>
        </div>
        <p class="text-3xl font-bold text-red-400">
          <span v-if="isLoadingStats" class="animate-pulse">—</span>
          <span v-else>{{ stats.open }}</span>
        </p>
      </div>

      <!-- İşlemde -->
      <div class="td-metric-card p-5 td-stagger" style="animation-delay: 280ms;">
        <div class="flex items-center justify-between mb-3">
          <p class="text-slate-400 text-sm">İşlemde</p>
          <div class="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center text-xl">⏳</div>
        </div>
        <p class="text-3xl font-bold text-amber-400">
          <span v-if="isLoadingStats" class="animate-pulse">—</span>
          <span v-else>{{ stats.in_progress }}</span>
        </p>
      </div>

      <!-- Toplam Kullanıcı -->
      <div class="td-metric-card p-5 td-stagger" style="animation-delay: 340ms;">
        <div class="flex items-center justify-between mb-3">
          <p class="text-slate-400 text-sm">Toplam Kullanıcı</p>
          <div class="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-xl">👥</div>
        </div>
        <p class="text-3xl font-bold text-purple-400">
          <span v-if="isLoadingStats" class="animate-pulse">—</span>
          <span v-else>{{ totalUsers }}</span>
        </p>
      </div>
    </div>

    <!-- Alt Bölüm -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Son Talepler (Sistem Geneli) — 2/3 genişlik -->
      <div class="lg:col-span-2 td-surface-card overflow-hidden td-stagger" style="animation-delay: 180ms;">
        <div class="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">Son Talepler <span class="text-slate-500 text-sm font-normal">(Sistem Geneli)</span></h2>
          <router-link to="/tickets/all" class="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
            Tümünü Gör →
          </router-link>
        </div>

        <div v-if="isLoadingStats" class="p-8 text-center">
          <div class="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        </div>

        <div v-else-if="recentTickets.length === 0" class="p-8 text-center">
          <p class="text-slate-500 text-sm">Sistemde henüz talep bulunmuyor.</p>
        </div>

        <div v-else>
          <div
            v-for="ticket in recentTickets"
            :key="ticket.id"
            class="td-table-row px-6 py-3 border-b border-white/5 transition-colors flex items-center justify-between gap-3"
          >
            <div class="min-w-0 flex-1">
              <p class="text-white text-sm font-medium truncate">{{ ticket.title }}</p>
              <p class="text-slate-500 text-xs mt-0.5">{{ formatDate(ticket.created_at) }}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span :class="['text-xs font-medium', priorityClasses[ticket.priority] || 'text-slate-400']">
                {{ priorityLabels[ticket.priority] || ticket.priority }}
              </span>
              <span :class="['px-2.5 py-1 text-xs font-medium rounded-full border', statusClasses[ticket.status]]">
                {{ statusLabels[ticket.status] }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Hızlı Erişim + Özet — 1/3 genişlik -->
      <div class="space-y-4">
        <div
          v-if="authStore.userRole === 'admin'"
          class="td-surface-card p-6 td-stagger"
          style="animation-delay: 220ms;"
        >
          <h2 class="text-base font-semibold text-white mb-4">⭐ Memnuniyet İstatistikleri</h2>

          <div v-if="isLoadingRatings" class="animate-pulse h-24 bg-white/10 rounded-2xl mb-4"></div>
          <div v-else class="mb-4">
            <p class="text-4xl font-bold text-amber-300">
              {{ csatAverage.toFixed(1) }}/5.0
            </p>
            <p class="text-slate-400 text-sm mt-2">Kullanıcıların çözüm sonrasında verdiği ortalama puan.</p>
            <p class="text-slate-500 text-xs mt-1">{{ csatResponses }} değerlendirme kaydı</p>
          </div>

          <router-link
            to="/ratings"
            class="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-500/15"
          >
            Tüm memnuniyet yorumlarını aç
            <span>→</span>
          </router-link>
        </div>

        <!-- Çözülme Oranı -->
        <div class="td-surface-card p-6 td-stagger" style="animation-delay: 260ms;">
          <h2 class="text-base font-semibold text-white mb-4">✅ Çözülme Oranı</h2>
          <div v-if="!isLoadingStats && stats.total > 0">
            <div class="flex justify-between text-sm mb-1">
              <span class="text-slate-400">Çözüldü</span>
              <span class="text-emerald-400 font-semibold">{{ Math.round((stats.resolved / stats.total) * 100) }}%</span>
            </div>
            <div class="w-full bg-white/10 rounded-full h-2">
              <div
                class="bg-emerald-500 h-2 rounded-full transition-all duration-700"
                :style="{ width: Math.round((stats.resolved / stats.total) * 100) + '%' }"
              ></div>
            </div>
            <p class="text-slate-500 text-xs mt-2">{{ stats.resolved }} / {{ stats.total }} talep çözüldü</p>
          </div>
          <p v-else-if="!isLoadingStats" class="text-slate-500 text-sm">Henüz talep yok.</p>
          <div v-else class="animate-pulse h-6 bg-white/10 rounded-full"></div>
        </div>

        <!-- Hızlı Erişim -->
        <div class="td-surface-card p-6 td-stagger" style="animation-delay: 300ms;">
          <h2 class="text-base font-semibold text-white mb-4">📌 Hızlı Erişim</h2>
          <div class="space-y-3">
            <router-link
              to="/tickets/all"
              class="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors group"
            >
              <span class="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">📋</span>
              <span>Tüm Talepler</span>
            </router-link>
            <router-link
              to="/stats"
              class="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-sm transition-colors group"
            >
              <span class="w-7 h-7 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">📈</span>
              <span>İstatistikler</span>
            </router-link>
            <router-link
              v-if="authStore.userRole === 'admin'"
              to="/admin/users"
              class="flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm transition-colors group"
            >
              <span class="w-7 h-7 bg-purple-500/10 rounded-lg flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">👥</span>
              <span>Kullanıcı Yönetimi</span>
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- ══════════════════════════════════════════════════════
       NORMAL KULLANICI GÖRÜNÜMÜ
  ═══════════════════════════════════════════════════════ -->
  <template v-else>
    <!-- Başlık -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">
        Hoş geldin, {{ authStore.fullName || 'Kullanıcı' }} 👋
      </h1>
      <p class="text-blue-300 mt-1">Destek taleplerinizi buradan takip edebilirsiniz.</p>
    </div>

    <!-- İstatistik Kartları — 3 sütun -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
      <div class="td-metric-card p-6 td-stagger" style="animation-delay: 160ms;">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-slate-400 text-sm">Açık Talepler</p>
            <p class="text-3xl font-bold text-red-400 mt-1">
              <span v-if="isLoadingStats" class="animate-pulse">—</span>
              <span v-else>{{ stats.open }}</span>
            </p>
          </div>
          <div class="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center text-2xl">📋</div>
        </div>
      </div>

      <div class="td-metric-card p-6 td-stagger" style="animation-delay: 220ms;">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-slate-400 text-sm">İşlemde</p>
            <p class="text-3xl font-bold text-amber-400 mt-1">
              <span v-if="isLoadingStats" class="animate-pulse">—</span>
              <span v-else>{{ stats.in_progress }}</span>
            </p>
          </div>
          <div class="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center text-2xl">⏳</div>
        </div>
      </div>

      <div class="td-metric-card p-6 td-stagger" style="animation-delay: 280ms;">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-slate-400 text-sm">Çözüldü</p>
            <p class="text-3xl font-bold text-emerald-400 mt-1">
              <span v-if="isLoadingStats" class="animate-pulse">—</span>
              <span v-else>{{ stats.resolved }}</span>
            </p>
          </div>
          <div class="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center text-2xl">✅</div>
        </div>
      </div>
    </div>

    <!-- Alt Bölüm -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Son Taleplerim -->
      <div class="td-surface-card overflow-hidden td-stagger" style="animation-delay: 200ms;">
        <div class="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-white">Son Taleplerim</h2>
          <router-link to="/tickets" class="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors">
            Tümünü Gör →
          </router-link>
        </div>

        <div v-if="isLoadingStats" class="p-8 text-center">
          <div class="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
        </div>

        <div v-else-if="recentTickets.length === 0" class="p-8 text-center">
          <p class="text-slate-500 text-sm">Henüz talep oluşturmadınız.</p>
          <router-link to="/tickets/new" class="text-blue-400 hover:text-blue-300 text-sm font-medium mt-2 inline-block">
            İlk talebinizi oluşturun →
          </router-link>
        </div>

        <div v-else>
          <div
            v-for="ticket in recentTickets"
            :key="ticket.id"
            class="td-table-row px-6 py-3 border-b border-white/5 transition-colors flex items-center justify-between"
          >
            <div class="min-w-0 flex-1">
              <p class="text-white text-sm font-medium truncate">{{ ticket.title }}</p>
              <p class="text-slate-500 text-xs mt-0.5">{{ formatDate(ticket.created_at) }}</p>
            </div>
            <span :class="['px-2.5 py-1 text-xs font-medium rounded-full border ml-3 whitespace-nowrap', statusClasses[ticket.status]]">
              {{ statusLabels[ticket.status] }}
            </span>
          </div>
        </div>
      </div>

      <!-- Hızlı Erişim -->
      <div class="space-y-6">
        <AnnouncementBanner />
        <div class="td-surface-card p-6 td-stagger" style="animation-delay: 260ms;">
          <h2 class="text-lg font-semibold text-white mb-4">📌 Hızlı İşlemler</h2>
          <div class="space-y-3">
            <router-link
              to="/tickets"
              class="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors group"
            >
              <span class="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">📋</span>
              <span>Taleplerime Git</span>
            </router-link>
            <router-link
              to="/tickets/new"
              class="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 text-sm transition-colors group"
            >
              <span class="w-7 h-7 bg-emerald-500/10 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">➕</span>
              <span>Yeni Talep Oluştur</span>
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>
