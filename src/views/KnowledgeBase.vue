<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabaseClient'

const authStore = useAuthStore()

const isLoading = ref(true)
const loadError = ref('')
const articles = ref([])
const searchQuery = ref('')
const selectedCategory = ref('Tümü')

const showDetailModal = ref(false)
const selectedArticle = ref(null)

const showCreateModal = ref(false)
const isEditingArticle = ref(false)
const editingArticleId = ref(null)
const isSavingArticle = ref(false)
const saveError = ref('')
const saveSuccess = ref(false)
const newArticle = ref({
  title: '',
  content: '',
  category: 'Network',
})

const canCreateArticle = computed(() => ['admin', 'it_staff'].includes(authStore.userRole))
const canManageArticle = computed(() => ['admin', 'it_staff'].includes(authStore.userRole))

const categoryBase = ['Tümü', 'Network', 'Donanım', 'Yazılım']
const categories = computed(() => {
  const dynamic = [...new Set(articles.value.map(a => a.category).filter(Boolean))]
  return [...new Set([...categoryBase, ...dynamic])]
})

const categoryClasses = {
  Network: 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40',
  Donanım: 'bg-amber-500/20 text-amber-200 border border-amber-400/40',
  Yazılım: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40',
}

const normalizedSearch = computed(() => searchQuery.value.trim().toLowerCase())

const filteredArticles = computed(() => {
  return articles.value.filter((article) => {
    const categoryMatch = selectedCategory.value === 'Tümü' || article.category === selectedCategory.value
    const searchMatch =
      normalizedSearch.value.length === 0 ||
      article.title.toLowerCase().includes(normalizedSearch.value) ||
      article.content.toLowerCase().includes(normalizedSearch.value) ||
      article.author_name.toLowerCase().includes(normalizedSearch.value)

    return categoryMatch && searchMatch
  })
})

