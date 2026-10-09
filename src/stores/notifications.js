import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

export const useNotificationsStore = defineStore('notifications', {
  state: () => ({ notifications: [], isLoaded: false, ownerId: null,
    realtimeChannel: null, pollInterval: null, generation: 0 }),
  getters: {
    unreadCount: state => state.notifications.filter(n => !n.is_read).length,
    sortedNotifications: state => [...state.notifications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
  },
  actions: {
    reset() {
      this.generation += 1
      if (this.realtimeChannel) void supabase.removeChannel(this.realtimeChannel)
      if (this.pollInterval) clearInterval(this.pollInterval)
      this.realtimeChannel = null
      this.pollInterval = null
      this.ownerId = null
      this.notifications = []
      this.isLoaded = false
    },
    unsubscribe() { this.reset() },
    async fetchNotifications(userId) {
      if (!userId) { this.reset(); return }
      if (this.ownerId !== userId) { this.reset(); this.ownerId = userId }
      const generation = this.generation
      const { data, error } = await supabase.from('notifications').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(30)
      if (generation !== this.generation || userId !== this.ownerId) return
      if (error) { this.notifications = []; this.isLoaded = false; return }
      this.notifications = (data || []).filter(n => n.user_id === userId)
      this.isLoaded = true
    },
    subscribeToNotifications(userId) {
      if (!userId) { this.reset(); return }
      if (this.ownerId === userId && this.realtimeChannel) return
      if (this.ownerId !== userId) { this.reset(); this.ownerId = userId }
      const generation = this.generation
      this.realtimeChannel = supabase.channel(`notifications-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
          if (generation !== this.generation || payload.new.user_id !== this.ownerId) return
          if (!this.notifications.some(n => n.id === payload.new.id)) this.notifications.unshift(payload.new)
        }).subscribe()
      this.pollInterval = setInterval(() => { void this.fetchNotifications(userId) }, 30000)
    },
    async markAllAsRead() {
      const ids = this.notifications.filter(n => !n.is_read).map(n => n.id)
      if (!ids.length || !this.ownerId) return
      const generation = this.generation
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', this.ownerId).in('id', ids)
      if (error) throw error
      if (generation === this.generation) this.notifications.forEach(n => { n.is_read = true })
    },
    async markAsRead(id) {
      const generation = this.generation
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', this.ownerId).eq('id', id)
      if (error) throw error
      if (generation === this.generation) {
        const notification = this.notifications.find(n => n.id === id)
        if (notification) notification.is_read = true
      }
    },
    async deleteNotification(id) {
      const generation = this.generation
      const { error } = await supabase.from('notifications').delete().eq('user_id', this.ownerId).eq('id', id)
      if (error) throw error
      if (generation === this.generation) this.notifications = this.notifications.filter(n => n.id !== id)
    },
  },
})
