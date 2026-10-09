import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'
import { useNotificationsStore } from './notifications'

const pendingProfiles = new WeakMap()
const BLOCKED_KEY = 'techdesk.session-blocked'
const storage = typeof window !== 'undefined' ? window.localStorage : null

// Cached role/name values from older releases never authorize a session.
for (const key of ['techdesk_last_role', 'techdesk_last_full_name', 'techdesk_last_email']) {
  storage?.removeItem(key)
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null, profile: null, profileError: '', isLoading: true,
    actionLoading: false, authSubscription: null, generation: 0, profileRequest: 0,
    sessionBlocked: storage?.getItem(BLOCKED_KEY) === 'true',
  }),
  getters: {
    isAuthenticated: state => !!state.user && state.profile?.id === state.user.id,
    userRole: state => state.profile?.id === state.user?.id ? state.profile?.role : null,
    fullName: state => state.profile?.full_name || '',
    emailAddress: state => state.user?.email || '',
  },
  actions: {
        _translateError(msg) {
            const translations = {
                'Invalid login credentials': 'E-posta veya şifre hatalı.',
                'Email not confirmed': 'E-posta adresiniz henüz doğrulanmamış.',
                'User already registered': 'Bu e-posta adresi zaten kayıtlı.',
                'Password should be at least 8 characters': 'Şifre en az 8 karakter olmalıdır.',
                'Unable to validate email address: invalid format': 'Geçersiz e-posta formatı.',
                'Signup requires a valid password': 'Geçerli bir şifre giriniz.',
                'email rate limit exceeded': 'Çok fazla deneme yapıldı. Lütfen biraz bekleyin.',
                'For security purposes, you can only request this after': 'Güvenlik nedeniyle lütfen biraz bekleyip tekrar deneyin.',
            }
            // Tam eşleşme kontrolü
            if (translations[msg]) return translations[msg]
            // Kısmi eşleşme kontrolü (uzun mesajlar için)
            for (const [key, value] of Object.entries(translations)) {
                if (msg.includes(key)) return value
            }
            return msg // Çeviri bulunamazsa orijinal mesajı döndür
        },


    clearSession() {
      this.generation += 1
      this.profileRequest += 1
      this.user = null
      this.profile = null
      this.profileError = ''
      useNotificationsStore().reset()
    },
    setUser(user) {
      if (this.user?.id !== user?.id) this.clearSession()
      this.user = user || null
    },
    async initAuth() {
      this.authSubscription?.unsubscribe()
      // Never await Supabase calls inside its auth callback (the auth lock is held).
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          this.clearSession()
          return
        }
        if (this.sessionBlocked) return
        this.setUser(session?.user)
        this.profile = null
        const generation = this.generation
        setTimeout(() => {
          if (generation === this.generation && this.user && (!this.profile || event === 'TOKEN_REFRESHED')) void this.fetchProfile()
        }, 0)
      })
      this.authSubscription = data.subscription
      try { await this.recoverSession() }
      finally { this.isLoading = false }
    },
    fetchProfile() {
      const existing = pendingProfiles.get(this)
      if (existing?.id === this.user?.id && existing?.generation === this.generation) return existing.promise
      const entry = { id: this.user?.id, generation: this.generation }
      entry.promise = this._fetchProfile().finally(() => {
        if (pendingProfiles.get(this) === entry) pendingProfiles.delete(this)
      })
      pendingProfiles.set(this, entry)
      return entry.promise
    },
    async _fetchProfile() {
      const id = this.user?.id
      if (!id) return false
      const generation = this.generation
      const request = ++this.profileRequest
      this.profile = null
      this.profileError = ''
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
        if (error) throw error
        if (!data || data.id !== id || !['user', 'it_staff', 'admin'].includes(data.role)) throw new Error('Profil doğrulanamadı.')
        if (generation !== this.generation || request !== this.profileRequest) return false
        this.profile = data
        return true
      } catch {
        if (generation === this.generation && request === this.profileRequest) {
          this.profileError = 'Profil doğrulanamadı. Bağlantıyı kontrol edip yeniden giriş yapın.'
          this.profile = null
        }
        return false
      }
    },
    async recoverSession() {
      if (this.sessionBlocked) return
      const generation = this.generation
      this.profile = null
      try {
        const { data, error } = await supabase.auth.getUser()
        if (generation !== this.generation) return
        if (error || !data.user) { this.clearSession(); return }
        this.setUser(data.user)
        await this.fetchProfile()
      } catch {
        if (generation === this.generation) this.clearSession()
      }
    },
    async signIn(email, password) {
      this.actionLoading = true
      this.sessionBlocked = false
      storage?.removeItem(BLOCKED_KEY)
      this.clearSession()
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        this.setUser(data.user)
        if (!await this.fetchProfile()) throw new Error(this.profileError)
        return { success: true }
      } catch (error) {
        this.profile = null
        return { success: false, error: this._translateError(error.message) }
      } finally { this.actionLoading = false }
    },
    async signUp(email, password, fullName) {
      this.actionLoading = true
      try {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
        if (error) throw error
        return { success: true }
      } catch (error) { return { success: false, error: this._translateError(error.message) } }
      finally { this.actionLoading = false }
    },
    async signOut() {
      this.sessionBlocked = true
      storage?.setItem(BLOCKED_KEY, 'true')
      this.clearSession() // Clear before network I/O and invalidate in-flight responses.
      let result
      try { result = await supabase.auth.signOut({ scope: 'local' }) }
      finally { storage?.removeItem('techdesk.auth') }
      if (result.error) throw new Error('Oturum yerelde kapatıldı; sunucuya çıkış bildirilemedi.')
    },
  },
})
