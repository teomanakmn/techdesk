<script setup>
import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  open: { type: Boolean, default: false },
  ticket: { type: Object, default: null },
  comments: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'saved'])

const authStore = useAuthStore()
const isSaving = ref(false)
const errorMsg = ref('')

const form = ref({
  title: '',
  category: 'Yazılım',
  content: '',
})

const categoryOptions = ['Network', 'Donanım', 'Yazılım']

const latestCommentText = computed(() => {
  if (!props.comments?.length) return ''
  const sorted = [...props.comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return sorted[0]?.content?.trim() || ''
})

const buildDefaultContent = () => {
  const issue = props.ticket?.description?.trim() || '-'
  const solution = latestCommentText.value || ''
  return `Sorun Açıklaması: ${issue}\n\nÇözüm: ${solution}`
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen || !props.ticket) return
    errorMsg.value = ''
    form.value = {
      title: props.ticket.title || '',
      category: 'Yazılım',
      content: buildDefaultContent(),
    }
  }
)

const closeModal = () => emit('close')

const submitArticle = async () => {
  errorMsg.value = ''

  if (!form.value.title.trim()) {
    errorMsg.value = 'Makale başlığı zorunludur.'
    return
  }
  if (!form.value.content.trim()) {
    errorMsg.value = 'Makale içeriği zorunludur.'
    return
  }

  const basePayload = {
    title: form.value.title.trim(),
    content: form.value.content.trim(),
    category: form.value.category,
    author_id: authStore.user?.id || null,
  }

  try {
    isSaving.value = true

    // source_ticket_id kolonu varsa kaydet, yoksa geriye dönük uyumluluk için tekrar dene.
    let insertError = null
    const withSource = await supabase
      .from('articles')
      .insert({ ...basePayload, source_ticket_id: props.ticket?.id || null })
    insertError = withSource.error

    if (insertError && insertError.message?.toLowerCase().includes('source_ticket_id')) {
      const fallback = await supabase.from('articles').insert(basePayload)
      insertError = fallback.error
    }

    if (insertError) throw insertError

    emit('saved')
    closeModal()
  } catch (error) {
    console.error('Tickettan makale oluşturulamadı:', error)
    errorMsg.value = `Makale oluşturulamadı: ${error.message}`
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open && ticket" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="closeModal"></div>

      <div class="relative w-full max-w-2xl rounded-2xl border border-white/20 bg-slate-900/95 shadow-2xl backdrop-blur-xl">
        <div class="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h3 class="text-lg font-semibold text-white">Bilgi Bankasına Kaydet</h3>
          <button @click="closeModal" class="text-slate-400 transition hover:text-white">✕</button>
        </div>

        <form @submit.prevent="submitArticle" class="space-y-4 px-6 py-5">
          <div v-if="errorMsg" class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {{ errorMsg }}
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-blue-200">Başlık</label>
            <input
              v-model="form.title"
              type="text"
              class="w-full rounded-xl border border-white/15 bg-slate-900/40 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-blue-200">Kategori</label>
            <select
              v-model="form.category"
              class="w-full rounded-xl border border-white/15 bg-slate-900/40 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option v-for="category in categoryOptions" :key="category" :value="category">{{ category }}</option>
            </select>
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-blue-200">İçerik</label>
            <textarea
              v-model="form.content"
              rows="9"
              class="w-full resize-none rounded-xl border border-white/15 bg-slate-900/40 px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p class="mt-2 text-xs text-slate-400">
              Sorun açıklaması tickettan otomatik doldurulur; çözüm bölümünü düzenleyebilirsiniz.
            </p>
          </div>

          <div class="flex justify-end gap-3 pt-1">
            <button
              type="button"
              @click="closeModal"
              class="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              İptal
            </button>
            <button
              type="submit"
              :disabled="isSaving"
              class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-800"
            >
              {{ isSaving ? 'Kaydediliyor...' : 'Kaydet' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
