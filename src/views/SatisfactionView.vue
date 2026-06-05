<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const isLoading = ref(true)
const loadError = ref('')
const ratings = ref([])
const profileNameMap = ref(new Map())

const scoreLabels = {
  1: 'Çok Düşük',
  2: 'Düşük',
  3: 'Orta',
  4: 'İyi',
  5: 'Çok İyi',
}

const averageScore = computed(() => {
  if (!ratings.value.length) return 0
  const total = ratings.value.reduce((sum, rating) => sum + (rating.score || 0), 0)
  return Number((total / ratings.value.length).toFixed(1))
})

const commentedRatings = computed(() =>
  ratings.value.filter((rating) => rating.comment?.trim())
)

const recentComments = computed(() => commentedRatings.value.slice(0, 5))

const scoreBreakdown = computed(() => {
  const total = ratings.value.length || 1

  return [5, 4, 3, 2, 1].map((score) => {
    const count = ratings.value.filter((rating) => rating.score === score).length
    return {
      score,
      count,
      percent: Math.round((count / total) * 100),
    }
  })
})

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

const getRatingOwnerName = (rating) =>
  rating.profiles?.full_name?.trim() ||
  profileNameMap.value.get(rating.user_id) ||
  'Bilinmeyen Kullanıcı'

const fetchRatings = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    const { data: usersData, error: usersError } = await supabase.rpc('admin_list_profiles', { payload: {} })
    if (usersError) throw usersError
    profileNameMap.value = new Map((usersData || []).map((user) => [user.id, user.full_name?.trim() || '']))

    const { data, error } = await supabase
      .from('ratings')
      .select('id, user_id, score, comment, created_at, tickets(title), profiles:user_id(full_name)')
      .order('created_at', { ascending: false })

    if (error) throw error
    ratings.value = data || []
  } catch (error) {
    console.error('Memnuniyet verileri yüklenemedi:', error)
    loadError.value = 'Memnuniyet verileri yüklenemedi. Ratings tablosu izinlerini kontrol edin.'
    ratings.value = []
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchRatings)
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="text-3xl font-bold text-white">Memnuniyet Analizi</h1>
        <p class="mt-1 text-blue-300">Çözüm sonrası kullanıcı puanlarını ve son yorumları buradan takip edebilirsiniz.</p>
      </div>
      <button
        @click="fetchRatings"
        :disabled="isLoading"
        class="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ isLoading ? 'Yenileniyor...' : 'Verileri Yenile' }}
      </button>
    </div>

    <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div class="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-transparent p-6 backdrop-blur-md">
        <p class="text-sm text-amber-200/80">Ortalama Puan</p>
        <div v-if="isLoading" class="mt-4 h-10 w-32 animate-pulse rounded-xl bg-white/10"></div>
        <p v-else class="mt-3 text-4xl font-bold text-amber-300">⭐ {{ averageScore.toFixed(1) }}<span class="text-xl text-amber-200/70">/5.0</span></p>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <p class="text-sm text-slate-400">Toplam Değerlendirme</p>
        <div v-if="isLoading" class="mt-4 h-10 w-20 animate-pulse rounded-xl bg-white/10"></div>
        <p v-else class="mt-3 text-4xl font-bold text-white">{{ ratings.length }}</p>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <p class="text-sm text-slate-400">Yorum Bırakanlar</p>
        <div v-if="isLoading" class="mt-4 h-10 w-20 animate-pulse rounded-xl bg-white/10"></div>
        <p v-else class="mt-3 text-4xl font-bold text-cyan-300">{{ commentedRatings.length }}</p>
      </div>
    </div>

    <div v-if="loadError" class="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {{ loadError }}
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <div class="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-white">Son 5 Yorum</h2>
            <p class="mt-1 text-sm text-slate-400">Yorum bırakılan en güncel değerlendirmeler.</p>
          </div>
        </div>

        <div v-if="isLoading" class="space-y-3">
          <div v-for="n in 3" :key="n" class="h-28 animate-pulse rounded-2xl bg-white/10"></div>
        </div>

        <div v-else-if="recentComments.length === 0" class="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-500">
          Henüz yorumlu bir memnuniyet kaydı bulunmuyor.
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="rating in recentComments"
            :key="rating.id"
            class="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-white">
                  {{ getRatingOwnerName(rating) }}
                </p>
                <p class="mt-1 text-xs text-slate-500">
                  Talep: {{ rating.tickets?.title || 'Bağlı talep bulunamadı' }}
                </p>
              </div>
              <div class="text-left sm:text-right">
                <p class="text-sm font-semibold text-amber-300">★ {{ rating.score }}/5</p>
                <p class="mt-1 text-xs text-slate-500">{{ formatDate(rating.created_at) }}</p>
              </div>
            </div>
            <p class="mt-3 text-sm leading-relaxed text-slate-300">{{ rating.comment }}</p>
          </div>
        </div>
      </div>

      <div class="space-y-6">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h2 class="text-lg font-semibold text-white">Puan Dağılımı</h2>
          <p class="mt-1 text-sm text-slate-400">1 ile 5 yıldız arasındaki genel dağılım.</p>

          <div class="mt-5 space-y-4">
            <div v-for="row in scoreBreakdown" :key="row.score">
              <div class="mb-1.5 flex items-center justify-between text-sm">
                <span class="font-medium text-slate-200">{{ row.score }} Yıldız</span>
                <span class="text-slate-400">{{ row.count }} kayıt</span>
              </div>
              <div class="h-2 rounded-full bg-white/10">
                <div
                  class="h-2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-500"
                  :style="{ width: `${row.percent}%` }"
                ></div>
              </div>
              <p class="mt-1 text-xs text-slate-500">{{ scoreLabels[row.score] }} • %{{ row.percent }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
          <h2 class="text-lg font-semibold text-white">Son Değerlendirmeler</h2>
          <p class="mt-1 text-sm text-slate-400">Tüm puanlar en güncelden eskiye listelenir.</p>

          <div v-if="isLoading" class="mt-5 space-y-3">
            <div v-for="n in 4" :key="n" class="h-14 animate-pulse rounded-xl bg-white/10"></div>
          </div>

          <div v-else-if="ratings.length === 0" class="mt-5 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 px-4 py-8 text-center text-sm text-slate-500">
            Henüz herhangi bir memnuniyet kaydı bulunmuyor.
          </div>

          <div v-else class="mt-5 space-y-3">
            <div
              v-for="rating in ratings.slice(0, 8)"
              :key="rating.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-4 py-3"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-white">
                  {{ rating.tickets?.title || 'Bağlı talep bulunamadı' }}
                </p>
                <p class="mt-1 truncate text-xs text-slate-500">
                  {{ getRatingOwnerName(rating) }}
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p class="text-sm font-semibold text-amber-300">★ {{ rating.score }}/5</p>
                <p class="mt-1 text-xs text-slate-500">{{ formatDate(rating.created_at) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
