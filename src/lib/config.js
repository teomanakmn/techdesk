// Shared by Vite and the browser; only public credentials are accepted.
export function publicSupabaseConfig(env) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue
    let privileged = typeof value === 'string' && value.startsWith('sb_secret_')
    if (typeof value === 'string' && value.split('.').length === 3) {
      try { privileged ||= JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role' } catch { /* Not a JWT. */ }
    }
    if (name.startsWith('VITE_') && value && (/SERVICE_ROLE|SECRET|PRIVATE/i.test(name) || privileged)) {
      throw new Error(`Privileged browser configuration is forbidden: ${name}`)
    }
    if (!['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].includes(name)) {
      throw new Error(`Unsupported browser configuration: ${name}`)
    }
  }
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (public key only).')
  const parsed = new URL(url)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if ((!local && parsed.protocol !== 'https:') || !['http:', 'https:'].includes(parsed.protocol) || /YOUR-PROJECT/i.test(url)) {
    throw new Error('Invalid Supabase URL: use local HTTP or HTTPS.')
  }
  let publicKey = key.startsWith('sb_publishable_') && key.length > 20
  if (!publicKey) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      publicKey = payload.role === 'anon'
    } catch { /* Invalid or privileged keys fail closed. */ }
  }
  if (!publicKey) throw new Error('Supabase browser key must be publishable or a legacy anon key.')
  return { url, key }
}
