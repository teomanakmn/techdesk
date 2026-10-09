import { test, expect } from 'vitest'
import { publicSupabaseConfig } from '../src/lib/config'
const jwt = role => `test.${btoa(JSON.stringify({role}))}.synthetic`
const config = key => ({ VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_ANON_KEY:key })
test('missing configuration fails clearly', () => { expect(() => publicSupabaseConfig({})).toThrow('Set VITE_SUPABASE') })
test('legacy service role key in public key slot is rejected', () => { expect(() => publicSupabaseConfig(config(jwt('service_role')))).toThrow('Privileged browser') })
test('modern secret key is rejected', () => { expect(() => publicSupabaseConfig(config('sb_secret_synthetic_never_real'))).toThrow('Privileged browser') })
test('privileged VITE variables are rejected even when public key is safe', () => {
  expect(() => publicSupabaseConfig({...config(jwt('anon')),VITE_SUPABASE_SERVICE_ROLE_KEY:'synthetic-never-real'})).toThrow('Privileged browser')
})
test('anon and publishable keys are accepted', () => {
  expect(publicSupabaseConfig(config(jwt('anon'))).key).toBe(jwt('anon'))
  expect(publicSupabaseConfig(config('sb_publishable_synthetic_local_only')).key).toContain('sb_publishable_')
})
test('remote HTTP and placeholder URL fail', () => {
  expect(() => publicSupabaseConfig({...config(jwt('anon')),VITE_SUPABASE_URL:'http://remote.example'})).toThrow('Invalid Supabase URL')
  expect(() => publicSupabaseConfig({...config(jwt('anon')),VITE_SUPABASE_URL:'https://YOUR-PROJECT.supabase.co'})).toThrow('Invalid Supabase URL')
})

test('privileged keys in innocuous public variable names are rejected', () => {
  expect(() => publicSupabaseConfig({...config(jwt('anon')),VITE_OTHER:jwt('service_role')})).toThrow('Privileged browser')
})

test('public environment has a strict allowlist', () => {
  expect(() => publicSupabaseConfig({...config(jwt('anon')),VITE_UNRELATED:'unused'})).toThrow('Unsupported browser configuration')
})
