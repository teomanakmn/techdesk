/**
 * Auth Store — Kimlik Doğrulama State Yönetimi
 * =============================================
 * Supabase Auth ile kullanıcı oturum yönetimini sağlar.
 *
 * State:
 *   user    → Supabase auth kullanıcısı (email, id vb.)
 *   profile → profiles tablosundaki ek bilgiler (role, full_name)
 *   isLoading → Auth işlemleri sırasında loading durumu
 *
 * Actions:
 *   initAuth()    → Sayfa yüklendiğinde mevcut oturumu kontrol eder
 *   signUp()      → Yeni kullanıcı kaydı
 *   signIn()      → Email/şifre ile giriş
 *   signOut()     → Oturumu sonlandırır
 *   fetchProfile()→ profiles tablosundan kullanıcı bilgisini çeker
 */

import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

const ROLE_CACHE_KEY = 'techdesk_last_role'
const NAME_CACHE_KEY = 'techdesk_last_full_name'
const EMAIL_CACHE_KEY = 'techdesk_last_email'

export const useAuthStore = defineStore('auth', {
    // ─── Reaktif State ───────────────────────────────────────
    state: () => ({
        user: null,          // Supabase auth user objesi
        profile: null,       // profiles tablosundaki satır
        lastKnownRole: localStorage.getItem(ROLE_CACHE_KEY) || null,
        lastKnownFullName: localStorage.getItem(NAME_CACHE_KEY) || '',
        lastKnownEmail: localStorage.getItem(EMAIL_CACHE_KEY) || '',
        isLoading: true,     // Uygulama başlangıcında true (App.vue loading spinner)
        actionLoading: false, // signIn/signUp işlemi sırasında true (buton loading)
        authSubscription: null, // onAuthStateChange unsubscribe referansı
    }),

    // ─── Computed Değerler ───────────────────────────────────
    getters: {
        // Kullanıcı giriş yapmış mı?
        isAuthenticated: (state) => !!state.user,

        // Kullanıcının rolü (varsayılan: 'user')
        userRole: (state) => state.profile?.role || state.lastKnownRole || 'user',

        // Kullanıcının tam adı
        fullName: (state) => state.profile?.full_name || state.lastKnownFullName || '',

        // Kullanıcının e-postası (geçici auth dalgalanmalarında kaybolmasın)
        emailAddress: (state) => state.user?.email || state.lastKnownEmail || '',
    },

    // ─── Action'lar ──────────────────────────────────────────
    actions: {
        /**
         * translateError — Supabase hata mesajlarını Türkçeye çevirir
         */
        _translateError(msg) {
            const translations = {
                'Invalid login credentials': 'E-posta veya şifre hatalı.',
                'Email not confirmed': 'E-posta adresiniz henüz doğrulanmamış.',
                'User already registered': 'Bu e-posta adresi zaten kayıtlı.',
                'Password should be at least 6 characters': 'Şifre en az 6 karakter olmalıdır.',
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

        /**
         * initAuth — Uygulama başlangıcında çağrılır (App.vue)
         * 1. Mevcut oturumu kontrol eder
         * 2. Auth durumu değişikliklerini dinler (login/logout)
         */
        async initAuth() {
            try {
                this.isLoading = true

                // Mevcut oturumu al
                const { data: { session } } = await supabase.auth.getSession()

                if (session?.user) {
                    this.user = session.user
                    this.lastKnownEmail = session.user.email || this.lastKnownEmail
                    if (this.lastKnownEmail) localStorage.setItem(EMAIL_CACHE_KEY, this.lastKnownEmail)
                    await this.fetchProfile()
                }

                // Eski listener varsa temizle (hot reload / tekrar init durumlari icin)
                if (this.authSubscription) {
                    this.authSubscription.unsubscribe()
                    this.authSubscription = null
                }

                // Auth durumu değişikliklerini dinle
                // (başka sekmede logout olunursa, token yenilenirse vb.)
                const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
                    if (event === 'SIGNED_IN' && session?.user) {
                        this.user = session.user
                        this.lastKnownEmail = session.user.email || this.lastKnownEmail
                        if (this.lastKnownEmail) localStorage.setItem(EMAIL_CACHE_KEY, this.lastKnownEmail)
                        await this.fetchProfile()
                    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
                        this.user = session.user
                        this.lastKnownEmail = session.user.email || this.lastKnownEmail
                        if (this.lastKnownEmail) localStorage.setItem(EMAIL_CACHE_KEY, this.lastKnownEmail)
                        if (!this.profile) {
                            await this.fetchProfile()
                        }
                    } else if (event === 'SIGNED_OUT') {
                        this.user = null
                        this.profile = null
                        this.lastKnownRole = null
                        this.lastKnownFullName = ''
                        this.lastKnownEmail = ''
                        localStorage.removeItem(ROLE_CACHE_KEY)
                        localStorage.removeItem(NAME_CACHE_KEY)
                        localStorage.removeItem(EMAIL_CACHE_KEY)
                    }
                })
                this.authSubscription = data?.subscription || null
            } catch (error) {
                console.error('Auth başlatma hatası:', error)
            } finally {
                this.isLoading = false
            }
        },

        /**
         * signUp — Yeni kullanıcı kaydı
         * @param {string} email    - Kullanıcı email'i
         * @param {string} password - Şifre (min 6 karakter)
         * @param {string} fullName - Ad Soyad
         * @returns {{ success: boolean, error?: string }}
         *
         * NOT: Kayıt başarılı olduğunda trigger otomatik olarak
         *      profiles tablosuna satır ekler (schema.sql'deki trigger)
         */
        async signUp(email, password, fullName) {
            try {
                this.actionLoading = true

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        // Bu metadata trigger fonksiyonu tarafından okunur
                        // ve profiles.full_name alanına yazılır
                        data: { full_name: fullName },
                    },
                })

                if (error) throw error

                return { success: true }
            } catch (error) {
                console.error('Kayıt hatası:', error)
                return { success: false, error: this._translateError(error.message) }
            } finally {
                this.actionLoading = false
            }
        },

        /**
         * signIn — Email ve şifre ile giriş
         * @param {string} email
         * @param {string} password
         * @returns {{ success: boolean, error?: string }}
         */
        async signIn(email, password) {
            try {
                this.actionLoading = true

                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })

                if (error) throw error

                // Giriş başarılı → user state güncellenir (onAuthStateChange da tetiklenir)
                this.user = data.user
                this.lastKnownEmail = data.user?.email || this.lastKnownEmail
                if (this.lastKnownEmail) localStorage.setItem(EMAIL_CACHE_KEY, this.lastKnownEmail)
                await this.fetchProfile()

                return { success: true }
            } catch (error) {
                console.error('Giriş hatası:', error)
                return { success: false, error: this._translateError(error.message) }
            } finally {
                this.actionLoading = false
            }
        },

        /**
         * signOut — Kullanıcı oturumunu sonlandırır
         */
        async signOut() {
            try {
                await supabase.auth.signOut()
            } catch (error) {
                console.error('Çıkış hatası:', error)
            } finally {
                // Hata olsa bile state'i temizle
                this.user = null
                this.profile = null
                this.lastKnownRole = null
                this.lastKnownFullName = ''
                this.lastKnownEmail = ''
                localStorage.removeItem(ROLE_CACHE_KEY)
                localStorage.removeItem(NAME_CACHE_KEY)
                localStorage.removeItem(EMAIL_CACHE_KEY)
            }
        },

        /**
         * recoverSession — Sekme geri aktif olduğunda oturumu tekrar doğrular.
         * Token yenileme / askıya alma sonrası donma etkisini azaltır.
         */
        async recoverSession() {
            try {
                const { data: { session }, error } = await supabase.auth.getSession()
                if (error) throw error

                if (session?.user) {
                    this.user = session.user
                    this.lastKnownEmail = session.user.email || this.lastKnownEmail
                    if (this.lastKnownEmail) localStorage.setItem(EMAIL_CACHE_KEY, this.lastKnownEmail)
                    if (!this.profile || this.profile.id !== session.user.id) {
                        await this.fetchProfile()
                    }
                } else {
                    // Geçici ağ dalgalanmalarında false-null dönebiliyor.
                    // Varsa refresh token ile bir kez daha toparlamayı dene.
                    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession()
                    if (!refreshError && refreshed?.session?.user) {
                        this.user = refreshed.session.user
                        this.lastKnownEmail = refreshed.session.user.email || this.lastKnownEmail
                        if (this.lastKnownEmail) localStorage.setItem(EMAIL_CACHE_KEY, this.lastKnownEmail)
                        if (!this.profile || this.profile.id !== refreshed.session.user.id) {
                            await this.fetchProfile()
                        }
                    }
                }
            } catch (error) {
                console.error('Oturum toparlama hatası:', error)
                // Geçici hatada mevcut state'i koru; kullanıcıyı anlık düşürme.
            }
        },

        /**
         * fetchProfile — profiles tablosundan kullanıcı bilgisini çeker
         * Supabase RLS sayesinde sadece kendi profilini görebilir
         */
        async fetchProfile() {
            if (!this.user) return

            const tryFetchProfile = async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', this.user.id)
                    .single()
                if (error) throw error
                return data
            }

            try {
                const data = await tryFetchProfile()
                this.profile = data
                this.lastKnownRole = data?.role || this.lastKnownRole
                this.lastKnownFullName = data?.full_name || this.lastKnownFullName

                if (this.lastKnownRole) localStorage.setItem(ROLE_CACHE_KEY, this.lastKnownRole)
                if (this.lastKnownFullName) localStorage.setItem(NAME_CACHE_KEY, this.lastKnownFullName)
            } catch (error) {
                // Kısa ağ/yenileme kopmalarında kullanıcıyı "user" rolüne düşürmemek için
                // bir kez daha deneriz. Yine olmazsa cache'deki rol korunur.
                try {
                    const data = await tryFetchProfile()
                    this.profile = data
                    this.lastKnownRole = data?.role || this.lastKnownRole
                    this.lastKnownFullName = data?.full_name || this.lastKnownFullName
                    if (this.lastKnownRole) localStorage.setItem(ROLE_CACHE_KEY, this.lastKnownRole)
                    if (this.lastKnownFullName) localStorage.setItem(NAME_CACHE_KEY, this.lastKnownFullName)
                } catch (retryError) {
                    console.error('Profil çekme hatası:', retryError)
                }
            }
        },
    },
})
