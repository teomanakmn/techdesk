import { createClient } from '@supabase/supabase-js'

export function singleAttemptFetch(input, init = {}) {
  const external = init.signal || (input instanceof Request ? input.signal : null)
  const timeout = AbortSignal.timeout(12000)
  const signal = external ? AbortSignal.any([external, timeout]) : timeout
  return fetch(input, { ...init, signal })
}

export function createPublicClient({ url, key }, transport = singleAttemptFetch) {
  return createClient(url, key, {
    db: { retry: false },
    global: { fetch: transport },
    auth: { storageKey: 'techdesk.auth' },
  })
}
