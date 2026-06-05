<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'

const announcements = ref([])
const isLoading = ref(true)
const loadError = ref('')
const isSaving = ref(false)
const saveError = ref('')
const form = ref({
  title: '',
  content: '',
})

const hasAnnouncements = computed(() => announcements.value.length > 0)

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const fetchAnnouncements = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    announcements.value = data || []
  } catch (error) {
    console.error('Duyurular yüklenemedi:', error)
    loadError.value = `Duyurular yüklenemedi: ${error.message}`
    announcements.value = []
  } finally {
    isLoading.value = false
  }
}

const publishAnnouncement = async () => {
  saveError.value = ''

  if (!form.value.title.trim()) {
    saveError.value = 'Başlık zorunludur.'
    return
  }
  if (!form.value.content.trim()) {
    saveError.value = 'İçerik zorunludur.'
    return
  }

  try {
    isSaving.value = true
    const { error } = await supabase
      .from('announcements')
      .insert({
        title: form.value.title.trim(),
        content: form.value.content.trim(),
        is_active: true,
      })

    if (error) throw error
    form.value = { title: '', content: '' }
    await fetchAnnouncements()
  } catch (error) {
    console.error('Duyuru yayınlanamadı:', error)
    saveError.value = `Duyuru yayınlanamadı: ${error.message}`
  } finally {
    isSaving.value = false
  }
}

const toggleAnnouncementStatus = async (announcement) => {
  const nextStatus = !announcement.is_active

  const { error } = await supabase
    .from('announcements')
    .update({ is_active: nextStatus })
    .eq('id', announcement.id)

  if (error) {
    console.error('Duyuru durumu güncellenemedi:', error)
    window.alert(`Durum güncellenemedi: ${error.message}`)
    return
  }

  announcement.is_active = nextStatus
}

const deleteAnnouncement = async (announcement) => {
  const confirmed = window.confirm(`"${announcement.title}" duyurusunu silmek istediğinize emin misiniz?`)
  if (!confirmed) return

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', announcement.id)

  if (error) {
    console.error('Duyuru silinemedi:', error)
    window.alert(`Duyuru silinemedi: ${error.message}`)
    return
  }

  announcements.value = announcements.value.filter((item) => item.id !== announcement.id)
}

onMounted(fetchAnnouncements)
</script>

<template>
  <div class="space-y-7">
    <div>
      <h1 class="text-3xl font-bold text-white">Duyuru Panosu</h1>
      <p class="mt-1 text-blue-300">Kullanıcılara gösterilecek sistem duyurularını yönetin.</p>
    </div>

    <div class="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
      <h2 class="text-lg font-semibold text-white mb-4">Yeni Duyuru Yayınla</h2>

      <div v-if="saveError" class="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {{ saveError }}
      </div>

      <form @submit.prevent="publishAnnouncement" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-blue-200 mb-2">Başlık</label>
          <input
            v-model="form.title"
            type="text"
            placeholder="Örn: Planlı Bakım Duyurusu"
            class="w-full rounded-xl border border-white/15 bg-slate-900/40 px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-blue-200 mb-2">İçerik</label>
          <textarea
            v-model="form.content"
            rows="4"
            placeholder="Duyuru içeriğini paragraf formatında yazın..."
            class="w-full rounded-xl border border-white/15 bg-slate-900/40 px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div class="flex justify-end">
          <button
            type="submit"
            :disabled="isSaving"
            class="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-800"
          >
            {{ isSaving ? 'Yayınlanıyor...' : 'Yayınla' }}
          </button>
        </div>
      </form>
    </div>

    <div class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
      <div class="px-6 py-4 border-b border-white/10">
        <h2 class="text-lg font-semibold text-white">Mevcut Duyurular</h2>
      </div>

      <div v-if="loadError" class="m-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        {{ loadError }}
      </div>

      <div v-else-if="isLoading" class="p-10 text-center text-sm text-slate-400">Duyurular yükleniyor...</div>

      <div v-else-if="!hasAnnouncements" class="p-10 text-center text-sm text-slate-500">Henüz duyuru bulunmuyor.</div>

      <div v-else class="divide-y divide-white/10">
        <div
          v-for="announcement in announcements"
          :key="announcement.id"
          class="px-6 py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1.5">
              <p class="text-white font-semibold truncate">{{ announcement.title }}</p>
              <span
                :class="announcement.is_active ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' : 'bg-slate-500/20 text-slate-300 border-slate-400/30'"
                class="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
              >
                {{ announcement.is_active ? 'Aktif' : 'Pasif' }}
              </span>
            </div>
            <p class="text-sm text-slate-300 leading-relaxed">{{ announcement.content }}</p>
            <p class="text-xs text-slate-500 mt-2">{{ formatDate(announcement.created_at) }}</p>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <label class="inline-flex items-center gap-2 cursor-pointer">
              <span class="text-xs text-slate-400">Aktif/Pasif</span>
              <button
                type="button"
                @click="toggleAnnouncementStatus(announcement)"
                :class="announcement.is_active ? 'bg-emerald-500' : 'bg-slate-600'"
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              >
                <span
                  :class="announcement.is_active ? 'translate-x-6' : 'translate-x-1'"
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                />
              </button>
            </label>

            <button
              type="button"
              @click="deleteAnnouncement(announcement)"
              class="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
            >
              Sil
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
