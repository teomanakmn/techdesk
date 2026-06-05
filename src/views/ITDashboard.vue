<!--
  ITDashboard.vue — IT Personeli Paneli
  ======================================
  Tüm destek taleplerini görüntüler ve durum yönetimi sağlar.

  Özellikler:
  - Supabase'den tüm talepleri çeker (RLS: it_staff ve admin)
  - Modern kart tabanlı liste
  - "Detay Gör" butonu → Modal ile detay + durum değiştirme
  - Renkli status/priority badge'leri
  - Filtreleme: Tümü / Açık / İşlemde / Çözüldü
-->

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabaseClient'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { useNotificationsStore } from '@/stores/notifications'
import { useLogger } from '@/utils/useLogger'
import CreateArticleFromTicket from '@/components/CreateArticleFromTicket.vue'

const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()
const { logAction } = useLogger()

// ─── State ────────────────────────────────────────────────
const allTickets = ref([])
const isLoading = ref(true)
const activeFilter = ref('all') // all, open, in_progress, resolved

// ─── Modal State ──────────────────────────────────────────
const showModal = ref(false)
const selectedTicket = ref(null)
const newStatus = ref('')
const statusNote = ref('')
const isSavingStatus = ref(false)
const statusSaveError = ref('')
const statusSaveWarning = ref('')
const statusSaveSuccess = ref(false)
const comments = ref([])
const isLoadingComments = ref(false)
const commentsError = ref('')
const assetHistory = ref([])
const isLoadingAssetHistory = ref(false)
const assetHistoryError = ref('')
const showCreateArticleModal = ref(false)
const articleSaveSuccess = ref(false)

// ─── Etiketler ────────────────────────────────────────────
const statusLabels = {
  open: 'Açık',
  in_progress: 'İşlemde',
  resolved: 'Çözüldü',
}

const statusClasses = {
  open: 'bg-red-500/20 text-red-300 border-red-500/30',
  in_progress: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  resolved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

const statusDotColors = {
  open: 'bg-red-400',
  in_progress: 'bg-amber-400',
  resolved: 'bg-emerald-400',
}

const priorityLabels = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
  critical: 'Kritik',
}

const priorityClasses = {
  low: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  medium: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  critical: 'bg-red-600/20 text-red-400 border-red-600/30',
}

const priorityIcons = {
  low: '🟢',
  medium: '🔵',
  high: '🟠',
  critical: '🔴',
}

// ─── Filtre Seçenekleri ───────────────────────────────────
const filterTabs = [
  { key: 'all', label: 'Tümü' },
  { key: 'open', label: 'Açık' },
  { key: 'in_progress', label: 'İşlemde' },
  { key: 'resolved', label: 'Çözüldü' },
]

// ─── Filtrelenmiş Talepler ────────────────────────────────
const filteredTickets = computed(() => {
  if (activeFilter.value === 'all') return allTickets.value
  return allTickets.value.filter(t => t.status === activeFilter.value)
})

// ─── İstatistikler ────────────────────────────────────────
const stats = computed(() => ({
  total: allTickets.value.length,
  open: allTickets.value.filter(t => t.status === 'open').length,
  in_progress: allTickets.value.filter(t => t.status === 'in_progress').length,
  resolved: allTickets.value.filter(t => t.status === 'resolved').length,
}))

const fetchProfileNameMap = async () => {
  const map = new Map()
  try {
    const { data, error } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (error) throw error
    for (const row of data || []) {
      if (row?.id && row?.full_name) {
        map.set(row.id, row.full_name.trim())
      }
    }
  } catch (error) {
    console.error('Profil isim haritası yüklenemedi:', error)
  }
  return map
}

// ─── Tüm Talepleri Getir ─────────────────────────────────
const fetchAllTickets = async () => {
  isLoading.value = true
  try {
    // Ticket listesini normal client ile çek
    const { data, error } = await supabase
      .from('tickets')
      .select('*, assets(id, name, serial_number, status), profiles:user_id(full_name)')
      .order('created_at', { ascending: false })

    if (error) throw error

    const tickets = data || []
    const profileNameMap = await fetchProfileNameMap()
    const normalizedTickets = tickets.map(ticket => ({
      ...ticket,
      requester_name:
        ticket.profiles?.full_name?.trim() ||
        profileNameMap.get(ticket.user_id) ||
        'Bilinmiyor',
    }))

    if (tickets.length === 0) {
      allTickets.value = []
      return
    }
    allTickets.value = normalizedTickets
  } catch (error) {
    console.error('Talepler yüklenirken hata:', error)
  } finally {
    isLoading.value = false
  }
}

