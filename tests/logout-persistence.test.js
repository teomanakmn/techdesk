import { createPinia } from 'pinia'
import { test, expect, vi } from 'vitest'
const mock = vi.hoisted(() => ({ getUser: vi.fn(), signOut: vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase:{
  auth:{getUser:mock.getUser,signOut:mock.signOut},removeChannel:vi.fn(),
} }))
test('failed network logout removes local tokens and persists a block across reloads', async () => {
  const values=new Map([['techdesk.auth','synthetic-session'],['techdesk_last_role','admin']])
  vi.stubGlobal('window',{localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}})
  vi.resetModules()
  const {useAuthStore}=await import('../src/stores/auth')
  const auth=useAuthStore(createPinia())
  expect(values.has('techdesk_last_role')).toBe(false)
  auth.setUser({id:'A'})
  mock.signOut.mockResolvedValue({error:new Error('offline')})
  await expect(auth.signOut()).rejects.toThrow()
  expect(values.has('techdesk.auth')).toBe(false)
  expect(values.get('techdesk.session-blocked')).toBe('true')
  // A fresh store reproduces a new page reading the persisted logout intent.
  const fresh=useAuthStore(createPinia())
  await fresh.recoverSession()
  expect(fresh.user).toBe(null)
  expect(mock.getUser).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
