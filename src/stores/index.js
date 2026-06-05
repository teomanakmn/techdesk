/**
 * Pinia Store — Genel Uygulama State'i
 * --------------------------------
 * Pinia, Vue 3'ün resmi state management kütüphanesidir (Vuex'in yerini aldı).
 *
 * defineStore() parametreleri:
 *   1. Store ID → Benzersiz bir isim (DevTools'da görünür)
 *   2. Options objesi:
 *      - state    → Reaktif veriler (data)
 *      - getters  → Computed değerler
 *      - actions  → State'i değiştiren fonksiyonlar
 *
 * Kullanım (herhangi bir bileşende):
 *   import { useAppStore } from '@/stores'
 *   const store = useAppStore()
 *   console.log(store.appName)
 */

import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
    // state: Uygulamanın reaktif verileri
    state: () => ({
        appName: 'TechDesk - Kurumsal IT Destek Sistemi',
        isLoading: false,
    }),

    // getters: State'ten türetilen hesaplanmış değerler
    getters: {
        getAppName: (state) => state.appName,
    },

    // actions: State'i değiştiren asenkron veya senkron fonksiyonlar
    actions: {
        setLoading(value) {
            this.isLoading = value
        },
    },
})