const fetchComments = async (ticketId) => {
  comments.value = []
  commentsError.value = ''
  isLoadingComments.value = true

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (error) throw error
    comments.value = data || []
  } catch (error) {
    console.error('Yorumlar yüklenirken hata:', error)
    commentsError.value = 'Destek notları yüklenemedi.'
  } finally {
    isLoadingComments.value = false
  }
}

const fetchAssetHistory = async ({ assetId, currentTicketId }) => {
  assetHistory.value = []
  assetHistoryError.value = ''

  if (!assetId) return

  isLoadingAssetHistory.value = true
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('id, title, description, status, created_at')
      .eq('asset_id', assetId)
      .neq('id', currentTicketId)
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) throw error
    assetHistory.value = data || []
  } catch (error) {
    console.error('Ekipman geçmişi yüklenirken hata:', error)
    assetHistoryError.value = 'Ekipman geçmişi yüklenemedi.'
  } finally {
    isLoadingAssetHistory.value = false
  }
}

// ─── Modal Aç ────────────────────────────────────────────
const openDetail = async (ticket) => {
  selectedTicket.value = { ...ticket }
  newStatus.value = ticket.status
  statusNote.value = ''
  statusSaveError.value = ''
  statusSaveWarning.value = ''
  statusSaveSuccess.value = false
  showModal.value = true
  await Promise.all([
    fetchComments(ticket.id),
    fetchAssetHistory({ assetId: ticket.asset_id, currentTicketId: ticket.id }),
  ])
}

const closeModal = () => {
  showModal.value = false
  selectedTicket.value = null
  statusNote.value = ''
  showCreateArticleModal.value = false
  comments.value = []
  commentsError.value = ''
  assetHistory.value = []
  assetHistoryError.value = ''
}

const openCreateArticleModal = () => {
  showCreateArticleModal.value = true
}

const closeCreateArticleModal = () => {
  showCreateArticleModal.value = false
}

const handleArticleSaved = () => {
  articleSaveSuccess.value = true
  setTimeout(() => {
    articleSaveSuccess.value = false
  }, 2200)
}

const buildStatusNotification = ({ previousStatus, nextStatus, ticket }) => {
  if (nextStatus === previousStatus) return null

  if (nextStatus === 'resolved') {
    return {
      userId: ticket.user_id,
      title: 'Talebiniz Çözüldü ✅',
      body: `"${ticket.title}" başlıklı destek talebiniz çözüldü olarak işaretlendi.`,
      type: 'success',
      ticketId: ticket.id,
    }
  }

  if (nextStatus === 'in_progress') {
    return {
      userId: ticket.user_id,
      title: 'Talebiniz İşleme Alındı 🔧',
      body: `"${ticket.title}" başlıklı destek talebiniz IT ekibi tarafından inceleniyor.`,
      type: 'info',
      ticketId: ticket.id,
    }
  }

  return null
}

const getCommentAuthor = (comment) => {
  if (!selectedTicket.value) return 'Destek Ekibi'
  if (comment.user_id === selectedTicket.value.user_id) return 'Talep Sahibi'
  if (comment.user_id === authStore.user?.id) return 'Siz'
  return 'Destek Ekibi'
}

const saveStatusNote = async (ticketId) => {
  if (!statusNote.value.trim()) return { success: true, skipped: true }

  const { error } = await supabase
    .from('comments')
    .insert({
      ticket_id: ticketId,
      user_id: authStore.user.id,
      content: statusNote.value.trim(),
    })

  if (error) throw error
  return { success: true }
}

