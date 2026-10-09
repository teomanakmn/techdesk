import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { createAdminHandler } from './handler.js'

const url = Deno.env.get('SUPABASE_URL')
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')
const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !publicKey || !serverKey) throw new Error('Server Supabase configuration is missing')
const options = { db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
Deno.serve(createAdminHandler({
  callerClient: (authorization: string) => createClient(url, publicKey, { ...options, global: { headers: { Authorization: authorization } } }),
  adminClient: () => createClient(url, serverKey, options),
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') || 'http://127.0.0.1:5173,http://localhost:5173').split(','),
}))
