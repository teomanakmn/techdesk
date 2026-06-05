<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const logs = ref([])
const isLoading = ref(true)
const loadError = ref('')
const profileNameMap = ref(new Map())

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const fetchProfileNames = async () => {
  try {
    const { data, error } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (error) throw error

    profileNameMap.value = new Map(
      (data || []).map((profile) => [profile.id, profile.full_name?.trim() || ''])
    )
  } catch (error) {
    console.error('Log kullanıcı isimleri yüklenemedi:', error)
    profileNameMap.value = new Map()
  }
}

const getActorName = (log) =>
  log.profiles?.full_name?.trim() ||
  profileNameMap.value.get(log.user_id) ||
  'Bilinmeyen Kullanıcı'

const fetchLogs = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    await fetchProfileNames()

    const { data, error } = await supabase
      .from('logs')
      .select('*, profiles(full_name)')
      .order('created_at', { ascending: false })

    if (error) throw error
    logs.value = data || []
  } catch (error) {
    console.error('Log kayıtları yüklenemedi:', error)
    loadError.value = 'Sistem hareket günlüğü yüklenemedi. logs tablosu ve RLS izinlerini kontrol edin.'
    logs.value = []
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchLogs)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white">Sistem Hareket Günlüğü</h1>
        <p class="mt-1 text-blue-300">Sistemdeki kritik işlemlerin geçmişini buradan takip edin.</p>
      </div>
      <button
        @click="fetchLogs"
        :disabled="isLoading"
        class="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ isLoading ? 'Yenileniyor...' : 'Yenile' }}
      </button>
    </div>

    <div v-if="loadError" class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {{ loadError }}
    </div>

    <div class="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-white/10">
          <thead class="bg-white/5">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tarih</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İşlemi Yapan</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Aksiyon</th>
              <th class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Detay</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
            <tr v-if="isLoading">
              <td colspan="4" class="px-4 py-10 text-center text-sm text-slate-400">
                Log kayıtları yükleniyor...
              </td>
            </tr>

            <tr v-else-if="logs.length === 0">
              <td colspan="4" class="px-4 py-10 text-center text-sm text-slate-500">
                Henüz log kaydı bulunmuyor.
              </td>
            </tr>

            <tr v-for="log in logs" :key="log.id" class="transition hover:bg-white/5">
              <td class="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                {{ formatDateTime(log.created_at) }}
              </td>
              <td class="px-4 py-3 text-sm text-white whitespace-nowrap">
                {{ getActorName(log) }}
              </td>
              <td class="px-4 py-3">
                <span class="inline-flex rounded-full border border-blue-500/30 bg-blue-500/15 px-2.5 py-1 text-xs font-medium text-blue-300">
                  {{ log.action || '-' }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-slate-300">
                {{ log.details || '-' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
