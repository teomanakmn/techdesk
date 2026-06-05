import { supabase } from '@/lib/supabaseClient'

export const useLogger = () => {
  const logAction = async (action, targetType, targetId, details = '') => {
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      const userId = authData?.user?.id
      if (!userId) return { success: false, skipped: true }

      const { error } = await supabase.from('logs').insert({
        user_id: userId,
        action,
        target_type: targetType,
        target_id: targetId ? String(targetId) : null,
        details,
      })

      if (error) throw error
      return { success: true }
    } catch (error) {
      console.error('Log kaydı oluşturulamadı:', error)
      return { success: false, error }
    }
  }

  return { logAction }
}
