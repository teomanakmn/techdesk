<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const users = ref([])
const isLoading = ref(true)
const loadError = ref('')
const featureWarning = ref('')

const showModal = ref(false)
const isSaving = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)

const newUser = ref({
  fullName: '',
  email: '',
  password: '',
  role: 'user',
})

const roleLabels = {
  user: 'Son Kullanıcı',
  it_staff: 'IT Personeli',
  admin: 'Yönetici',
}

const roleBadgeClasses = {
  user: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  it_staff: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  admin: 'bg-red-500/20 text-red-300 border-red-500/30',
}

const stats = computed(() => ({
  total: users.value.length,
  user: users.value.filter(u => u.role === 'user').length,
  it_staff: users.value.filter(u => u.role === 'it_staff').length,
  admin: users.value.filter(u => u.role === 'admin').length,
}))

const roleUpdating = ref({})
const roleUpdateSuccess = ref({})
const deletingUsers = ref({})
const mapProfileToRow = (profile) => ({
  id: profile.id,
  fullName: profile.full_name || '—',
  email: profile.email || 'Gizli (Auth API gerekli)',
  role: profile.role || 'user',
  createdAt: profile.created_at,
})

const invokeAccount = async body => {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    const result = await error.context?.json?.().catch(() => null)
    throw new Error(result?.error || 'İşlem doğrulanamadı. Tekrar denemeden önce kullanıcı listesini yenileyin.')
  }
  if (!data?.ok) throw new Error(data?.error || 'İşlem doğrulanamadı.')
  return data
}

const applyRoleForUser = async ({ userId, role }) => {
  const { data, error } = await supabase.rpc('admin_update_user_role', { target_user_id: userId, target_role: role })
  if (error) throw error
  if (data?.id !== userId || data.role !== role) throw new Error('Rol güncellemesi doğrulanamadı.')
}

const fetchUsers = async () => {
  isLoading.value = true
  loadError.value = ''
  try {
    const { data, error } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (error) throw error
    users.value = (data || []).map(mapProfileToRow)
    featureWarning.value = ''
  } catch {
    users.value = []
    loadError.value = 'Kullanıcı listesi yüklenemedi. Yerel backend kurulumunu ve yönetici yetkisini kontrol edin.'
  } finally { isLoading.value = false }
}

const handleRoleChange = async (user, newRole) => {
  if (newRole === user.role) return

  roleUpdating.value[user.id] = true
  roleUpdateSuccess.value[user.id] = false

  try {
    await applyRoleForUser({
      userId: user.id,
      role: newRole,
    })

    user.role = newRole
    roleUpdateSuccess.value[user.id] = true
    setTimeout(() => {
      roleUpdateSuccess.value[user.id] = false
    }, 1500)
  } catch (error) {
    console.error('Rol güncelleme hatası:', error)
    alert('Rol güncellenemedi: ' + error.message)
  } finally {
    roleUpdating.value[user.id] = false
  }
}

const handleDeleteUser = async (user) => {
  const ok = window.confirm(`${user.fullName} isimli kullanıcıyı silmek istediğinize emin misiniz?`)
  if (!ok) return

  deletingUsers.value[user.id] = true
  try {
    await invokeAccount({ action: 'delete', userId: user.id })

    await fetchUsers()
  } catch (error) {
    console.error('Kullanıcı silme hatası:', error)
    alert('Kullanıcı silinemedi: ' + (error.message || 'Bilinmeyen hata'))
  } finally {
    deletingUsers.value[user.id] = false
  }
}

const openModal = () => {
  newUser.value = { fullName: '', email: '', password: '', role: 'user' }
  saveError.value = ''
  saveSuccess.value = false
  showModal.value = true
}

const closeModal = () => {
  if (isSaving.value) return
  showModal.value = false
}

