<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/stores/auth'
import { useLogger } from '@/utils/useLogger'

const assets = ref([])
const profiles = ref([])
const isLoading = ref(true)
const isProfilesLoading = ref(false)
const isSaving = ref(false)
const deletingAssetId = ref(null)
const loadError = ref('')
const saveError = ref('')
const saveSuccess = ref(false)
const searchQuery = ref('')

const showModal = ref(false)
const isEditing = ref(false)
const editingAssetId = ref(null)

const form = ref({
  name: '',
  serial_number: '',
  category: 'Laptop',
  status: 'Aktif',
  assigned_to: '',
})

const categorySuggestions = ['Laptop', 'Yazıcı', 'Monitör', 'Masaüstü PC', 'Telefon', 'Tablet']
const statusOptions = ['Aktif', 'Arizali', 'Depoda']
const REQUEST_TIMEOUT_MS = 12000
const authStore = useAuthStore()
const { logAction } = useLogger()

const statusClasses = {
  Aktif: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40',
  Arizali: 'bg-red-500/20 text-red-200 border border-red-400/40',
  Depoda: 'bg-amber-500/20 text-amber-200 border border-amber-400/40',
}

const statusLabels = {
  Aktif: 'Aktif',
  Arizali: 'Arızalı',
  'Arızalı': 'Arızalı',
  Depoda: 'Depoda',
}

const filteredAssets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return assets.value

  return assets.value.filter((asset) => {
    const nameMatch = asset.name.toLowerCase().includes(query)
    const serialMatch = asset.serial_number.toLowerCase().includes(query)
    return nameMatch || serialMatch
  })
})

const stats = computed(() => ({
  total: assets.value.length,
  active: assets.value.filter(asset => asset.status === 'Aktif').length,
  faulty: assets.value.filter(asset => asset.status === 'Arizali').length,
  warehouse: assets.value.filter(asset => asset.status === 'Depoda').length,
}))

const profilesById = computed(() => {
  const mapped = new Map()
  for (const profile of profiles.value) {
    if (profile?.id) mapped.set(profile.id, profile.full_name || '')
  }
  return mapped
})

const mapAssetRow = (asset) => ({
  id: asset.id,
  name: asset.name || 'Adsız demirbaş',
  serial_number: asset.serial_number || '-',
  category: asset.category || '-',
  status: asset.status || 'Depoda',
  assigned_to: asset.assigned_to || null,
  assigned_name: asset.profiles?.full_name?.trim() || '',
  created_at: asset.created_at,
})

const getAssignedName = (asset) => {
  if (!asset.assigned_to) return 'Atanmamış'
  const mappedName = profilesById.value.get(asset.assigned_to)
  if (mappedName?.trim()) return mappedName.trim()
  if (asset.assigned_name?.trim()) return asset.assigned_name.trim()
  return 'Atanmamış'
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const withTimeout = async (promise, timeoutMs = REQUEST_TIMEOUT_MS) => {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('İşlem zaman aşımına uğradı'))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

const resetForm = () => {
  form.value = {
    name: '',
    serial_number: '',
    category: 'Laptop',
    status: 'Aktif',
    assigned_to: '',
  }
  saveError.value = ''
  saveSuccess.value = false
  isEditing.value = false
  editingAssetId.value = null
}

const openCreateModal = async () => {
  resetForm()
  showModal.value = true
  if (!profiles.value.length) {
    await fetchProfiles()
  }
}

const openEditModal = async (asset) => {
  saveError.value = ''
  saveSuccess.value = false
  isEditing.value = true
  editingAssetId.value = asset.id
  form.value = {
    name: asset.name,
    serial_number: asset.serial_number,
    category: asset.category,
    status: asset.status,
    assigned_to: asset.assigned_to || '',
  }
  showModal.value = true
  if (!profiles.value.length) {
    await fetchProfiles()
  }
}

const closeModal = () => {
  showModal.value = false
  resetForm()
}

const fetchProfiles = async () => {
  isProfilesLoading.value = true
  saveError.value = ''
  try {
    // Önceki admin ekranlarıyla uyumlu: varsa RPC ile tüm profil isimlerini çek.
    const { data: rpcData, error: rpcError } = await withTimeout(
      supabase.rpc('admin_list_profiles', { payload: {} }),
      7000
    )

    if (!rpcError && Array.isArray(rpcData)) {
      profiles.value = rpcData.map(profile => ({
        id: profile.id,
        full_name: profile.full_name || '',
      }))
      return
    }

    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name', { ascending: true }),
      7000
    )

    if (error) throw error
    profiles.value = data || []
  } catch (error) {
    console.error('Kullanıcı listesi yükleme hatası:', error)
    saveError.value = 'Kullanıcı listesi yüklenemedi. admin_list_profiles RPC veya profiles SELECT izinlerini kontrol edin.'
  } finally {
    isProfilesLoading.value = false
  }
}

