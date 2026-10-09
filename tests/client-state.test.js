import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, test, expect, vi } from 'vitest'
const mock = vi.hoisted(() => ({ response: null, callback: null, realtime: null, getUser: vi.fn(), signOut: vi.fn(), removeChannel: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: {
  auth: { getUser: mock.getUser, signOut: mock.signOut,
    onAuthStateChange: callback => { mock.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } } } },
  from: () => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => mock.fetch(), single: () => mock.fetch(),
      update: () => chain, in: () => mock.fetch(), delete: () => chain,
      then: (resolve,reject) => mock.fetch().then(resolve,reject) }
    return chain
  },
  channel: () => {
    const channel = { on: (_,__,callback) => { mock.realtime = callback; return channel }, subscribe: () => channel }
    return channel
  }, removeChannel: mock.removeChannel,
} }))
import { useAuthStore } from '../src/stores/auth'
import { useNotificationsStore } from '../src/stores/notifications'
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  mock.fetch.mockReset()
  mock.getUser.mockReset()
  mock.signOut.mockReset().mockResolvedValue({ error: null })
  mock.removeChannel.mockReset()
})
afterEach(() => { useNotificationsStore().reset(); vi.useRealTimers() })

test('failed profile requests cannot use a previous admin role', async () => {
  const auth = useAuthStore()
  auth.setUser({id:'A'})
  auth.profile = {id:'A',role:'admin'}
  mock.fetch.mockResolvedValue({data:null,error:new Error('offline')})
  expect(await auth.fetchProfile()).toBe(false)
  expect(auth.userRole).toBe(null)
  expect(auth.isAuthenticated).toBe(false)
})
test('profile data from a previous account cannot replace the new session', async () => {
  const auth = useAuthStore(), request = deferred()
  auth.setUser({id:'A'})
  mock.fetch.mockReturnValueOnce(request.promise)
  const pending = auth.fetchProfile()
  auth.setUser({id:'B'})
  mock.fetch.mockResolvedValueOnce({data:{id:'B',role:'user'},error:null})
  await auth.fetchProfile()
  request.resolve({data:{id:'A',role:'admin'},error:null})
  await pending
  expect(auth.profile).toEqual({id:'B',role:'user'})
  expect(auth.userRole).toBe('user')
})
test('logout clears notifications and pending profile work before network completes', async () => {
  const auth = useAuthStore(), notifications = useNotificationsStore(), request = deferred(), logout = deferred()
  auth.setUser({id:'A'})
  notifications.ownerId = 'A'
  notifications.notifications = [{id:1,user_id:'A'}]
  mock.fetch.mockReturnValue(request.promise)
  const pending = auth.fetchProfile()
  mock.signOut.mockReturnValue(logout.promise)
  const exiting = auth.signOut()
  expect(auth.user).toBe(null)
  expect(notifications.notifications).toEqual([])
  request.resolve({data:{id:'A',role:'admin'},error:null})
  await pending
  expect(auth.profile).toBe(null)
  logout.resolve({error:null}); await exiting
})
test('failed logout cannot restore the old session on focus', async () => {
  const auth = useAuthStore()
  auth.setUser({id:'A'})
  mock.signOut.mockResolvedValue({error:new Error('offline')})
  await expect(auth.signOut()).rejects.toThrow()
  mock.getUser.mockResolvedValue({data:{user:{id:'A'}},error:null})
  await auth.recoverSession()
  expect(mock.getUser).not.toHaveBeenCalled()
  expect(auth.user).toBe(null)
})
test('auth callback never returns a promise holding the Supabase auth lock', async () => {
  const auth = useAuthStore()
  mock.getUser.mockResolvedValue({data:{user:null},error:null})
  await auth.initAuth()
  expect(mock.callback('SIGNED_IN',{user:{id:'A'}})).toBeUndefined()
  expect(mock.fetch).not.toHaveBeenCalled()
  auth.clearSession()
  await vi.runOnlyPendingTimersAsync()
  expect(mock.fetch).not.toHaveBeenCalled()
})
test('notification responses from an old account are ignored', async () => {
  const notifications = useNotificationsStore(), request = deferred()
  mock.fetch.mockReturnValueOnce(request.promise)
  const pending = notifications.fetchNotifications('A')
  notifications.reset()
  mock.fetch.mockResolvedValueOnce({data:[{id:2,user_id:'B'}],error:null})
  await notifications.fetchNotifications('B')
  request.resolve({data:[{id:1,user_id:'A'}],error:null})
  await pending
  expect(notifications.notifications).toEqual([{id:2,user_id:'B'}])
})
test('duplicate subscriptions do not leak polling timers and stale realtime callbacks', () => {
  const notifications = useNotificationsStore()
  notifications.subscribeToNotifications('A')
  const oldCallback = mock.realtime
  notifications.subscribeToNotifications('A')
  expect(vi.getTimerCount()).toBe(1)
  notifications.reset()
  notifications.subscribeToNotifications('B')
  oldCallback({new:{id:1,user_id:'A'}})
  expect(notifications.notifications).toEqual([])
  expect(vi.getTimerCount()).toBe(1)
  notifications.reset()
  expect(vi.getTimerCount()).toBe(0)
})
test('notification mutation errors do not produce optimistic success', async () => {
  const notifications = useNotificationsStore()
  notifications.ownerId='A'
  notifications.notifications=[{id:1,user_id:'A',is_read:false}]
  mock.fetch.mockResolvedValue({error:new Error('denied')})
  await expect(notifications.markAllAsRead()).rejects.toThrow('denied')
  expect(notifications.notifications[0].is_read).toBe(false)
})

test('overlapping profile refreshes share one request', async () => {
  const auth=useAuthStore(),request=deferred()
  auth.setUser({id:'A'})
  mock.fetch.mockReturnValue(request.promise)
  const first=auth.fetchProfile(),second=auth.fetchProfile()
  request.resolve({data:{id:'A',role:'user'},error:null})
  expect(await first).toBe(true)
  expect(await second).toBe(true)
  expect(mock.fetch).toHaveBeenCalledTimes(1)
})
