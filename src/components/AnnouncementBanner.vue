<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const announcements = ref([])
const hiddenIds = ref(new Set())
const expandedIds = ref(new Set())
const showAll = ref(false)
const isLoading = ref(true)

const visibleAnnouncements = computed(() => {
  const filtered = announcements.value.filter((announcement) => !hiddenIds.value.has(announcement.id))
  if (showAll.value) return filtered
  return filtered.slice(0, 2)
})

const hiddenCount = computed(() => {
  const allVisible = announcements.value.filter((announcement) => !hiddenIds.value.has(announcement.id))
  return Math.max(0, allVisible.length - visibleAnnouncements.value.length)
})

const hasAnnouncements = computed(() =>
  announcements.value.some((announcement) => !hiddenIds.value.has(announcement.id))
)

const fetchActiveAnnouncements = async () => {
  isLoading.value = true
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(8)

  if (error) {
    console.error('Aktif duyuru yüklenemedi:', error)
    announcements.value = []
    isLoading.value = false
    return
  }

  announcements.value = data || []
  isLoading.value = false
}

const closeBanner = (announcementId) => {
  hiddenIds.value = new Set([...hiddenIds.value, announcementId])
}

const toggleExpanded = (announcementId) => {
  const updated = new Set(expandedIds.value)
  if (updated.has(announcementId)) updated.delete(announcementId)
  else updated.add(announcementId)
  expandedIds.value = updated
}

const isExpanded = (announcementId) => expandedIds.value.has(announcementId)

const PREVIEW_LENGTH = 220

const needsReadMore = (content) => (content || '').length > PREVIEW_LENGTH

const getPreviewContent = (announcement) => {
  const content = announcement?.content || ''
  if (isExpanded(announcement.id)) return content
  if (!needsReadMore(content)) return content
  return `${content.slice(0, PREVIEW_LENGTH).trim()}...`
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

onMounted(fetchActiveAnnouncements)
</script>

<template>
  <div
    v-if="isLoading || hasAnnouncements"
    class="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md"
  >
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300">📣</div>
        <div>
          <p class="text-sm font-semibold text-white">Duyuru Merkezi</p>
          <p class="text-xs text-slate-400">Güncel sistem bilgilendirmeleri</p>
        </div>
      </div>
      <button
        v-if="hiddenCount > 0 && !showAll"
        type="button"
        @click="showAll = true"
        class="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
      >
        +{{ hiddenCount }} daha
      </button>
      <button
        v-else-if="showAll && announcements.length > 2"
        type="button"
        @click="showAll = false"
        class="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
      >
        Daha az göster
      </button>
    </div>

    <div v-if="isLoading" class="rounded-xl bg-slate-900/40 px-3 py-4 text-sm text-slate-400">
      Duyurular yükleniyor...
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="announcement in visibleAnnouncements"
        :key="announcement.id"
        class="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-3"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <button
              type="button"
              @click="toggleExpanded(announcement.id)"
              class="text-left text-sm font-semibold text-white hover:text-blue-300 transition"
            >
              {{ announcement.title }}
            </button>
            <p class="mt-0.5 text-xs text-slate-500">{{ formatDate(announcement.created_at) }}</p>
            <p class="mt-1 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap">
              {{ getPreviewContent(announcement) }}
            </p>
            <button
              v-if="needsReadMore(announcement.content)"
              type="button"
              @click="toggleExpanded(announcement.id)"
              class="mt-1 text-xs font-medium text-blue-300 hover:text-blue-200"
            >
              {{ isExpanded(announcement.id) ? 'Daha az' : 'Devamını oku' }}
            </button>
          </div>

          <button
            type="button"
            @click="closeBanner(announcement.id)"
            class="shrink-0 rounded-md px-2 py-1 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Duyuruyu kapat"
          >
            ✕
          </button>
        </div>
      </div>

      <div v-if="!hasAnnouncements" class="rounded-xl bg-slate-900/40 px-3 py-4 text-sm text-slate-500">
        Aktif duyuru bulunmuyor.
      </div>
    </div>
  </div>
</template>
