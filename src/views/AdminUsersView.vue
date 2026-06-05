<script setup>
import { ref, computed, onMounted } from 'vue'
import { createClient } from '@supabase/supabase-js'
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
const REQUEST_TIMEOUT_MS = 15000
let savingWatchdog = null

const mapProfileToRow = (profile) => ({
  id: profile.id,
  fullName: profile.full_name || '—',
  email: profile.email || 'Gizli (Auth API gerekli)',
  role: profile.role || 'user',
  createdAt: profile.created_at,
})

const createTempAuthClient = () => {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  return createClient(url, anon, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      storageKey: 'techdesk-admin-create-user-temp',
    },
  })
}

const waitForProfileRow = async (client, userId, maxAttempts = 12, delayMs = 350) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await client
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data?.id) return data

    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  throw new Error('Kullanıcı oluşturuldu ancak profil kaydı henüz hazır değil. Biraz sonra tekrar deneyin.')
}

const withTimeout = async (promise, timeoutMs = REQUEST_TIMEOUT_MS) => {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.'))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

const loadUsersViaRpc = async () => {
  const { data, error } = await supabase.rpc('admin_list_profiles', { payload: {} })

  if (error) throw error

  users.value = (data || []).map(mapProfileToRow)
  featureWarning.value = 'Rol yönetimi ve kullanıcı listesi güvenli RPC ile çalışıyor.'
}

const loadUsersViaDirectSelect = async () => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, created_at')
    .order('created_at', { ascending: true })

  if (error) throw error

  users.value = (profiles || []).map(mapProfileToRow)
  featureWarning.value = 'Güvenlik nedeniyle tarayıcı tarafında auth.admin API kullanılamıyor. E-posta listesi sınırlı görünür.'
}

const ensureProfileRow = async ({ client, userId, fullName }) => {
  try {
    return await waitForProfileRow(client, userId)
  } catch {
    const { data: authData, error: authError } = await client.auth.getUser()

    if (authError || authData?.user?.id !== userId) {
      throw new Error('Profil kaydı otomatik oluşturulamadı. Supabase trigger ayarını kontrol edin.')
    }

    // Trigger çalışmadıysa yeni kullanıcının kendi oturumuyla manuel profil oluşturmayı deneriz.
    const { error: insertError } = await client
      .from('profiles')
      .insert({
        id: userId,
        full_name: fullName,
        role: 'user',
      })

    if (insertError) {
      throw new Error('Profil kaydı oluşturulamadı. Supabase trigger/RLS ayarlarını kontrol edin.')
    }

    return await waitForProfileRow(client, userId, 4, 250)
  }
}

const applyRoleForUser = async ({ userId, role }) => {
  if (role === 'user') return

  const { data: updatedRow, error: roleError } = await supabase.rpc('admin_update_user_role', {
    target_user_id: userId,
    target_role: role,
  })

  if (roleError) {
    if (roleError.message?.includes('Could not find the function public.admin_update_user_role')) {
      throw new Error('Supabase RPC fonksiyonu eksik. supabase/admin_user_management.sql dosyasını SQL Editor\'da çalıştırın.')
    }
    throw roleError
  }

  if (!updatedRow?.id || updatedRow.role !== role) {
    throw new Error('Rol güncellemesi kaydedilemedi. RPC sonucu doğrulanamadı.')
  }
}

