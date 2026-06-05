/**
 * Supabase Client Yapılandırması
 * --------------------------------
 * Bu dosya, Supabase backend'ine bağlanmak için gerekli istemciyi oluşturur.
 *
 * Kullanım:
 *   import { supabase } from '@/lib/supabaseClient'
 *
 * NOT: Aşağıdaki URL ve ANON KEY değerlerini kendi Supabase projenizden alın.
 *      Supabase Dashboard → Settings → API bölümünden bulabilirsiniz.
 */

import { createClient } from '@supabase/supabase-js'

// Supabase proje URL'si (Dashboard → Settings → API → Project URL)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

// Supabase anonim (public) anahtar (Dashboard → Settings → API → anon key)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase bağlantısı için VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlanmalıdır.')
}

const REQUEST_TIMEOUT_MS = 12000
const MAX_RETRY_COUNT = 2
const RETRY_BASE_DELAY_MS = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const shouldRetry = (error) => {
  if (!error) return false
  const name = String(error.name || '')
  const message = String(error.message || '')
  return (
    name === 'AbortError' ||
    message.includes('NetworkError') ||
    message.includes('Failed to fetch') ||
    message.includes('Load failed') ||
    message.includes('fetch failed')
  )
}

const mergeSignals = (externalSignal, internalSignal) => {
  if (!externalSignal) return internalSignal
  if (externalSignal.aborted) return externalSignal

  const controller = new AbortController()
  const abort = () => controller.abort()
  externalSignal.addEventListener('abort', abort, { once: true })
  internalSignal.addEventListener('abort', abort, { once: true })
  return controller.signal
}

const resilientFetch = async (input, init = {}) => {
  let lastError

  for (let attempt = 0; attempt <= MAX_RETRY_COUNT; attempt += 1) {
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)

    try {
      const signal = mergeSignals(init.signal, timeoutController.signal)
      const response = await fetch(input, { ...init, signal })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      lastError = error

      if (!shouldRetry(error) || attempt === MAX_RETRY_COUNT) {
        throw error
      }

      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1))
    }
  }

  throw lastError
}

/**
 * createClient: Supabase JS istemcisini oluşturur.
 * İlk parametre → Proje URL'si
 * İkinci parametre → Anonim anahtar (tarayıcı tarafında güvenle kullanılabilir)
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: resilientFetch,
  },
})
