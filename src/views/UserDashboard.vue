<!--
  UserDashboard.vue — Personel (User) Paneli
  ============================================
  Kullanıcının kendi destek taleplerini yönettiği ana sayfa.

  Özellikler:
  - "Yeni Talep Oluştur" butonu + modal (Başlık, Açıklama, Öncelik)
  - Kullanıcının kendi taleplerini listeleyen tablo
  - Durum badge'leri: Açık=Kırmızı, İşlemde=Sarı, Çözüldü=Yeşil
  - Supabase tickets tablosuyla CRUD entegrasyonu
-->

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabaseClient'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

// ─── Talep Listesi State ─────────────────────────────────
const tickets = ref([])
const isLoadingTickets = ref(true)

// ─── Modal State ──────────────────────────────────────────
const showModal = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)
const showDetailModal = ref(false)
const selectedTicket = ref(null)
const ticketComments = ref([])
const isLoadingComments = ref(false)
const commentsError = ref('')
const ratingsByTicketId = ref({})
const showRatingModal = ref(false)
const selectedRatingTicket = ref(null)
const ratingScore = ref(0)
const ratingComment = ref('')
const isSubmittingRating = ref(false)
const ratingError = ref('')
const assignedAssets = ref([])
const isLoadingAssets = ref(false)

// ─── Yeni Talep Form Verileri ─────────────────────────────
const newTicket = ref({
  title: '',
  description: '',
  priority: 'medium', // Varsayılan öncelik
  asset_id: '',
})

// ─── Etiket Tanımları ─────────────────────────────────────
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
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
}

// ─── Talepleri Getir ──────────────────────────────────────
const fetchTickets = async () => {
  isLoadingTickets.value = true
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('user_id', authStore.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    tickets.value = data || []
    await fetchRatings()
  } catch (error) {
    console.error('Talepler yüklenirken hata:', error)
  } finally {
    isLoadingTickets.value = false
  }
}

const fetchRatings = async () => {
  if (!authStore.user?.id) {
    ratingsByTicketId.value = {}
    return
  }

  try {
    const { data, error } = await supabase
      .from('ratings')
      .select('ticket_id, score, comment')
      .eq('user_id', authStore.user.id)

    if (error) throw error

    ratingsByTicketId.value = Object.fromEntries(
      (data || []).map((rating) => [
        rating.ticket_id,
        { score: rating.score, comment: rating.comment || '' },
      ])
    )
  } catch (error) {
    console.error('Değerlendirmeler yüklenirken hata:', error)
  }
}

const fetchAssignedAssets = async () => {
  if (!authStore.user?.id) {
    assignedAssets.value = []
    return
  }

  isLoadingAssets.value = true
  try {
    const { data, error } = await supabase
      .from('assets')
      .select('id, name')
      .eq('assigned_to', authStore.user.id)
      .order('name', { ascending: true })

    if (error) throw error
    assignedAssets.value = data || []
  } catch (error) {
    console.error('Atanan ekipmanlar yüklenirken hata:', error)
    assignedAssets.value = []
  } finally {
    isLoadingAssets.value = false
  }
}

// ─── Modal Aç/Kapat ──────────────────────────────────────
const openModal = () => {
  newTicket.value = { title: '', description: '', priority: 'medium', asset_id: '' }
  saveError.value = ''
  saveSuccess.value = false
  showModal.value = true
  fetchAssignedAssets()
}

const closeModal = () => {
  showModal.value = false
  // /tickets/new'den açıldıysa /tickets'e geri dön
  if (route.path === '/tickets/new') {
    router.replace('/tickets')
  }
}

const openDetailModal = async (ticket) => {
  selectedTicket.value = ticket
  showDetailModal.value = true
  await fetchTicketComments(ticket.id)
}

const openRatingModal = (ticket) => {
  selectedRatingTicket.value = ticket
  ratingScore.value = 0
  ratingComment.value = ''
  ratingError.value = ''
  showRatingModal.value = true
}

const closeRatingModal = () => {
  showRatingModal.value = false
  selectedRatingTicket.value = null
  ratingScore.value = 0
  ratingComment.value = ''
  ratingError.value = ''
}

const closeDetailModal = () => {
  showDetailModal.value = false
  selectedTicket.value = null
  ticketComments.value = []
  commentsError.value = ''
}

const getTicketRating = (ticketId) => ratingsByTicketId.value[ticketId] || null