const fetchUsers = async () => {
  isLoading.value = true
  loadError.value = ''
  featureWarning.value = ''
  try {
    try {
      await loadUsersViaRpc()
    } catch (rpcError) {
      if (!rpcError.message?.includes('Could not find the function public.admin_list_profiles')) {
        throw rpcError
      }
      await loadUsersViaDirectSelect()
    }
  } catch (error) {
    console.error('Kullanıcılar yüklenirken hata:', error)
    loadError.value = 'Kullanıcılar yüklenemedi. Profiles tablosu izinlerini kontrol edin.'
  } finally {
    isLoading.value = false
  }
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
    const { data, error } = await supabase.rpc('admin_delete_user', {
      target_user_id: user.id,
    })

    if (error) {
      if (error.message?.includes('Could not find the function public.admin_delete_user')) {
        throw new Error('Supabase RPC fonksiyonu eksik. supabase/admin_user_management.sql dosyasını SQL Editor\'da çalıştırın.')
      }
      throw error
    }
    if (!data?.ok) {
      throw new Error('Silme işlemi doğrulanamadı.')
    }

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
  if (savingWatchdog) {
    clearTimeout(savingWatchdog)
    savingWatchdog = null
  }
  isSaving.value = false
  showModal.value = false
}

const handleAddUser = async () => {
  if (isSaving.value) return

  saveError.value = ''
  saveSuccess.value = false

  if (!newUser.value.fullName.trim()) {
    saveError.value = 'Ad Soyad alanı zorunludur.'
    return
  }
  if (!newUser.value.email.trim()) {
    saveError.value = 'E-posta alanı zorunludur.'
    return
  }
  if (!newUser.value.password || newUser.value.password.length < 6) {
    saveError.value = 'Şifre en az 6 karakter olmalıdır.'
    return
  }

  try {
    isSaving.value = true
    savingWatchdog = setTimeout(() => {
      if (isSaving.value) {
        isSaving.value = false
        saveError.value = 'İşlem beklenenden uzun sürdü. Lütfen tekrar deneyin.'
      }
    }, REQUEST_TIMEOUT_MS + 2000)

    // Ayrı auth client kullanarak mevcut admin oturumunu bozmadan kayıt oluştur.
    const tempClient = createTempAuthClient()
    const { data, error } = await withTimeout(
      tempClient.auth.signUp({
        email: newUser.value.email.trim(),
        password: newUser.value.password,
        options: {
          data: { full_name: newUser.value.fullName.trim() },
        },
      })
    )
    if (error) throw error

    // Supabase bazen mevcut e-posta durumunda "fake user" dönebilir.
    const identityCount = data?.user?.identities?.length ?? 0
    if (identityCount === 0) {
      throw new Error('Bu e-posta adresi zaten kayıtlı ya da onay bekliyor.')
    }

    const createdUserId = data?.user?.id
    if (!createdUserId) {
      throw new Error('Kullanıcı oluşturuldu ancak kimlik bilgisi alınamadı.')
    }

    // auth.users tetikleyicisinin profiles kaydını oluşturmasını bekle;
    // gerekirse manuel fallback ile profil satırı oluştur.
    await withTimeout(ensureProfileRow({
      client: tempClient,
      userId: createdUserId,
      fullName: newUser.value.fullName.trim(),
    }))

    await withTimeout(applyRoleForUser({
      userId: createdUserId,
      role: newUser.value.role,
    }))

    saveSuccess.value = true
    closeModal()
    await fetchUsers()
  } catch (error) {
    console.error('Kullanıcı ekleme hatası:', error)
    const translations = {
      'User already registered': 'Bu e-posta adresi zaten kayıtlı.',
      'A user with this email address has already been registered': 'Bu e-posta adresi zaten kayıtlı.',
      'Password should be at least 6 characters': 'Şifre en az 6 karakter olmalıdır.',
      'Signup is disabled': 'Kayıt işlemi sistem ayarlarında kapalı.',
    }
    let message = error.message || 'Bilinmeyen hata'
    if (error?.status === 422) {
      message = `Kayıt isteği işlenemedi (422): ${message}`
    }
    for (const [key, value] of Object.entries(translations)) {
      if (message.includes(key)) {
        message = value
        break
      }
    }
    saveError.value = message
  } finally {
    if (savingWatchdog) {
      clearTimeout(savingWatchdog)
      savingWatchdog = null
    }
    isSaving.value = false
  }
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
              minlength="6"
              placeholder="En az 6 karakter"
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
