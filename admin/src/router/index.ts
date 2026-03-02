import { createRouter, createWebHistory } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { useUserStore } from '../stores/user'

NProgress.configure({ showSpinner: false })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/Login.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('../layout/AdminLayout.vue'),
      meta: { requiresAuth: true, requiresAdmin: true },
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('../views/Dashboard.vue'),
        },
        {
          path: 'users',
          name: 'Users',
          component: () => import('../views/UserManage.vue'),
        },
        {
          path: 'models',
          name: 'Models',
          component: () => import('../views/ModelManage.vue'),
        },
        {
          path: 'apikeys',
          name: 'ApiKeys',
          component: () => import('../views/ApiKeyManage.vue'),
        },
        {
          path: 'config',
          name: 'Config',
          component: () => import('../views/ConfigManage.vue'),
        },
        {
          path: 'ops',
          name: 'OpsDashboard',
          component: () => import('../views/OpsDashboard.vue'),
        },
        {
          path: 'canvas',
          name: 'CanvasManage',
          component: () => import('../views/CanvasManage.vue'),
        },
        {
          path: 'badwords',
          name: 'BadWords',
          component: () => import('../views/BadWordsManage.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  NProgress.start()
  const userStore = useUserStore()

  if (to.meta.public) {
    if (userStore.token) {
      next({ path: '/dashboard' })
    } else {
      next()
    }
    return
  }

  if (!userStore.token) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  if (!userStore.userInfo) {
    try {
      await userStore.fetchProfile()
    } catch {
      next({ path: '/login' })
      return
    }
  }

  if (to.meta.requiresAdmin && !['admin', 'super'].includes(userStore.userInfo?.role || '')) {
    next({ path: '/login' })
    return
  }

  next()
})

router.afterEach(() => {
  NProgress.done()
})

export default router