const submitRating = async () => {
  if (!selectedRatingTicket.value) return
  if (!ratingScore.value) {
    ratingError.value = 'Lütfen 1 ile 5 arasında bir puan seçin.'
    return
  }

  try {
    isSubmittingRating.value = true
    ratingError.value = ''

    const { error } = await supabase
      .from('ratings')
      .insert({
        ticket_id: selectedRatingTicket.value.id,
        user_id: authStore.user.id,
        score: ratingScore.value,
        comment: ratingComment.value.trim(),
      })

    if (error) throw error

    ratingsByTicketId.value = {
      ...ratingsByTicketId.value,
      [selectedRatingTicket.value.id]: {
        score: ratingScore.value,
        comment: ratingComment.value.trim(),
      },
    }

    closeRatingModal()
  } catch (error) {
    console.error('Değerlendirme kaydedilemedi:', error)
    ratingError.value = `Değerlendirme kaydedilemedi: ${error.message}`
  } finally {
    isSubmittingRating.value = false
  }
}

// ─── Yeni Talep Kaydet ────────────────────────────────────
const handleSaveTicket = async () => {
  saveError.value = ''
  saveSuccess.value = false

  // Validasyon
  if (!newTicket.value.title.trim()) {
    saveError.value = 'Başlık alanı zorunludur.'
    return
  }
  if (!newTicket.value.description.trim()) {
    saveError.value = 'Açıklama alanı zorunludur.'
    return
  }

  try {
    isSaving.value = true

    const { data, error } = await supabase
      .from('tickets')
      .insert({
        title: newTicket.value.title.trim(),
        description: newTicket.value.description.trim(),
        priority: newTicket.value.priority,
        asset_id: newTicket.value.asset_id || null,
        user_id: authStore.user.id,
        status: 'open',
      })
      .select()

    if (error) throw error
    const createdTicketId = data?.[0]?.id

    // Not: IT Personeli talebi çözdüğünde cihaz durumu tekrar 'Aktif' yapılabilir,
    // bu özellik IT Dashboard'da yönetilebilir.
    if (newTicket.value.asset_id) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('mark_assigned_asset_faulty', {
        target_asset_id: newTicket.value.asset_id,
      })

      if (rpcError || !rpcData?.ok) {
        // Asset durumu güncellenemezse ticket kaydını geri al.
        if (createdTicketId) {
          await supabase
            .from('tickets')
            .delete()
            .eq('id', createdTicketId)
        }
        throw new Error(rpcError?.message || 'Seçilen ekipman durumu güncellenemedi.')
      }
    }

    // Başarılı → listeye ekle ve modalı kapat
    saveSuccess.value = true
    setTimeout(() => {
      showModal.value = false
      // /tickets'e yönlendir
      if (route.path !== '/tickets') {
        router.replace('/tickets')
      }
      fetchTickets() // Listeyi yenile
    }, 800)
  } catch (error) {
    console.error('Talep oluşturma hatası:', error)
    saveError.value = 'Talep oluşturulamadı: ' + error.message
  } finally {
    isSaving.value = false
  }
}

