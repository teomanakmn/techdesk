// Runtime-independent handler; the service client is created only in the Edge entrypoint.
export function createAdminHandler({ callerClient, adminClient, allowedOrigins }) {
  return async request => {
    const origin = request.headers.get('origin')
    const headers = { 'Content-Type': 'application/json', 'Vary': 'Origin' }
    if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info'
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    }
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers })
    if (origin && !allowedOrigins.includes(origin)) return reply(403, { error: 'Origin forbidden' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return reply(405, { error: 'POST required' })
    const authorization = request.headers.get('authorization') || ''
    if (!/^Bearer \S+$/.test(authorization)) return reply(401, { error: 'Authentication required' })
    try {
      const caller = callerClient(authorization)
      const { data: identity, error: identityError } = await caller.auth.getUser()
      if (identityError || !identity?.user) return reply(401, { error: 'Invalid session' })
      const { data: profile, error: profileError } = await caller.from('profiles').select('id, role').eq('id', identity.user.id).single()
      if (profileError || profile?.role !== 'admin') return reply(403, { error: 'Admin authorization required' })
      let body
      try { body = await request.json() } catch { return reply(400, { error: 'Invalid JSON' }) }
      if (!body || typeof body !== 'object') return reply(400, { error: 'Invalid request' })
      if (body.action === 'create') {
        if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254 ||
            typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 72 ||
            typeof body.fullName !== 'string' || !body.fullName.trim() || body.fullName.length > 200 ||
            !['user', 'it_staff', 'admin'].includes(body.role)) return reply(400, { error: 'Invalid account fields (password: 8–72 characters)' })
        const admin = adminClient()
        // Auth trigger always creates an ordinary user; metadata cannot grant privileges.
        const { data, error } = await admin.auth.admin.createUser({ email: body.email.trim(), password: body.password,
          email_confirm: true, user_metadata: { full_name: body.fullName.trim() } })
        if (error || !data?.user?.id) return reply(409, { error: 'Account could not be created; check the user list before retrying.' })
        const id = data.user.id
        // Fresh database authorization and role finalization, including role=user.
        let result
        try { result = await caller.rpc('admin_update_user_role', { target_user_id: id, target_role: body.role }) }
        catch { result = { error: true } }
        if (result.error || result.data?.role !== body.role || result.data?.id !== id) {
          const rollback = await admin.auth.admin.deleteUser(id)
          if (rollback.error) return reply(500, { error: 'Account created but role finalization and cleanup failed. Review this account before retrying.', accountId: id, partial: true })
          return reply(409, { error: 'Role could not be finalized; the new account was removed.' })
        }
        return reply(200, { ok: true, user: result.data })
      }
      if (body.action === 'delete') {
        if (typeof body.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)) return reply(400, { error: 'Invalid user ID' })
        if (body.userId === identity.user.id) return reply(409, { error: 'Self deletion is forbidden' })
        const { data: target, error } = await caller.from('profiles').select('id, role').eq('id', body.userId).single()
        if (error || !target) return reply(404, { error: 'Profile not found' })
        if (target.role === 'admin') return reply(409, { error: 'Demote the administrator before deletion' })
        // Revalidate the live caller immediately before invoking the privileged Auth API.
        const { data: fresh, error: denied } = await caller.from('profiles').select('id, role').eq('id', identity.user.id).single()
        if (denied || fresh?.role !== 'admin') return reply(403, { error: 'Admin authorization required' })
        const { error: deletionError } = await adminClient().auth.admin.deleteUser(body.userId)
        if (deletionError) return reply(409, { error: 'Account deletion failed; refresh the list before retrying.' })
        return reply(200, { ok: true })
      }
      return reply(400, { error: 'Unknown action' })
    } catch { return reply(500, { error: 'Account operation could not be verified. Refresh the user list before retrying.' }) }
  }
}
