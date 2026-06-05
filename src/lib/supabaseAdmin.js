/**
 * Supabase Admin Client
 * ─────────────────────
 * Service Role Key ile oluşturulan admin istemci.
 * RLS'yi bypass eder ve auth.admin metodlarına erişim sağlar.
 *
 * ⚠️ GÜVENLİK UYARISI:
 * Service Role Key, tüm veritabanına tam erişim sağlar.
 * Bu key SADECE admin panelinde kullanılmalıdır.
 * Üniversite projesi için client-side kullanımı kabul edilebilir,
 * ancak production ortamda bu işlemler Edge Function veya backend üzerinden yapılmalıdır.
 *
 * Kullanım:
 *   import { supabaseAdmin } from '@/lib/supabaseAdmin'
 *   const { data } = await supabaseAdmin.auth.admin.listUsers()
 *
 * Kurulum:
 *   Supabase Dashboard → Settings → API → service_role key
 *   .env dosyasına ekleyin:
 *     VITE_SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR-PROJECT.supabase.co'
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 'YOUR-SERVICE-ROLE-KEY'

/**
 * Admin istemci — service_role key kullanır.
 * - RLS'yi bypass eder (tüm satırlara erişim)
 * - auth.admin metodlarına erişim (listUsers, createUser vb.)
 * - Otomatik oturum yönetimi devre dışı (admin client session tutmaz)
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    global: {
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
        },
    },
    auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
        storageKey: 'techdesk-admin-client',
    },
})
