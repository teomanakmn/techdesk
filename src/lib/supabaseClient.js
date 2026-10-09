import { publicSupabaseConfig } from './config'
import { createPublicClient } from './clientFactory'

// Only validated public configuration enters the browser. Writes are never retried.
export const supabase = createPublicClient(publicSupabaseConfig(import.meta.env))
