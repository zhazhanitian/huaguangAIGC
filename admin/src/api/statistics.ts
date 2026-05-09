import request from './index'

export type AigcModuleStat = {
  today: number
  todayCompleted: number
  todayFailed: number
  yesterday: number
  yesterdayCompleted: number
  yesterdayFailed: number
  successRate: number | null
}

export type DashboardStats = {
  totalUsers: number
  todayRegistrations: number
  yesterdayRegistrations: number
  totalConversations: number
  todayConversations: number
  yesterdayConversations: number
  totalOrders: number
  totalRevenue: number
  todayRevenue: number
  yesterdayRevenue: number
  activeModelsCount: number
  aigc: {
    todayTotal: number
    yesterdayTotal: number
    draw: AigcModuleStat
    video: AigcModuleStat
    music: AigcModuleStat
    model3d: AigcModuleStat
  }
}

export type UserGrowthItem = { date: string; count: number }
export type RevenueItem = { date: string; revenue: number; count: number }
export type ModelUsageItem = { modelName: string; count: number; tokens: number }
export type TokenTrendItem = { date: string; tokens: number; promptTokens: number; completionTokens: number; count: number }

export function getDashboardStats() {
  return request.get<DashboardStats>('/statistics/dashboard')
}
export function getUserGrowth(days = 30) {
  return request.get<UserGrowthItem[]>('/statistics/user-growth', { params: { days } })
}
export function getRevenueStats(days = 30) {
  return request.get<RevenueItem[]>('/statistics/revenue', { params: { days } })
}
export function getModelUsage() {
  return request.get<ModelUsageItem[]>('/statistics/model-usage')
}
export function getTokenTrend(days = 30) {
  return request.get<TokenTrendItem[]>('/statistics/token-trend', { params: { days } })
}