const fetchTicketComments = async (ticketId) => {
  ticketComments.value = []
  commentsError.value = ''
  isLoadingComments.value = true

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (error) throw error
    ticketComments.value = data || []
  } catch (error) {
    console.error('Destek notları yüklenirken hata:', error)
    commentsError.value = 'Destek notları yüklenemedi.'
  } finally {
    isLoadingComments.value = false
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

const getCommentAuthor = (comment) => {
  if (comment.user_id === authStore.user?.id) return 'Siz'
  return 'Destek Ekibi'
}

// ─── Route değişikliğini izle ─────────────────────────────
// /tickets/new'e gidildiğinde modal otomatik açılır
watch(() => route.path, (newPath) => {
  if (newPath === '/tickets/new') {
    openModal()
  }
}, { immediate: true })

// Sayfa yüklendiğinde talepleri getir
onMounted(() => {
  fetchAssignedAssets()
  fetchTickets()
})

const refreshOnResume = async () => {
  if (!authStore.isAuthenticated) return
  await fetchAssignedAssets()
  await fetchTickets()
}

onMounted(() => {
  window.addEventListener('techdesk:resume', refreshOnResume)
})

onUnmounted(() => {
  window.removeEventListener('techdesk:resume', refreshOnResume)
})
</script>

<template>
  <!-- Başlık + Yeni Talep Butonu -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
    <div>
      <h1 class="text-3xl font-bold text-white">Taleplerim</h1>
      <p class="text-blue-300 mt-1">Destek taleplerinizi buradan yönetin.</p>
    </div>
    <button
      @click="openModal"
      class="td-action-btn inline-flex items-center space-x-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98]"
    >
      <span class="text-lg">➕</span>
      <span>Yeni Talep Oluştur</span>
    </button>
  </div>

  <!-- İstatistik Kartları -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
    <div class="td-metric-card p-5 td-stagger" style="animation-delay: 120ms;">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-slate-400 text-sm">Açık</p>
          <p class="text-2xl font-bold text-red-400 mt-1">
            {{ tickets.filter(t => t.status === 'open').length }}
          </p>
        </div>
        <div class="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-xl">📋</div>
      </div>
    </div>
    <div class="td-metric-card p-5 td-stagger" style="animation-delay: 180ms;">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-slate-400 text-sm">İşlemde</p>
          <p class="text-2xl font-bold text-amber-400 mt-1">
            {{ tickets.filter(t => t.status === 'in_progress').length }}
          </p>
        </div>
        <div class="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center text-xl">⏳</div>
      </div>
    </div>
    <div class="td-metric-card p-5 td-stagger" style="animation-delay: 240ms;">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-slate-400 text-sm">Çözüldü</p>
          <p class="text-2xl font-bold text-emerald-400 mt-1">
            {{ tickets.filter(t => t.status === 'resolved').length }}
          </p>
        </div>
        <div class="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-xl">✅</div>
      </div>
    </div>
  </div>

  <!-- Talep Tablosu -->
  <div class="td-surface-card overflow-hidden td-stagger" style="animation-delay: 180ms;">
    <!-- Tablo Başlık -->
    <div class="px-6 py-4 border-b border-white/10">
      <h2 class="text-lg font-semibold text-white">Destek Taleplerim</h2>
    </div>

    <!-- Yükleniyor -->
    <div v-if="isLoadingTickets" class="p-8">
      <div class="td-skeleton h-6 w-44 mb-4"></div>
      <div class="td-skeleton h-14 w-full mb-3"></div>
      <div class="td-skeleton h-14 w-full mb-3"></div>
      <div class="td-skeleton h-14 w-full"></div>
    </div>

    <!-- Boş Durum -->
    <div v-else-if="tickets.length === 0" class="p-12 text-center">
      <div class="text-5xl mb-4">📭</div>
      <p class="text-slate-400 text-lg mb-2">Henüz bir talebiniz bulunmuyor.</p>
      <p class="text-slate-500 text-sm">Yukarıdaki "Yeni Talep Oluştur" butonuna tıklayarak ilk talebinizi açabilirsiniz.</p>
    </div>

    <!-- Tablo İçeriği -->
    <div v-else class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-white/10">
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Başlık</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Öncelik</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Durum</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Tarih</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Değerlendirme</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Detay</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="ticket in tickets"
            :key="ticket.id"
            class="td-table-row border-b border-white/5 transition-colors duration-150"
          >
            <!-- Başlık + Açıklama -->
            <td class="px-6 py-4">
              <p class="text-white font-medium text-sm">{{ ticket.title }}</p>
              <p class="text-slate-400 text-xs mt-1 line-clamp-1">{{ ticket.description }}</p>
            </td>
            <!-- Öncelik Badge -->
            <td class="px-6 py-4">
              <span :class="['px-2.5 py-1 text-xs font-medium rounded-full border', priorityClasses[ticket.priority]]">
                {{ priorityLabels[ticket.priority] }}
              </span>
            </td>
            <!-- Durum Badge -->
            <td class="px-6 py-4">
              <span :class="['px-2.5 py-1 text-xs font-medium rounded-full border', statusClasses[ticket.status]]">
                {{ statusLabels[ticket.status] }}
              </span>
            </td>
            <!-- Tarih -->
            <td class="px-6 py-4 text-slate-400 text-sm whitespace-nowrap">
              {{ formatDate(ticket.created_at) }}
            </td>
            <td class="px-6 py-4">
              <template v-if="ticket.status === 'resolved'">
                <button
                  v-if="!getTicketRating(ticket.id)"
                  @click="openRatingModal(ticket)"
                class="td-action-btn px-3 py-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 rounded-lg border border-amber-500/20 transition-all duration-200"
                >
                  Çözümü Değerlendir
                </button>
                <span
                  v-else
                  class="inline-flex px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                >
                  Değerlendirildi (Puan: {{ getTicketRating(ticket.id).score }})
                </span>
              </template>
              <span v-else class="text-slate-500 text-xs">-</span>
            </td>
            <td class="px-6 py-4">
              <button
                @click="openDetailModal(ticket)"
                class="td-action-btn px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg border border-blue-500/20 transition-all duration-200"
              >
                Detay
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ═══════════════ YENİ TALEP MODAL ═══════════════ -->
  <Teleport to="body">
    <div
      v-if="showModal"
      class="td-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <!-- Arka plan overlay -->
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="closeModal"
      />

      <!-- Modal İçeriği -->
      <div class="td-modal-panel relative w-full max-w-lg bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
        <!-- Modal Başlık -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 class="text-xl font-semibold text-white">Yeni Destek Talebi</h3>
          <button
            @click="closeModal"
            class="text-slate-400 hover:text-white transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Modal Form -->
        <form @submit.prevent="handleSaveTicket" class="px-6 py-5 space-y-5">
          <!-- Hata Mesajı -->
          <div
            v-if="saveError"
            class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm"
          >
            {{ saveError }}
          </div>

          <!-- Başarı Mesajı -->
          <div
            v-if="saveSuccess"
            class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 px-4 py-3 rounded-xl text-sm"
          >
            ✅ Talep başarıyla oluşturuldu!
          </div>

          <!-- Başlık -->
          <div>
            <label for="ticketTitle" class="block text-sm font-medium text-blue-200 mb-2">
              Başlık <span class="text-red-400">*</span>
            </label>
            <input
              id="ticketTitle"
              v-model="newTicket.title"
              type="text"
              required
              placeholder="Örn: Yazıcı çalışmıyor"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <!-- Açıklama -->
          <div>
            <label for="ticketDesc" class="block text-sm font-medium text-blue-200 mb-2">
              Açıklama <span class="text-red-400">*</span>
            </label>
            <textarea
              id="ticketDesc"
              v-model="newTicket.description"
              required
              rows="4"
              placeholder="Sorunun detaylarını yazın..."
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
            />
          </div>

          <!-- Öncelik -->
          <div>
            <label for="ticketPriority" class="block text-sm font-medium text-blue-200 mb-2">
              Öncelik
            </label>
            <select
              id="ticketPriority"
              v-model="newTicket.priority"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            >
              <option value="low" class="bg-slate-800">Düşük</option>
              <option value="medium" class="bg-slate-800">Orta</option>
              <option value="high" class="bg-slate-800">Yüksek</option>
              <option value="critical" class="bg-slate-800">Kritik</option>
            </select>
          </div>

          <div>
            <label for="ticketAsset" class="block text-sm font-medium text-blue-200 mb-2">
              İlgili Ekipman
            </label>
            <select
              id="ticketAsset"
              v-model="newTicket.asset_id"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            >
              <option value="" class="bg-slate-800">
                {{ isLoadingAssets ? 'Ekipmanlar yükleniyor...' : 'Seçmek istemiyorum' }}
              </option>
              <option
                v-for="asset in assignedAssets"
                :key="asset.id"
                :value="asset.id"
                class="bg-slate-800"
              >
                {{ asset.name }}
              </option>
            </select>
            <p class="text-xs text-slate-400 mt-2">
              Üzerinize atanmış cihazlardan birini seçebilirsiniz.
            </p>
          </div>
        </form>

        <!-- Modal Alt Butonlar -->
        <div class="flex items-center justify-end space-x-3 px-6 py-4 border-t border-white/10">
          <button
            @click="closeModal"
            type="button"
            class="px-5 py-2.5 text-slate-300 hover:text-white text-sm font-medium rounded-xl hover:bg-white/5 transition-all duration-200"
          >
            İptal
          </button>
          <button
            @click="handleSaveTicket"
            :disabled="isSaving"
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30"
          >
            <span v-if="isSaving">Kaydediliyor...</span>
            <span v-else>Kaydet</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="showRatingModal && selectedRatingTicket"
      class="td-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeRatingModal" />

      <div class="td-modal-panel relative w-full max-w-lg bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h3 class="text-xl font-semibold text-white">Çözümü Değerlendir</h3>
            <p class="text-slate-400 text-xs mt-1">{{ selectedRatingTicket.title }}</p>
          </div>
          <button @click="closeRatingModal" class="text-slate-400 hover:text-white transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="px-6 py-5 space-y-5">
          <div v-if="ratingError" class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm">
            {{ ratingError }}
          </div>

          <div>
            <label class="block text-sm font-medium text-blue-200 mb-3">Puanınız</label>
            <div class="flex items-center gap-2">
              <button
                v-for="star in 5"
                :key="star"
                type="button"
                @click="ratingScore = star"
                class="transition-transform hover:scale-110"
              >
                <svg
                  class="w-8 h-8"
                  :class="star <= ratingScore ? 'text-amber-400' : 'text-slate-500'"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="m9.049 2.927 1.902 3.855 4.255.619-3.079 3.001.727 4.238L9 12.347l-3.806 2.293.727-4.238L2.842 7.4l4.255-.619L9.05 2.927Z" />
                </svg>
              </button>
            </div>
          </div>

          <div>
            <label for="ratingComment" class="block text-sm font-medium text-blue-200 mb-2">Yorumunuz (Opsiyonel)</label>
            <textarea
              id="ratingComment"
              v-model="ratingComment"
              rows="4"
              placeholder="Çözüm süreciyle ilgili geri bildiriminizi yazabilirsiniz..."
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
            />
          </div>
        </div>

        <div class="flex items-center justify-end space-x-3 px-6 py-4 border-t border-white/10">
          <button
            @click="closeRatingModal"
            type="button"
            class="px-5 py-2.5 text-slate-300 hover:text-white text-sm font-medium rounded-xl hover:bg-white/5 transition-all duration-200"
          >
            İptal
          </button>
          <button
            @click="submitRating"
            :disabled="isSubmittingRating"
            class="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-amber-700 disabled:cursor-not-allowed text-slate-950 text-sm font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-amber-500/30"
          >
            <span v-if="isSubmittingRating">Gönderiliyor...</span>
            <span v-else>Gönder</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ═══════════════ TALEP DETAY MODAL ═══════════════ -->
  <Teleport to="body">
    <div
      v-if="showDetailModal && selectedTicket"
      class="td-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="closeDetailModal"
      />

      <div class="td-modal-panel relative w-full max-w-2xl bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div class="flex items-start justify-between px-6 py-4 border-b border-white/10 sticky top-0 bg-slate-800/95 backdrop-blur-xl z-10">
          <div class="flex-1 min-w-0 pr-4">
            <h3 class="text-lg font-semibold text-white leading-snug">{{ selectedTicket.title }}</h3>
            <p class="text-slate-400 text-xs mt-1">
              Talep No: {{ selectedTicket.id.substring(0, 8) }}...
            </p>
          </div>
          <button
            @click="closeDetailModal"
            class="text-slate-400 hover:text-white transition-colors mt-1"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="px-6 py-5 space-y-5">
          <div class="flex flex-wrap gap-2">
            <span :class="['px-3 py-1 text-xs font-medium rounded-full border', statusClasses[selectedTicket.status]]">
              {{ statusLabels[selectedTicket.status] }}
            </span>
            <span :class="['px-3 py-1 text-xs font-medium rounded-full border', priorityClasses[selectedTicket.priority]]">
              {{ priorityLabels[selectedTicket.priority] }}
            </span>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Talep Açıklaması</label>
            <div class="bg-white/5 rounded-xl p-4 border border-white/10">
              <p class="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{{ selectedTicket.description || 'Açıklama girilmemiş.' }}</p>
            </div>
          </div>

          <div class="bg-white/5 rounded-xl p-4 border border-white/10">
            <div class="flex items-center justify-between mb-3">
              <label class="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Destek Notları</label>
              <span class="text-[11px] text-slate-500">IT/Admin tarafından eklenir</span>
            </div>

            <div
              v-if="commentsError"
              class="bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 rounded-lg text-xs mb-3"
            >
              {{ commentsError }}
            </div>

            <div v-if="isLoadingComments" class="text-slate-400 text-xs">
              Notlar yükleniyor...
            </div>

            <div v-else-if="ticketComments.length === 0" class="text-slate-500 text-sm">
              Bu talep için henüz destek notu bulunmuyor.
            </div>

            <div v-else class="space-y-3">
              <div
                v-for="comment in ticketComments"
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
          </div>
        </div>

        <div class="flex items-center justify-end px-6 py-4 border-t border-white/10">
          <button
            @click="closeDetailModal"
            class="px-5 py-2.5 text-slate-300 hover:text-white text-sm font-medium rounded-xl hover:bg-white/5 transition-all duration-200"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
