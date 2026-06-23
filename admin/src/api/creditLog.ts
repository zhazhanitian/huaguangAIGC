import request from './index'

export interface CreditLog {
  id: string
  userId: string
  username?: string | null
  phone?: string | null
  type: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  refId?: string | null
  refType?: string | null
  remark?: string | null
  operatorId?: string | null
  createdAt: string
}

export interface CreditLogListParams {
  userId?: string
  phone?: string
  type?: string | string[]
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
}

export interface CreditLogListResult {
  list: CreditLog[]
  total: number
  page: number
  pageSize: number
}

export interface RechargeParams {
  userId: string
  amount: number
  remark: string
}

export interface CorrectParams {
  userId: string
  action: 'add' | 'deduct'
  amount: number
  remark: string
}

export interface UserInfoResult {
  userId: string
  username: string
  phone: string
  balance: number
  recentLogs: CreditLog[]
}

/** 积分流水列表 */
export function getCreditLogs(params?: CreditLogListParams) {
  return request.get<CreditLogListResult>('/admin/credit-logs', { params })
}

/** 管理员充值 */
export function rechargeCreditLog(data: RechargeParams) {
  return request.post<{ userId: string; balance: number }>('/admin/credit-logs/recharge', data)
}

/** 积分修正 */
export function correctCreditLog(data: CorrectParams) {
  return request.post<UserInfoResult>('/admin/credit-logs/correct', data)
}

/** 按手机号查询用户信息及最近流水 */
export function getUserCreditInfo(phone: string) {
  return request.get<UserInfoResult>('/admin/credit-logs/user-info', { params: { phone } })
}

/** 导出积分流水 Excel */
export async function exportCreditLogs(params?: Omit<CreditLogListParams, 'page' | 'pageSize'>) {
  const blob = await request.get<Blob>('/admin/credit-logs/export', {
    params,
    responseType: 'blob',
  })
  const url = URL.createObjectURL(blob as unknown as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `积分流水_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

/** 积分类型中文映射 */
export const CREDIT_TYPE_LABELS: Record<string, string> = {
  recharge_payment: '套餐购买',
  recharge_crami: '卡密兑换',
  recharge_invite: '邀请奖励',
  recharge_signin: '签到奖励',
  recharge_admin: '管理员充值',
  consume_draw: '绘图消费',
  consume_video: '视频消费',
  consume_music: '音乐消费',
  consume_model3d: '3D消费',
  consume_chat: '对话消费',
  refund_task: '任务退款',
  correct_add: '积分修正-增加',
  correct_deduct: '积分修正-扣除',
}

/** 积分类型颜色映射（Arco Design 标签颜色） */
export const CREDIT_TYPE_COLORS: Record<string, string> = {
  recharge_payment: 'green',
  recharge_crami: 'green',
  recharge_invite: 'green',
  recharge_signin: 'green',
  recharge_admin: 'green',
  consume_draw: 'red',
  consume_video: 'red',
  consume_music: 'red',
  consume_model3d: 'red',
  consume_chat: 'red',
  refund_task: 'blue',
  correct_add: 'arcoblue',
  correct_deduct: 'orangered',
}