// ─── Durum Güncelle ───────────────────────────────────────
const handleStatusUpdate = async () => {
  if (!selectedTicket.value) return
  statusSaveError.value = ''
  statusSaveWarning.value = ''
  statusSaveSuccess.value = false

  const previousStatus = selectedTicket.value.status

  try {
    isSavingStatus.value = true

    const { error } = await supabase
      .from('tickets')
      .update({ status: newStatus.value })
      .eq('id', selectedTicket.value.id)

    if (error) throw error

    if (newStatus.value === 'resolved' && selectedTicket.value.asset_id) {
      const { error: assetStatusError } = await supabase
        .from('assets')
        .update({ status: 'Aktif' })
        .eq('id', selectedTicket.value.asset_id)

      if (assetStatusError) {
        statusSaveWarning.value = 'Ticket çözüldü, ancak ekipman durumu Aktif olarak güncellenemedi.'
      } else if (selectedTicket.value.assets) {
        selectedTicket.value.assets.status = 'Aktif'
      }
    }

    await saveStatusNote(selectedTicket.value.id)

    statusSaveSuccess.value = true

    // Listedeki talebin durumunu da güncelle
    const idx = allTickets.value.findIndex(t => t.id === selectedTicket.value.id)
    if (idx !== -1) {
      allTickets.value[idx].status = newStatus.value
    }
    selectedTicket.value.status = newStatus.value

    await logAction(
      'ticket_status_updated',
      'ticket',
      selectedTicket.value.id,
      `Kullanıcı ${authStore.fullName || authStore.user?.email || 'Bilinmeyen'} tarafından ticket durumu "${statusLabels[newStatus.value] || newStatus.value}" olarak güncellendi.`
    )

    // Ticket güncellemesinden bağımsız olarak bildirimi ayrı ele al
    const notificationPayload = buildStatusNotification({
      previousStatus,
      nextStatus: newStatus.value,
      ticket: selectedTicket.value,
    })

    if (notificationPayload) {
      const notificationResult = await notificationsStore.createNotification(notificationPayload)
      if (!notificationResult?.success) {
        statusSaveWarning.value = 'Durum güncellendi, ancak kullanıcı bildirimi gönderilemedi.'
      }
    }

    statusNote.value = ''
    await fetchComments(selectedTicket.value.id)

    // 1 saniye sonra success mesajını kapat
    setTimeout(() => {
      statusSaveSuccess.value = false
      statusSaveWarning.value = ''
    }, 2000)
  } catch (error) {
    console.error('Durum güncelleme hatası:', error)
    statusSaveError.value = 'Durum güncellenemedi: ' + error.message
  } finally {
    isSavingStatus.value = false
  }
}

// ─── Tarih Formatlama ─────────────────────────────────────
const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Talep Sahibi Adı ────────────────────────────────────
const getTicketOwner = (ticket) => {
  return ticket.requester_name || ticket.profiles?.full_name || 'Bilinmiyor'
}

onMounted(() => {
  fetchAllTickets()
})

const refreshOnResume = async () => {
  if (!authStore.isAuthenticated) return
  await fetchAllTickets()
}

onMounted(() => {
  window.addEventListener('techdesk:resume', refreshOnResume)
})

onUnmounted(() => {
  window.removeEventListener('techdesk:resume', refreshOnResume)
})
</script>

