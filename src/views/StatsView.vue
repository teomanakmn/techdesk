<script setup>
import { ref, computed, onMounted } from 'vue'
import { Bar, Line, Doughnut } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { supabase } from '@/lib/supabaseClient'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const isLoading = ref(true)
const tickets = ref([])

const TREND_DAYS = 30

const statusTotals = computed(() => {
  const total = tickets.value.length
  const open = tickets.value.filter(t => t.status === 'open').length
  const inProgress = tickets.value.filter(t => t.status === 'in_progress').length
  const resolved = tickets.value.filter(t => t.status === 'resolved').length
  return { total, open, inProgress, resolved }
})

// Global çözülme oranı: çözülen / toplam
const resolvedRate = computed(() => {
  const { total, resolved } = statusTotals.value
  if (total === 0) return 0
  return Math.round((resolved / total) * 100)
})

const toDayKey = (dateLike) => {
  const d = new Date(dateLike)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const trendSeries = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dayBuckets = Array.from({ length: TREND_DAYS }, (_, i) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (TREND_DAYS - 1 - i))
    return {
      key: toDayKey(day),
      label: day.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' }),
      opened: 0,
      resolved: 0,
      resolutionRate: 0,
    }
  })

  const map = new Map(dayBuckets.map(item => [item.key, item]))
  for (const ticket of tickets.value) {
    const bucket = map.get(toDayKey(ticket.created_at))
    if (!bucket) continue
    bucket.opened += 1
    if (ticket.status === 'resolved') bucket.resolved += 1
  }

  for (const bucket of dayBuckets) {
    bucket.resolutionRate = bucket.opened > 0
      ? Math.round((bucket.resolved / bucket.opened) * 100)
      : 0
  }

  return dayBuckets
})

const trendLabels = computed(() => trendSeries.value.map(item => item.label))
const openedCounts = computed(() => trendSeries.value.map(item => item.opened))
const resolutionRates = computed(() => trendSeries.value.map(item => item.resolutionRate))

const commonGrid = { color: 'rgba(148, 163, 184, 0.18)', drawBorder: false }
const commonTicks = { color: '#94a3b8', font: { size: 10 } }

const openedTrendData = computed(() => ({
  labels: trendLabels.value,
  datasets: [
    {
      type: 'bar',
      label: 'Açılan Talep',
      data: openedCounts.value,
      backgroundColor: 'rgba(14, 165, 233, 0.38)',
      borderColor: 'rgba(103, 232, 249, 0.6)',
      borderWidth: 1,
      borderRadius: 8,
      borderSkipped: false,
      barPercentage: 0.84,
      categoryPercentage: 0.86,
    },
    {
      type: 'line',
      label: 'Trend',
      data: openedCounts.value,
      borderColor: '#67e8f9',
      backgroundColor: 'rgba(103, 232, 249, 0.15)',
      pointBackgroundColor: '#67e8f9',
      pointBorderColor: '#082f49',
      pointBorderWidth: 1.5,
      pointRadius: 2.5,
      pointHoverRadius: 4,
      borderWidth: 2.2,
      tension: 0.35,
      fill: true,
    },
  ],
}))

const openedTrendOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#e2e8f0',
      bodyColor: '#cbd5e1',
      borderColor: 'rgba(148, 163, 184, 0.25)',
      borderWidth: 1,
      callbacks: {
        title: (items) => `Tarih: ${items[0]?.label || '-'}`,
        label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: commonTicks },
    y: {
      beginAtZero: true,
      grid: commonGrid,
      ticks: { ...commonTicks, precision: 0 },
    },
  },
}

const resolutionTrendData = computed(() => ({
  labels: trendLabels.value,
  datasets: [
    {
      label: 'Çözülme Oranı',
      data: resolutionRates.value,
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.16)',
      fill: true,
      tension: 0.42,
      borderWidth: 2.8,
      pointBackgroundColor: '#6ee7b7',
      pointBorderColor: '#064e3b',
      pointBorderWidth: 1.5,
      pointRadius: 3,
      pointHoverRadius: 5,
    },
  ],
}))

const resolutionTrendOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#e2e8f0',
      bodyColor: '#cbd5e1',
      borderColor: 'rgba(148, 163, 184, 0.25)',
      borderWidth: 1,
      callbacks: {
        title: (items) => `Tarih: ${items[0]?.label || '-'}`,
        label: (context) => `Çözülme: %${context.parsed.y}`,
      },
    },
  },
  scales: {
    x: { grid: { display: false }, ticks: commonTicks },
    y: {
      beginAtZero: true,
      max: 100,
      grid: commonGrid,
      ticks: {
        ...commonTicks,
        callback: (value) => `%${value}`,
      },
    },
  },
}

const distributionData = computed(() => ({
  labels: ['Açık', 'İşlemde', 'Çözüldü'],
  datasets: [
    {
      data: [statusTotals.value.open, statusTotals.value.inProgress, statusTotals.value.resolved],
      backgroundColor: ['#f97316', '#facc15', '#10b981'],
      borderColor: '#0f172a',
      borderWidth: 2,
      hoverOffset: 10,
      cutout: '68%',
    },
  ],
}))

const distributionOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: {
        color: '#cbd5e1',
        boxWidth: 10,
        boxHeight: 10,
        padding: 16,
      },
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      titleColor: '#e2e8f0',
      bodyColor: '#cbd5e1',
      borderColor: 'rgba(148, 163, 184, 0.25)',
      borderWidth: 1,
      callbacks: {
        title: (items) => items[0]?.label || '',
        label: (context) => {
          const total = statusTotals.value.total || 1
          const value = context.parsed || 0
          const percent = Math.round((value / total) * 100)
          return `Adet: ${value} (%${percent})`
        },
      },
    },
  },
}

const fetchStatsData = async () => {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, status, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  tickets.value = data || []
}

onMounted(async () => {
  isLoading.value = true
  try {
    await fetchStatsData()
  } catch (error) {
    console.error('İstatistikler yüklenemedi:', error)
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-white">İstatistikler</h1>
    <p class="text-blue-300 mt-1">Son 30 gün ticket trendleri ve çözülme performansı.</p>
  </div>

  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
      <p class="text-slate-400 text-sm">Toplam Ticket</p>
      <p class="text-3xl font-bold text-blue-400 mt-2">{{ statusTotals.total }}</p>
    </div>
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
      <p class="text-slate-400 text-sm">Açık</p>
      <p class="text-3xl font-bold text-red-400 mt-2">{{ statusTotals.open }}</p>
    </div>
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
      <p class="text-slate-400 text-sm">İşlemde</p>
      <p class="text-3xl font-bold text-amber-400 mt-2">{{ statusTotals.inProgress }}</p>
    </div>
    <div class="bg-white/10 backdrop-blur-md rounded-2xl p-5 border border-white/20">
      <p class="text-slate-400 text-sm">Çözülme Oranı</p>
      <p class="text-3xl font-bold text-emerald-400 mt-2">%{{ resolvedRate }}</p>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div class="lg:col-span-2 bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-base font-semibold text-white">Günlük Açılan Ticket</h2>
          <p class="text-slate-500 text-xs mt-1">Bar + line kombinasyonu</p>
        </div>
      </div>

      <div v-if="isLoading" class="h-72 rounded-xl bg-white/5 animate-pulse"></div>
      <div v-else class="h-72">
        <Bar :data="openedTrendData" :options="openedTrendOptions" />
      </div>
    </div>

    <div class="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
      <h2 class="text-base font-semibold text-white mb-4">Durum Dağılımı</h2>
      <div v-if="isLoading" class="h-72 rounded-xl bg-white/5 animate-pulse"></div>
      <div v-else class="h-72">
        <Doughnut :data="distributionData" :options="distributionOptions" />
      </div>
    </div>

    <div class="lg:col-span-3 bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-base font-semibold text-white">Günlük Çözülme Oranı</h2>
          <p class="text-slate-500 text-xs mt-1">Line chart (0-100%)</p>
        </div>
      </div>

      <div v-if="isLoading" class="h-72 rounded-xl bg-white/5 animate-pulse"></div>
      <div v-else class="h-72">
        <Line :data="resolutionTrendData" :options="resolutionTrendOptions" />
      </div>
    </div>
  </div>
</template>