const articleSummary = (content) => {
  const plain = (content || '').replace(/\s+/g, ' ').trim()
  if (!plain) return 'Özet bulunmuyor.'
  return plain.length > 140 ? `${plain.slice(0, 140)}...` : plain
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const fetchArticles = async () => {
  isLoading.value = true
  loadError.value = ''
  try {
    const { data, error } = await supabase
      .from('articles')
      .select(`
        id,
        title,
        content,
        category,
        author_id,
        created_at,
        profiles:author_id ( full_name )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    articles.value = (data || []).map((article) => ({
      ...article,
      author_name: article.profiles?.full_name?.trim() || 'Yazar bilgisi yok',
    }))
  } catch (error) {
    console.error('Bilgi bankasi yukleme hatasi:', error)
    loadError.value = 'Makaleler yüklenemedi. "articles" tablosunu kontrol edin.'
  } finally {
    isLoading.value = false
  }
}

const openArticleDetail = (article) => {
  selectedArticle.value = article
  showDetailModal.value = true
}

const closeArticleDetail = () => {
  selectedArticle.value = null
  showDetailModal.value = false
}

const openCreateModal = () => {
  isEditingArticle.value = false
  editingArticleId.value = null
  newArticle.value = { title: '', content: '', category: 'Network' }
  saveError.value = ''
  saveSuccess.value = false
  showCreateModal.value = true
}

const openEditModal = (article) => {
  isEditingArticle.value = true
  editingArticleId.value = article.id
  newArticle.value = {
    title: article.title || '',
    content: article.content || '',
    category: article.category || 'Network',
  }
  saveError.value = ''
  saveSuccess.value = false
  showCreateModal.value = true
  closeArticleDetail()
}

const closeCreateModal = () => {
  showCreateModal.value = false
  isEditingArticle.value = false
  editingArticleId.value = null
}

const createArticle = async () => {
  saveError.value = ''
  saveSuccess.value = false

  if (!newArticle.value.title.trim()) {
    saveError.value = 'Makale başlığı zorunludur.'
    return
  }
  if (!newArticle.value.content.trim()) {
    saveError.value = 'Makale içeriği zorunludur.'
    return
  }
  if (!newArticle.value.category) {
    saveError.value = 'Kategori seçiniz.'
    return
  }

  try {
    isSavingArticle.value = true

    let error = null
    if (isEditingArticle.value && editingArticleId.value) {
      const updateResult = await supabase
        .from('articles')
        .update({
          title: newArticle.value.title.trim(),
          content: newArticle.value.content.trim(),
          category: newArticle.value.category,
        })
        .eq('id', editingArticleId.value)
      error = updateResult.error
    } else {
      const insertResult = await supabase
        .from('articles')
        .insert({
          title: newArticle.value.title.trim(),
          content: newArticle.value.content.trim(),
          category: newArticle.value.category,
          author_id: authStore.user?.id,
        })
      error = insertResult.error
    }

    if (error) throw error

    saveSuccess.value = true
    await fetchArticles()

    setTimeout(() => {
      showCreateModal.value = false
      saveSuccess.value = false
    }, 700)
  } catch (error) {
    console.error('Makale ekleme hatasi:', error)
    saveError.value = `Makale kaydedilemedi: ${error.message}`
  } finally {
    isSavingArticle.value = false
  }
}

const deleteArticle = async (article) => {
  const confirmed = window.confirm(`"${article.title}" makalesini silmek istediginize emin misiniz?`)
  if (!confirmed) return

  try {
    const { error } = await supabase
      .from('articles')
      .delete()
      .eq('id', article.id)

    if (error) throw error

    closeArticleDetail()
    await fetchArticles()
  } catch (error) {
    console.error('Makale silme hatasi:', error)
    window.alert(`Makale silinemedi: ${error.message}`)
  }
}

onMounted(() => {
  fetchArticles()
})
</script>

<template>
  <div class="min-h-[70vh] bg-gradient-to-br from-slate-900/80 via-blue-950/70 to-slate-900/80 rounded-2xl border border-white/10 p-5 md:p-8">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl md:text-3xl font-bold text-white">Bilgi Bankası</h1>
        <p class="text-blue-200/90 mt-1">Sık karşılaşılan teknik sorunlar ve çözüm rehberleri.</p>
      </div>

      <button
        v-if="canCreateArticle"
        @click="openCreateModal"
        class="self-start md:self-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl border border-blue-400/30 shadow-lg shadow-blue-600/25 transition-all"
      >
        + Yeni Makale Ekle
      </button>
    </div>

    <div class="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 mb-5">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Makale ara (başlık, içerik, yazar)..."
        class="w-full px-4 py-3 border border-white/15 rounded-xl bg-slate-900/40 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>

    <div class="flex flex-wrap gap-2 mb-6">
      <button
        v-for="category in categories"
        :key="category"
        @click="selectedCategory = category"
        :class="[
          'px-3 py-1.5 text-sm font-medium rounded-xl border transition-all',
          selectedCategory === category
            ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/30'
            : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/10 hover:text-white'
        ]"
      >
        {{ category }}
      </button>
    </div>

    <div v-if="loadError" class="mb-5 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl px-4 py-3 text-sm">
      {{ loadError }}
    </div>

    <div v-if="isLoading" class="py-16 text-center">
      <div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
      <p class="text-slate-400 text-sm mt-3 mb-6">Makaleler yükleniyor...</p>
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div
          v-for="i in 6"
          :key="i"
          class="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 text-left"
        >
          <div class="h-4 w-2/3 bg-white/15 rounded animate-pulse mb-3"></div>
          <div class="h-3 w-1/3 bg-white/10 rounded animate-pulse mb-4"></div>
          <div class="space-y-2 mb-4">
            <div class="h-3 w-full bg-white/10 rounded animate-pulse"></div>
            <div class="h-3 w-5/6 bg-white/10 rounded animate-pulse"></div>
            <div class="h-3 w-2/3 bg-white/10 rounded animate-pulse"></div>
          </div>
          <div class="flex justify-between">
            <div class="h-3 w-1/4 bg-white/10 rounded animate-pulse"></div>
            <div class="h-3 w-1/5 bg-white/10 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="filteredArticles.length === 0" class="py-16 text-center bg-white/5 border border-white/10 rounded-2xl">
      <p class="text-slate-400 text-sm">Aramanıza uygun makale bulunamadı.</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <button
        v-for="article in filteredArticles"
        :key="article.id"
        @click="openArticleDetail(article)"
        class="group text-left bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-5 hover:bg-white/15 hover:border-white/25 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-950/40 transition-all duration-300"
      >
        <div class="flex items-start justify-between gap-3 mb-3">
          <h2 class="text-white font-semibold leading-snug line-clamp-2 transition-colors duration-300 group-hover:text-cyan-100">{{ article.title }}</h2>
          <span :class="['shrink-0 px-2 py-0.5 text-xs rounded-md font-medium', categoryClasses[article.category] || 'bg-slate-500/20 text-slate-200 border border-slate-400/40']">
            {{ article.category }}
          </span>
        </div>

        <p class="text-slate-300 text-sm leading-relaxed line-clamp-3 mb-4 transition-colors duration-300 group-hover:text-slate-200">
          {{ articleSummary(article.content) }}
        </p>

        <div class="text-xs text-slate-400 flex items-center justify-between">
          <span>{{ article.author_name }}</span>
          <span>{{ formatDate(article.created_at) }}</span>
        </div>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showDetailModal && selectedArticle" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60" @click="closeArticleDetail"></div>

      <div class="relative w-full max-w-3xl bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto">
        <div class="sticky top-0 z-10 px-6 py-4 border-b border-white/10 bg-slate-900/95 backdrop-blur-xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-xl font-bold text-white">{{ selectedArticle.title }}</h3>
              <div class="flex items-center gap-2 mt-2 text-xs text-slate-400">
                <span :class="['px-2 py-0.5 rounded-md font-medium', categoryClasses[selectedArticle.category] || 'bg-slate-500/20 text-slate-200 border border-slate-400/40']">
                  {{ selectedArticle.category }}
                </span>
                <span>{{ selectedArticle.author_name }}</span>
                <span>{{ formatDate(selectedArticle.created_at) }}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="canManageArticle"
                @click="openEditModal(selectedArticle)"
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600/80 hover:bg-blue-500 text-white border border-blue-400/30"
              >
                Duzenle
              </button>
              <button
                v-if="canManageArticle"
                @click="deleteArticle(selectedArticle)"
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600/80 hover:bg-red-500 text-white border border-red-400/30"
              >
                Sil
              </button>
              <button @click="closeArticleDetail" class="text-slate-400 hover:text-white text-xl leading-none">×</button>
            </div>
          </div>
        </div>

        <div class="px-6 py-5">
          <p class="text-slate-200 whitespace-pre-wrap leading-relaxed text-sm md:text-base">
            {{ selectedArticle.content }}
          </p>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/60" @click="closeCreateModal"></div>

      <div class="relative w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-white">
            {{ isEditingArticle ? 'Makale Duzenle' : 'Yeni Makale Ekle' }}
          </h3>
          <button @click="closeCreateModal" class="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <form @submit.prevent="createArticle" class="px-6 py-5 space-y-4">
          <div v-if="saveError" class="bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl px-4 py-3 text-sm">
            {{ saveError }}
          </div>
          <div v-if="saveSuccess" class="bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 rounded-xl px-4 py-3 text-sm">
            {{ isEditingArticle ? 'Makale başarıyla güncellendi.' : 'Makale başarıyla eklendi.' }}
          </div>

          <div>
            <label class="block text-sm font-medium text-blue-200 mb-2">Başlık</label>
            <input
              v-model="newArticle.title"
              type="text"
              class="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-slate-900/40 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Örn: VPN bağlantı sorunu çözümü"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-blue-200 mb-2">Kategori</label>
            <select
              v-model="newArticle.category"
              class="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-slate-900/40 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option>Network</option>
              <option>Donanım</option>
              <option>Yazılım</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-blue-200 mb-2">İçerik</label>
            <textarea
              v-model="newArticle.content"
              rows="8"
              class="w-full px-4 py-2.5 border border-white/15 rounded-xl bg-slate-900/40 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Çözüm adımlarını detaylı şekilde yazın..."
            ></textarea>
          </div>

          <div class="flex justify-end pt-1">
            <button
              type="submit"
              :disabled="isSavingArticle"
              class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white text-sm font-semibold rounded-xl border border-blue-400/30 shadow-lg shadow-blue-600/25 transition-all"
            >
              <span v-if="isSavingArticle">Kaydediliyor...</span>
              <span v-else>{{ isEditingArticle ? 'Güncelle' : 'Kaydet' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