<template>
  <!-- Başlık -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-white">Tüm Destek Talepleri</h1>
    <p class="text-blue-300 mt-1">Gelen talepleri yönetin ve durumlarını güncelleyin.</p>
  </div>

  <!-- İstatistik Kartları -->
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="td-metric-card p-4 td-stagger" style="animation-delay: 120ms;">
      <p class="text-slate-400 text-xs">Toplam</p>
      <p class="text-2xl font-bold text-white mt-1">{{ stats.total }}</p>
    </div>
    <div class="td-metric-card p-4 td-stagger" style="animation-delay: 180ms;">
      <p class="text-slate-400 text-xs">Açık</p>
      <p class="text-2xl font-bold text-red-400 mt-1">{{ stats.open }}</p>
    </div>
    <div class="td-metric-card p-4 td-stagger" style="animation-delay: 240ms;">
      <p class="text-slate-400 text-xs">İşlemde</p>
      <p class="text-2xl font-bold text-amber-400 mt-1">{{ stats.in_progress }}</p>
    </div>
    <div class="td-metric-card p-4 td-stagger" style="animation-delay: 300ms;">
      <p class="text-slate-400 text-xs">Çözüldü</p>
      <p class="text-2xl font-bold text-emerald-400 mt-1">{{ stats.resolved }}</p>
    </div>
  </div>

  <!-- Filtre Tabları -->
  <div class="flex flex-wrap gap-2 mb-6">
    <button
      v-for="tab in filterTabs"
      :key="tab.key"
      @click="activeFilter = tab.key"
      :class="[
        'td-action-btn px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200',
        activeFilter === tab.key
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
          : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/10'
      ]"
    >
      {{ tab.label }}
      <span
        v-if="tab.key !== 'all'"
        class="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-white/10"
      >
        {{ tab.key === 'open' ? stats.open : tab.key === 'in_progress' ? stats.in_progress : stats.resolved }}
      </span>
    </button>
  </div>

  <!-- Yükleniyor -->
  <div v-if="isLoading" class="py-10 space-y-3">
    <div class="td-skeleton h-12 w-full"></div>
    <div class="td-skeleton h-12 w-full"></div>
    <div class="td-skeleton h-12 w-full"></div>
  </div>

  <!-- Boş Durum -->
  <div v-else-if="filteredTickets.length === 0" class="text-center py-16">
    <div class="text-5xl mb-4">📭</div>
    <p class="text-slate-400 text-lg">
      {{ activeFilter === 'all' ? 'Henüz talep bulunmuyor.' : `"${statusLabels[activeFilter]}" durumunda talep yok.` }}
    </p>
  </div>

  <!-- Talep Kartları -->
  <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    <div
      v-for="ticket in filteredTickets"
      :key="ticket.id"
      class="td-surface-card overflow-hidden hover:bg-white/[0.08] transition-all duration-200 flex flex-col td-stagger"
    >
      <!-- Kart Üst: Başlık + Öncelik -->
      <div class="p-5 flex-1">
        <div class="flex items-start justify-between gap-3 mb-3">
          <h3 class="text-white font-semibold text-sm leading-snug line-clamp-2 flex-1">
            {{ ticket.title }}
          </h3>
          <span :class="['px-2 py-0.5 text-[10px] font-bold rounded-full border whitespace-nowrap', priorityClasses[ticket.priority]]">
            {{ priorityIcons[ticket.priority] }} {{ priorityLabels[ticket.priority] }}
          </span>
        </div>

        <p class="text-slate-400 text-xs line-clamp-2 mb-4">{{ ticket.description }}</p>

        <!-- Meta Bilgiler -->
        <div class="space-y-1.5">
          <div class="flex items-center text-xs text-slate-500">
            <span class="mr-1.5">👤</span>
            <span>{{ getTicketOwner(ticket) }}</span>
          </div>
          <div class="flex items-center text-xs text-slate-500">
            <span class="mr-1.5">📅</span>
            <span>{{ formatDate(ticket.created_at) }}</span>
          </div>
        </div>
      </div>

      <!-- Kart Alt: Durum + Buton -->
      <div class="px-5 py-3 border-t border-white/5 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <span :class="['w-2 h-2 rounded-full', statusDotColors[ticket.status]]"></span>
          <span :class="['px-2.5 py-1 text-xs font-medium rounded-full border', statusClasses[ticket.status]]">
            {{ statusLabels[ticket.status] }}
          </span>
        </div>
        <button
          @click="openDetail(ticket)"
          class="td-action-btn px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg border border-blue-500/20 transition-all duration-200"
        >
          Detay Gör
        </button>
      </div>
    </div>
  </div>

  <!-- ═══════════════ DETAY MODAL ═══════════════ -->
  <Teleport to="body">
    <div
      v-if="showModal && selectedTicket"
      class="td-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <!-- Overlay -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeModal" />

      <!-- Modal İçerik -->
      <div class="td-modal-panel relative w-full max-w-xl bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl max-h-[85vh] overflow-y-auto">
        <!-- Başlık -->
        <div class="flex items-start justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-slate-800/95 backdrop-blur-xl z-10">
          <div class="flex-1 min-w-0 pr-4">
            <h3 class="text-lg font-semibold text-white leading-snug">{{ selectedTicket.title }}</h3>
            <p class="text-slate-400 text-xs mt-1">
              Talep No: {{ selectedTicket.id.substring(0, 8) }}...
            </p>
          </div>
          <button @click="closeModal" class="text-slate-400 hover:text-white transition-colors mt-1">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- İçerik -->
        <div class="px-6 py-5 space-y-5">
          <!-- Badge'ler -->
          <div class="flex flex-wrap gap-2">
            <span :class="['px-3 py-1 text-xs font-medium rounded-full border', statusClasses[selectedTicket.status]]">
              {{ statusLabels[selectedTicket.status] }}
            </span>
            <span :class="['px-3 py-1 text-xs font-medium rounded-full border', priorityClasses[selectedTicket.priority]]">
              {{ priorityIcons[selectedTicket.priority] }} {{ priorityLabels[selectedTicket.priority] }}
            </span>
          </div>

          <!-- Açıklama -->
          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Açıklama</label>
            <div class="bg-white/5 rounded-xl p-4 border border-white/10">
              <p class="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{{ selectedTicket.description || 'Açıklama girilmemiş.' }}</p>
            </div>
          </div>

          <!-- Talep Bilgileri -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Talep Sahibi</label>
              <p class="text-white text-sm">{{ getTicketOwner(selectedTicket) }}</p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Oluşturulma</label>
              <p class="text-white text-sm">{{ formatDate(selectedTicket.created_at) }}</p>
            </div>
          </div>

          <div
            v-if="selectedTicket.asset_id && selectedTicket.assets"
            class="bg-white/5 border border-white/10 border-l-4 border-l-blue-500 rounded-xl p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-1">İlgili Ekipman</p>
                <p class="text-sm font-semibold text-white">
                  {{ selectedTicket.assets.name || 'Ekipman adı bulunamadı' }}
                </p>
                <p class="text-xs text-slate-300 mt-1">
                  Seri No: {{ selectedTicket.assets.serial_number || '-' }}
                </p>
              </div>
              <span
                :class="[
                  'px-2.5 py-1 text-xs font-medium rounded-full border',
                  selectedTicket.assets.status === 'Aktif'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : selectedTicket.assets.status === 'Arizali'
                      ? 'bg-red-100 text-red-800 border-red-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                ]"
              >
                {{ selectedTicket.assets.status === 'Arizali' ? 'Arızalı' : (selectedTicket.assets.status || 'Bilinmiyor') }}
              </span>
            </div>
          </div>

          <div
            v-if="selectedTicket.asset_id"
            class="bg-slate-700/40 rounded-xl p-4 border border-slate-500/30"
          >
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Ekipman Geçmişi</label>

            <div
              v-if="assetHistoryError"
              class="bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 rounded-lg text-xs mb-3"
            >
              {{ assetHistoryError }}
            </div>

            <div v-if="isLoadingAssetHistory" class="text-slate-300 text-xs">
              Cihaza ait geçmiş talepler yükleniyor...
            </div>

            <div v-else-if="assetHistory.length === 0" class="text-slate-300 text-xs">
              Bu cihaza ait daha önce açılmış başka talep bulunmuyor.
            </div>

            <div v-else class="space-y-2">
              <div
                v-for="historyTicket in assetHistory"
                :key="historyTicket.id"
                class="bg-slate-900/40 border border-white/10 rounded-lg p-3"
              >
                <div class="flex items-center justify-between gap-3 mb-1.5">
                  <p class="text-xs text-slate-300">{{ formatDate(historyTicket.created_at) }}</p>
                  <span :class="['px-2 py-0.5 text-[10px] font-medium rounded-full border', statusClasses[historyTicket.status]]">
                    {{ statusLabels[historyTicket.status] }}
                  </span>
                </div>
                <p class="text-sm text-white font-medium leading-snug">{{ historyTicket.title || 'Ariza Nedeni belirtilmemis' }}</p>
                <p
                  v-if="historyTicket.description"
                  class="text-xs text-slate-400 mt-1 line-clamp-2"
                >
                  {{ historyTicket.description }}
                </p>
              </div>
            </div>
          </div>

          <!-- Destek Notları -->
          <div class="bg-white/5 rounded-xl p-4 border border-white/10">
            <div class="flex items-center justify-between mb-3">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Destek Notları</label>
              <span class="text-[11px] text-slate-500">Son kullanıcı tarafından görüntülenir</span>
            </div>

            <div
              v-if="commentsError"
              class="bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 rounded-lg text-xs mb-3"
            >
              {{ commentsError }}
            </div>

            <div v-if="isLoadingComments" class="text-slate-400 text-xs mb-3">
              Notlar yükleniyor...
            </div>

            <div v-else-if="comments.length === 0" class="text-slate-500 text-xs mb-3">
              Bu talep için henüz destek notu eklenmemiş.
            </div>

            <div v-else class="space-y-3 mb-4 max-h-52 overflow-y-auto pr-1">
              <div
                v-for="comment in comments"
                :key="comment.id"
                class="rounded-xl border border-white/10 bg-slate-900/40 p-3"
              >
                <div class="flex items-center justify-between gap-3 mb-1.5">
                  <p class="text-xs font-semibold text-blue-200">{{ getCommentAuthor(comment) }}</p>
                  <p class="text-[11px] text-slate-500 whitespace-nowrap">{{ formatDate(comment.created_at) }}</p>
                </div>
                <p class="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{{ comment.content }}</p>
              </div>
            </div>

            <textarea
              v-model="statusNote"
              rows="4"
              placeholder="Durum güncellerken kullanıcıya görünecek bir açıklama veya çözüm notu ekleyin..."
              class="w-full px-4 py-3 bg-slate-900/40 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <!-- Durum Değiştirme -->
          <div class="bg-white/5 rounded-xl p-4 border border-white/10">
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Durum Güncelle</label>

            <div
              v-if="articleSaveSuccess"
              class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 px-3 py-2 rounded-lg text-xs mb-3"
            >
              ✅ Makale oluşturuldu.
            </div>

            <!-- Başarı Mesajı -->
            <div
              v-if="statusSaveSuccess"
              class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 px-3 py-2 rounded-lg text-xs mb-3"
            >
              ✅ Durum başarıyla güncellendi!
            </div>

            <!-- Hata Mesajı -->
            <div
              v-if="statusSaveError"
              class="bg-red-500/20 border border-red-500/50 text-red-300 px-3 py-2 rounded-lg text-xs mb-3"
            >
              {{ statusSaveError }}
            </div>

            <div
              v-if="statusSaveWarning"
              class="bg-amber-500/20 border border-amber-500/50 text-amber-200 px-3 py-2 rounded-lg text-xs mb-3"
            >
              {{ statusSaveWarning }}
            </div>

            <div class="flex items-center gap-3">
              <select
                v-model="newStatus"
                class="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              >
                <option value="open" class="bg-slate-800">🔴 Açık</option>
                <option value="in_progress" class="bg-slate-800">🟡 İşlemde</option>
                <option value="resolved" class="bg-slate-800">🟢 Çözüldü</option>
              </select>
              <button
                @click="handleStatusUpdate"
                :disabled="isSavingStatus || newStatus === selectedTicket.status"
                :class="[
                  'px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 whitespace-nowrap',
                  newStatus !== selectedTicket.status
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-white/5 text-slate-500 cursor-not-allowed'
                ]"
              >
                <span v-if="isSavingStatus">Kaydediliyor...</span>
                <span v-else>Kaydet</span>
              </button>
            </div>

            <div class="mt-3">
              <button
                v-if="selectedTicket.status === 'resolved'"
                type="button"
                @click="openCreateArticleModal"
                class="inline-flex items-center rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
              >
                Bilgi Bankasina Kaydet
              </button>
            </div>
          </div>
        </div>

        <!-- Alt Butonlar -->
        <div class="flex items-center justify-end px-6 py-4 border-t border-white/10">
          <button
            @click="closeModal"
            class="px-5 py-2.5 text-slate-300 hover:text-white text-sm font-medium rounded-xl hover:bg-white/5 transition-all duration-200"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <CreateArticleFromTicket
    :open="showCreateArticleModal"
    :ticket="selectedTicket"
    :comments="comments"
    @close="closeCreateArticleModal"
    @saved="handleArticleSaved"
  />
</template>
