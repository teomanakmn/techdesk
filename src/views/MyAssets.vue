<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const isLoading = ref(true)
const loadError = ref('')
const myAssets = ref([])

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

const fetchMyAssets = async () => {
  if (!authStore.user?.id) {
    isLoading.value = false
    myAssets.value = []
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    const { data, error } = await supabase
      .from('assets')
      .select('id, name, category, serial_number, status, assigned_to, created_at')
      .eq('assigned_to', authStore.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    myAssets.value = data || []
  } catch (error) {
    console.error('Atanan ekipmanlar yüklenemedi:', error)
    loadError.value = 'Ekipmanlar yüklenemedi. Lütfen daha sonra tekrar deneyin.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchMyAssets()
})
</script>

<template>
  <div class="min-h-[70vh] bg-gradient-to-br from-slate-900/80 via-blue-950/70 to-slate-900/80 rounded-2xl border border-white/10 p-5 md:p-8">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-white">Ekipmanlarım</h1>
      <p class="text-blue-200/90 mt-1">Üzerinize atanmış cihazları buradan takip edebilirsiniz.</p>
    </div>

    <div v-if="loadError" class="mb-6 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl px-4 py-3 text-sm">
      {{ loadError }}
    </div>

    <div v-if="isLoading" class="py-16 text-center">
      <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-slate-300 mt-3 text-sm">Ekipmanlar yükleniyor...</p>
    </div>

    <div v-else-if="myAssets.length === 0" class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-10 text-center">
      <p class="text-slate-200 font-medium">Size atanmış herhangi bir ekipman bulunmamaktadır.</p>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="asset in myAssets"
        :key="asset.id"
        class="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors"
      >
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-white text-lg font-semibold leading-snug">{{ asset.name }}</h2>
          <span :class="['inline-flex px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap', statusClasses[asset.status] || 'bg-slate-500/20 text-slate-200 border border-slate-400/40']">
            {{ statusLabels[asset.status] || asset.status }}
          </span>
        </div>

        <div class="mt-4 space-y-2 text-sm">
          <p class="text-slate-300"><span class="text-slate-400">Kategori:</span> {{ asset.category }}</p>
          <p class="text-slate-300"><span class="text-slate-400">Seri Numarası:</span> {{ asset.serial_number }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
