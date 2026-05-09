import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
NProgress.configure({ showSpinner: false })

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/home',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { guest: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue'),
    meta: { guest: true },
  },
  {
    path: '/',
    component: () => import('../layout/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'home',
        name: 'Home',
        component: () => import('../views/Home.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'chat',
        name: 'Chat',
        component: () => import('../views/chat/ChatLayout.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'draw',
        name: 'Draw',
        component: () => import('../views/draw/DrawLayout.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'canvas',
        name: 'Canvas',
        component: () => import('../views/draw/CanvasLayout.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'video',
        name: 'Video',
        component: () => import('../views/video/VideoLayout.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'music',
        name: 'Music',
        component: () => import('../views/music/MusicLayout.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'model3d',
        name: 'Model3d',
        component: () => import('../views/model3d/Model3dLayout.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'user',
        name: 'User',
        component: () => import('../views/UserProfile.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  NProgress.start()
  const hasToken = !!localStorage.getItem('token')

  if (to.meta.requiresAuth && !hasToken) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guest && hasToken) {
    const redirect = (to.query.redirect as string) || '/home'
    return { path: redirect }
  }

  return true
})

router.afterEach(() => {
  NProgress.done()
})

export default router
