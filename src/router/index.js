import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Layout bileşeni — tüm korumalı sayfaları sarar
import Layout from '@/components/Layout.vue'

// Lazy-load: Bileşenler yalnızca ilgili route'a gidildiğinde yüklenir
const HomeView = () => import('@/views/HomeView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const DashboardView = () => import('@/views/DashboardView.vue')
const UserDashboard = () => import('@/views/UserDashboard.vue')
const MyAssetsView = () => import('@/views/MyAssets.vue')
const ITDashboard = () => import('@/views/ITDashboard.vue')
const StatsView = () => import('@/views/StatsView.vue')
const KnowledgeBaseView = () => import('@/views/KnowledgeBase.vue')
const SatisfactionView = () => import('@/views/SatisfactionView.vue')
const AdminAssetsView = () => import('@/views/AdminAssets.vue')
const AdminUsersView = () => import('@/views/AdminUsersView.vue')
const AdminAnnouncementsView = () => import('@/views/AdminAnnouncements.vue')
const AdminLogsView = () => import('@/views/AdminLogs.vue')
const UnauthorizedView = () => import('@/views/UnauthorizedView.vue')

const routes = [
    // ─── Genel Sayfalar (Layout yok) ───────────────────────
    {
        path: '/',
        redirect: '/login',
    },
    {
        path: '/home',
        name: 'Home',
        component: HomeView,
    },
    {
        path: '/login',
        name: 'Login',
        component: LoginView,
        meta: { guestOnly: true },
    },
    {
        path: '/register',
        redirect: '/login',
    },
    {
        path: '/unauthorized',
        name: 'Unauthorized',
        component: UnauthorizedView,
    },

    // ─── Korumalı Sayfalar (Layout ile sarılı) ─────────────
    {
        path: '/',
        component: Layout,
        meta: { requiresAuth: true },
        children: [
            {
                path: 'dashboard',
                name: 'Dashboard',
                component: DashboardView,
            },
            {
                path: 'tickets',
                name: 'Tickets',
                component: UserDashboard,
            },
            {
                path: 'tickets/new',
                name: 'NewTicket',
                component: UserDashboard,
            },
            {
                path: 'my-assets',
                name: 'MyAssets',
                component: MyAssetsView,
                meta: { roles: ['user'] },
            },
            {
                path: 'tickets/all',
                name: 'AllTickets',
                component: ITDashboard,
                meta: { roles: ['it_staff', 'admin'] },
            },
            {
                path: 'stats',
                name: 'Stats',
                component: StatsView,
                meta: { roles: ['it_staff', 'admin'] },
            },
            {
                path: 'knowledge-base',
                name: 'KnowledgeBase',
                component: KnowledgeBaseView,
            },
            {
                path: 'ratings',
                name: 'Satisfaction',
                component: SatisfactionView,
                meta: { roles: ['it_staff', 'admin'] },
            },
            {
                path: 'admin/assets',
                name: 'AdminAssets',
                component: AdminAssetsView,
                meta: { roles: ['admin'] },
            },
            {
                path: 'admin/users',
                name: 'AdminUsers',
                component: AdminUsersView,
                meta: { roles: ['admin'] },
            },
            {
                path: 'admin/announcements',
                name: 'AdminAnnouncements',
                component: AdminAnnouncementsView,
                meta: { roles: ['admin'] },
            },
            {
                path: 'logs',
                name: 'AdminLogs',
                component: AdminLogsView,
                meta: { roles: ['admin'] },
            },
        ],
    },
]

const router = createRouter({
    history: createWebHistory(),
    routes,
})

/**
 * Navigation Guard (Yönlendirme Koruyucusu)
 * ------------------------------------------
 * Kontrol sırası:
 *   1. Auth yüklenmesini bekle
 *   2. requiresAuth → giriş yoksa /login
 *   3. meta.roles → rol uyuşmazsa /unauthorized
 *   4. guestOnly → giriş varsa /dashboard
 *   5. (Sistem ayarlari modulu kaldirildi)
 */
router.beforeEach(async (to, from) => {
    const authStore = useAuthStore()

    // 1) Auth store henüz başlatılmadıysa bekle
    if (authStore.isLoading) {
        await new Promise((resolve) => {
            const check = setInterval(() => {
                if (!authStore.isLoading) {
                    clearInterval(check)
                    resolve()
                }
            }, 50)
        })
    }

    // requiresAuth kontrolü: Tüm matched route'ları kontrol et (parent dahil)
    const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
    const guestOnly = to.matched.some((record) => record.meta.guestOnly)

    // 2) Giriş gerektiren sayfaya erişim kontrolü
    if (requiresAuth && !authStore.isAuthenticated) {
        return {
            path: '/login',
            query: { redirect: to.fullPath }
        }
    }

    // 3) Rol bazlı erişim kontrolü
    const routeRoles = to.meta.roles
    if (routeRoles && routeRoles.length > 0) {
        const userRole = authStore.userRole
        if (!routeRoles.includes(userRole)) {
            return '/unauthorized'
        }
    }

    // 4) Sadece misafirler için olan sayfalar (Örn: Login)
    if (guestOnly && authStore.isAuthenticated) {
        return '/dashboard'
    }

    return true
})

export default router