const fetchAssets = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    const { data, error } = await supabase
      .from('assets')
      .select(`
        *,
        profiles!assets_assigned_to_fkey(full_name)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    assets.value = (data || []).map(mapAssetRow)
  } catch (error) {
    console.error('Demirbaşlar yüklenirken hata:', error)
    loadError.value = 'Demirbaşlar yüklenemedi. "assets" tablosu ve ilişkileri kontrol edin.'
  } finally {
    isLoading.value = false
  }
}

const validateForm = () => {
  if (!form.value.name.trim()) {
    saveError.value = 'Demirbaş adı zorunludur.'
    return false
  }
  if (!form.value.serial_number.trim()) {
    saveError.value = 'Seri no zorunludur.'
    return false
  }
  if (!form.value.category.trim()) {
    saveError.value = 'Kategori zorunludur.'
    return false
  }
  if (!form.value.status) {
    saveError.value = 'Durum seçiniz.'
    return false
  }
  return true
}

const saveAsset = async () => {
  saveError.value = ''
  saveSuccess.value = false

  if (!validateForm()) return

  const payload = {
    name: form.value.name.trim(),
    serial_number: form.value.serial_number.trim(),
    category: form.value.category.trim(),
    status: form.value.status,
    assigned_to: form.value.assigned_to || null,
  }

  try {
    isSaving.value = true
    const previousAsset = isEditing.value
      ? assets.value.find(asset => asset.id === editingAssetId.value)
      : null
    const previousAssignedTo = previousAsset?.assigned_to || null

    if (isEditing.value && editingAssetId.value) {
      const { error } = await supabase
        .from('assets')
        .update(payload)
        .eq('id', editingAssetId.value)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('assets')
        .insert(payload)

      if (error) throw error
    }

    if (payload.assigned_to && payload.assigned_to !== previousAssignedTo) {
      const assignedPersonName =
        profiles.value.find(profile => profile.id === payload.assigned_to)?.full_name ||
        'Bilinmeyen Kullanıcı'
      await logAction(
        'asset_assigned',
        'asset',
        isEditing.value ? editingAssetId.value : payload.serial_number,
        `${payload.name} cihazı ${assignedPersonName} kullanıcısına atandı.`
      )
    }

    saveSuccess.value = true
    await fetchAssets()

    setTimeout(() => {
      closeModal()
    }, 500)
  } catch (error) {
    console.error('Demirbaş kaydetme hatası:', error)
    if (error.message?.toLowerCase().includes('duplicate')) {
      saveError.value = 'Bu seri no zaten kayıtlı.'
      return
    }
    saveError.value = `Kayıt işlemi başarısız: ${error.message}`
  } finally {
    isSaving.value = false
  }
}

const deleteAsset = async (asset) => {
  const confirmed = window.confirm(`${asset.name} demirbaşını silmek istediğinize emin misiniz?`)
  if (!confirmed) return

  deletingAssetId.value = asset.id
  try {
    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', asset.id)

    if (error) throw error

    assets.value = assets.value.filter(item => item.id !== asset.id)
  } catch (error) {
    console.error('Demirbaş silme hatası:', error)
    window.alert(`Demirbaş silinemedi: ${error.message}`)
  } finally {
    deletingAssetId.value = null
  }
}

onMounted(async () => {
  await fetchProfiles()
  await fetchAssets()
})
</script>

<template>
  <div class="min-h-[70vh] bg-gradient-to-br from-slate-900/80 via-blue-950/70 to-slate-900/80 rounded-2xl border border-white/10 p-5 md:p-8">
    <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-8">
      <div>
        <h1 class="text-3xl font-bold text-white">Demirbaş Yönetimi</h1>
        <p class="text-blue-200/90 mt-1">Kurumdaki cihazları, durumlarını ve atamalarını merkezi olarak yönetin.</p>
      </div>

      <div class="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
        <div class="relative flex-1 xl:w-80">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="İsme veya seri no'ya göre ara..."
            class="w-full px-4 py-3 pl-11 rounded-2xl bg-white/10 border border-white/15 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg class="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
        </div>

        <button
          @click="openCreateModal"
          class="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl border border-blue-400/30 shadow-lg shadow-blue-600/25 transition-all"
        >
          + Yeni Demirbaş Ekle
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
      <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15">
        <p class="text-slate-400 text-xs uppercase tracking-wider">Toplam</p>
        <p class="text-2xl font-bold text-white mt-1">{{ stats.total }}</p>
      </div>
      <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15">
        <p class="text-slate-400 text-xs uppercase tracking-wider">Aktif</p>
        <p class="text-2xl font-bold text-emerald-300 mt-1">{{ stats.active }}</p>
      </div>
      <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15">
        <p class="text-slate-400 text-xs uppercase tracking-wider">Arızalı</p>
        <p class="text-2xl font-bold text-red-300 mt-1">{{ stats.faulty }}</p>
      </div>
      <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15">
        <p class="text-slate-400 text-xs uppercase tracking-wider">Depoda</p>
        <p class="text-2xl font-bold text-amber-300 mt-1">{{ stats.warehouse }}</p>
      </div>
    </div>

    <div v-if="loadError" class="mb-6 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl px-4 py-3 text-sm">
      {{ loadError }}
    </div>

    <div class="bg-white/5 backdrop-blur-md rounded-3xl overflow-hidden border border-white/10">
      <div class="px-6 py-5 border-b border-white/10 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-white">Demirbaş Listesi</h2>
          <p class="text-sm text-blue-200/80 mt-1">Atama, durum ve seri numarası bilgilerini tek ekranda yönetin.</p>
        </div>
        <span class="text-sm text-blue-200/80">{{ filteredAssets.length }} kayıt</span>
      </div>

      <div v-if="isLoading" class="py-16 text-center bg-transparent">
        <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p class="text-slate-300 mt-3 text-sm">Demirbaşlar yükleniyor...</p>
      </div>

      <div v-else-if="filteredAssets.length === 0" class="py-16 px-6 text-center bg-transparent">
        <div class="text-5xl mb-4">🖥️</div>
        <p class="text-slate-100 font-medium">Gösterilecek demirbaş bulunamadı.</p>
        <p class="text-slate-300 text-sm mt-2">Arama ifadesini temizleyebilir veya yeni bir kayıt ekleyebilirsiniz.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[980px]">
          <thead class="bg-white/5">
            <tr>
              <th class="text-left px-6 py-4 text-xs font-semibold text-slate-300 uppercase tracking-wider">Demirbaş Adı</th>
              <th class="text-left px-6 py-4 text-xs font-semibold text-slate-300 uppercase tracking-wider">Seri No</th>
              <th class="text-left px-6 py-4 text-xs font-semibold text-slate-300 uppercase tracking-wider">Kategori</th>
              <th class="text-left px-6 py-4 text-xs font-semibold text-slate-300 uppercase tracking-wider">Durum</th>
              <th class="text-left px-6 py-4 text-xs font-semibold text-slate-300 uppercase tracking-wider">Atanan Kişi</th>
              <th class="text-left px-6 py-4 text-xs font-semibold text-slate-300 uppercase tracking-wider">Kayıt Tarihi</th>
              <th class="text-left px-6 py-4 text-xs font-semibold text-slate-300 uppercase tracking-wider">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="asset in filteredAssets"
              :key="asset.id"
              class="border-t border-white/10 hover:bg-white/5 transition-colors"
            >
              <td class="px-6 py-4">
                <div>
                  <p class="text-sm font-semibold text-white">{{ asset.name }}</p>
                  <p class="text-xs text-slate-400 mt-1">ID: {{ asset.id }}</p>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-slate-200 font-medium">{{ asset.serial_number }}</td>
              <td class="px-6 py-4 text-sm text-slate-300">{{ asset.category }}</td>
              <td class="px-6 py-4">
                <span :class="['inline-flex px-2.5 py-1 rounded-full text-xs font-semibold', statusClasses[asset.status] || 'bg-slate-100 text-slate-700 border border-slate-200']">
                  {{ statusLabels[asset.status] || asset.status }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-slate-300">{{ getAssignedName(asset) }}</td>
              <td class="px-6 py-4 text-sm text-slate-400">{{ formatDate(asset.created_at) }}</td>
              <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                  <button
                    @click="openEditModal(asset)"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 transition-colors border border-blue-400/30"
                  >
                    Düzenle
                  </button>
                  <button
                    @click="deleteAsset(asset)"
                    :disabled="deletingAssetId === asset.id"
                    class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 text-red-200 hover:bg-red-500/30 disabled:opacity-50 transition-colors border border-red-400/30"
                  >
                    {{ deletingAssetId === asset.id ? 'Siliniyor...' : 'Sil' }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" @click="closeModal" />

      <div class="relative w-full max-w-2xl bg-slate-900 text-white rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <div class="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h3 class="text-xl font-semibold">{{ isEditing ? 'Demirbaş Düzenle' : 'Yeni Demirbaş Ekle' }}</h3>
            <p class="text-sm text-blue-200/80 mt-1">Demirbaş bilgilerini ve atama durumunu bu formdan yönetin.</p>
          </div>
          <button @click="closeModal" class="text-slate-400 hover:text-white transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form @submit.prevent="saveAsset" class="px-6 py-6 space-y-5">
          <div v-if="saveError" class="bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl px-4 py-3 text-sm">
            {{ saveError }}
          </div>

          <div v-if="saveSuccess" class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 rounded-xl px-4 py-3 text-sm">
            Demirbaş başarıyla kaydedildi.
          </div>

          <div class="grid md:grid-cols-2 gap-5">
            <div>
              <label class="block text-sm font-medium text-blue-100 mb-2">Demirbaş Adı</label>
              <input
                v-model="form.name"
                type="text"
                placeholder="Örn: Dell Latitude 5520"
                class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-blue-100 mb-2">Seri No</label>
              <input
                v-model="form.serial_number"
                type="text"
                placeholder="Örn: DL5520-TR-001"
                class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-blue-100 mb-2">Kategori</label>
              <input
                v-model="form.category"
                list="asset-categories"
                type="text"
                placeholder="Laptop, Yazıcı..."
                class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <datalist id="asset-categories">
                <option v-for="category in categorySuggestions" :key="category" :value="category" />
              </datalist>
            </div>

            <div>
              <label class="block text-sm font-medium text-blue-100 mb-2">Durum</label>
              <select
                v-model="form.status"
                class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="status in statusOptions" :key="status" :value="status" class="bg-slate-900">
                  {{ statusLabels[status] || status }}
                </option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-blue-100 mb-2">Atanan Kişi</label>
            <select
              v-model="form.assigned_to"
              class="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              <option value="" class="bg-slate-900">{{ isProfilesLoading ? 'Kullanıcı listesi yükleniyor...' : 'Atanmamış' }}</option>
              <option
                v-for="profile in profiles"
                :key="profile.id"
                :value="profile.id"
                class="bg-slate-900"
              >
                {{ profile.full_name || 'İsimsiz kullanıcı' }}
              </option>
            </select>
            <p class="text-xs text-slate-400 mt-2">
              {{ isProfilesLoading ? 'Kullanıcı listesi yükleniyor...' : 'Demirbaşı bir çalışana ya da personele atayabilirsiniz.' }}
            </p>
          </div>
        </form>

        <div class="flex items-center justify-end gap-3 px-6 py-5 border-t border-white/10">
          <button
            type="button"
            @click="closeModal"
            class="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-all"
          >
            İptal
          </button>
          <button
            type="button"
            @click="saveAsset"
            :disabled="isSaving"
            class="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed shadow-lg shadow-blue-600/25 transition-all"
          >
            {{ isSaving ? 'Kaydediliyor...' : (isEditing ? 'Değişiklikleri Kaydet' : 'Demirbaş Ekle') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