const handleAddUser = async () => {
  if (isSaving.value) return
  saveError.value = ''
  saveSuccess.value = false
  try {
    isSaving.value = true
    await invokeAccount({ action: 'create', ...newUser.value })
    saveSuccess.value = true
    showModal.value = false
    newUser.value.password = ''
    await fetchUsers()
  } catch (error) { saveError.value = error.message }
  finally { isSaving.value = false }
}

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
    <div>
      <h1 class="text-3xl font-bold text-white">Kullanıcı Yönetimi</h1>
      <p class="text-blue-300 mt-1">Kullanıcıları yönetin, roller atayın ve yeni kullanıcı ekleyin.</p>
    </div>
    <button
      @click="openModal"
      class="inline-flex items-center space-x-2 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30 hover:scale-[1.02] active:scale-[0.98]"
    >
      <span class="text-lg">👤</span>
      <span>Yeni Kullanıcı Ekle</span>
    </button>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
      <p class="text-slate-400 text-xs">Toplam</p>
      <p class="text-2xl font-bold text-white mt-1">{{ stats.total }}</p>
    </div>
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
      <p class="text-slate-400 text-xs">Son Kullanıcı</p>
      <p class="text-2xl font-bold text-blue-400 mt-1">{{ stats.user }}</p>
    </div>
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
      <p class="text-slate-400 text-xs">IT Personeli</p>
      <p class="text-2xl font-bold text-amber-400 mt-1">{{ stats.it_staff }}</p>
    </div>
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
      <p class="text-slate-400 text-xs">Yönetici</p>
      <p class="text-2xl font-bold text-red-400 mt-1">{{ stats.admin }}</p>
    </div>
  </div>

  <div
    v-if="loadError"
    class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm mb-6"
  >
    ⚠️ {{ loadError }}
  </div>

  <div
    v-if="featureWarning"
    class="bg-amber-500/20 border border-amber-500/40 text-amber-200 px-4 py-3 rounded-xl text-sm mb-6"
  >
    ⚠️ {{ featureWarning }}
  </div>

  <div class="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
    <div class="px-6 py-4 border-b border-white/10">
      <h2 class="text-lg font-semibold text-white">Kayıtlı Kullanıcılar</h2>
    </div>

    <div v-if="isLoading" class="p-12 text-center">
      <div class="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
      <p class="text-slate-400 text-sm">Kullanıcılar yükleniyor...</p>
    </div>

    <div v-else-if="users.length === 0 && !loadError" class="p-12 text-center">
      <div class="text-5xl mb-4">👥</div>
      <p class="text-slate-400">Henüz kayıtlı kullanıcı bulunmuyor.</p>
    </div>

    <div v-else-if="users.length > 0" class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-white/10">
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ad Soyad</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">E-posta</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Kayıt Tarihi</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rol</th>
            <th class="text-left px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">İşlemler</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
            class="border-b border-white/5 hover:bg-white/5 transition-colors duration-150"
          >
            <td class="px-6 py-4">
              <div class="flex items-center space-x-3">
                <div class="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-300 text-sm font-bold">
                  {{ user.fullName.charAt(0).toUpperCase() }}
                </div>
                <span class="text-white text-sm font-medium">{{ user.fullName }}</span>
              </div>
            </td>
            <td class="px-6 py-4 text-slate-400 text-sm">{{ user.email }}</td>
            <td class="px-6 py-4 text-slate-400 text-sm">{{ formatDate(user.createdAt) }}</td>
            <td class="px-6 py-4">
              <span :class="['px-2.5 py-1 text-xs font-medium rounded-full border', roleBadgeClasses[user.role]]">
                {{ roleLabels[user.role] }}
              </span>
            </td>
            <td class="px-6 py-4">
              <div class="flex items-center space-x-2">
                <select
                  :value="user.role"
                  @change="handleRoleChange(user, $event.target.value)"
                  :disabled="roleUpdating[user.id] || deletingUsers[user.id]"
                  class="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                >
                  <option value="user" class="bg-slate-800">Son Kullanıcı</option>
                  <option value="it_staff" class="bg-slate-800">IT Personeli</option>
                  <option value="admin" class="bg-slate-800">Yönetici</option>
                </select>
                <div v-if="roleUpdating[user.id]" class="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span v-if="roleUpdateSuccess[user.id]" class="text-emerald-400 text-sm">✓</span>
                <button
                  @click="handleDeleteUser(user)"
                  :disabled="deletingUsers[user.id] || roleUpdating[user.id]"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <span v-if="deletingUsers[user.id]">Siliniyor...</span>
                  <span v-else>Sil</span>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeModal" />

      <div class="relative w-full max-w-lg bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h3 class="text-xl font-semibold text-white">Yeni Kullanıcı Ekle</h3>
          <button @click="closeModal" class="text-slate-400 hover:text-white transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form id="create-user-form" @submit.prevent="handleAddUser" class="px-6 py-5 space-y-5">
          <div class="bg-blue-500/10 border border-blue-500/30 text-blue-300 px-4 py-3 rounded-xl text-xs">
            ℹ️ Bu formdan doğrudan ad, e-posta ve şifre ile kullanıcı oluşturabilirsiniz.
          </div>

          <div v-if="saveError" class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl text-sm">
            {{ saveError }}
          </div>

          <div v-if="saveSuccess" class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 px-4 py-3 rounded-xl text-sm">
            ✅ Kullanıcı başarıyla oluşturuldu.
          </div>

          <div>
            <label for="userName" class="block text-sm font-medium text-blue-200 mb-2">
              Ad Soyad <span class="text-red-400">*</span>
            </label>
            <input
              id="userName"
              v-model="newUser.fullName"
              type="text"
              required
              placeholder="Örn: Ahmet Yılmaz"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <div>
            <label for="userEmail" class="block text-sm font-medium text-blue-200 mb-2">
              E-posta <span class="text-red-400">*</span>
            </label>
            <input
              id="userEmail"
              v-model="newUser.email"
              type="email"
              required
              placeholder="personel@sirket.com"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <div>
            <label for="userPassword" class="block text-sm font-medium text-blue-200 mb-2">
              Şifre <span class="text-red-400">*</span>
            </label>
            <input
              id="userPassword"
              v-model="newUser.password"
              type="password"
              required
              minlength="8"
              placeholder="En az 8 karakter"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            />
          </div>

          <div>
            <label for="userRole" class="block text-sm font-medium text-blue-200 mb-2">Rol</label>
            <select
              id="userRole"
              v-model="newUser.role"
              class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
            >
              <option value="user" class="bg-slate-800">Son Kullanıcı</option>
              <option value="it_staff" class="bg-slate-800">IT Personeli</option>
              <option value="admin" class="bg-slate-800">Yönetici</option>
            </select>
          </div>
        </form>

        <div class="flex items-center justify-end space-x-3 px-6 py-4 border-t border-white/10">
          <button
            @click="closeModal"
            type="button"
            class="px-5 py-2.5 text-slate-300 hover:text-white text-sm font-medium rounded-xl hover:bg-white/5 transition-all duration-200"
          >
            İptal
          </button>
          <button
            type="submit"
            form="create-user-form"
            :disabled="isSaving"
            class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-600/30"
          >
            <span v-if="isSaving">Kaydediliyor...</span>
            <span v-else>Kullanıcı Oluştur</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
