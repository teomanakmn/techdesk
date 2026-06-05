/**
 * useNotificationsStore — Bildirim Yönetimi
 * ==========================================
 * Supabase Realtime ile anlık bildirim güncellemeleri.
 */
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    notifications: [],
    isLoaded: false,
    realtimeChannel: null,
  }),

  getters: {
    unreadCount: (state) => state.notifications.filter(n => !n.is_read).length,
    sortedNotifications: (state) =>
      [...state.notifications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  },

  actions: {
    // ─── Bildirimleri Çek ────────────────────────────────
    async fetchNotifications(userId) {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30)

        if (error) throw error
        this.notifications = data || []
        this.isLoaded = true
      } catch (e) {
        console.error('Bildirimler yüklenemedi:', e)
        this.isLoaded = true
      }
    },

    // ─── Realtime Dinleyici Kur ──────────────────────────
    subscribeToNotifications(userId) {
      // Önceki dinleyiciyi temizle
      if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel)
      }

      this.realtimeChannel = supabase
        .channel(`notifications-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            console.log('🔔 Yeni bildirim geldi (Realtime):', payload.new)
            // Zaten listede yoksa ekle (duplicate önlemi)
            const exists = this.notifications.some(n => n.id === payload.new.id)
            if (!exists) {
              this.notifications.unshift(payload.new)
            }
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Bildirim Realtime kanalı bağlandı.')
          }
          if (status === 'CHANNEL_ERROR') {
            console.error('❌ Realtime kanal hatası:', err)
          }
          if (status === 'TIMED_OUT') {
            console.warn('⏱️ Realtime bağlantısı zaman aşımına uğradı, yeniden bağlanılıyor...')
          }
        })

      // ─── Fallback: 30 sn'de bir yeni bildirimleri poll et ───
      // Realtime çalışmasa bile bildirimler kaybolmaz
      this._pollInterval = setInterval(async () => {
        await this.fetchNotifications(userId)
      }, 30000)
    },

    // ─── Dinleyiciyi Kapat ───────────────────────────────
    unsubscribe() {
      if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel)
        this.realtimeChannel = null
      }
      if (this._pollInterval) {
        clearInterval(this._pollInterval)
        this._pollInterval = null
      }
    },

    // ─── Tümünü Okundu İşaretle ─────────────────────────
    async markAllAsRead() {
      const unreadIds = this.notifications
        .filter(n => !n.is_read)
        .map(n => n.id)

      if (unreadIds.length === 0) return

      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .in('id', unreadIds)

        this.notifications.forEach(n => { n.is_read = true })
      } catch (e) {
        console.error('Okundu işaretleme hatası:', e)
      }
    },

    // ─── Tek Bildirimi Okundu Yap ────────────────────────
    async markAsRead(notificationId) {
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId)

        const n = this.notifications.find(n => n.id === notificationId)
        if (n) n.is_read = true
      } catch (e) {
        console.error('Bildirim okundu hatası:', e)
      }
    },

    // ─── Bildirimi Sil ────────────────────────────────────
    async deleteNotification(notificationId) {
      try {
        await supabase
          .from('notifications')
          .delete()
          .eq('id', notificationId)

        this.notifications = this.notifications.filter(n => n.id !== notificationId)
      } catch (e) {
        console.error('Bildirim silme hatası:', e)
      }
    },

    // ─── Yeni Bildirim Oluştur (IT/Admin tarafından) ─────
    // Mevcut RLS politikası INSERT için izin verdiği için normal client yeterlidir.
    async createNotification({ userId, title, body, type = 'info', ticketId = null }) {
      try {
        const { error } = await supabase
          .from('notifications')
          .insert({
            user_id: userId,
            title,
            body,
            type,
            ticket_id: ticketId,
          })

        if (error) throw error

        return { success: true }
      } catch (e) {
        console.error('Bildirim oluşturma hatası:', e)
        return { success: false, error: e.message }
      }
    },
  },
})
