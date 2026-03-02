import request from './index'

export type Model3dTaskStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type Model3dTaskType = 'text2model' | 'img2model'

export interface CreateModel3dTaskData {
  taskType?: Model3dTaskType
  provider?: string
  prompt: string
  inputImageUrl?: string
  params?: Record<string, unknown>
}

export interface Model3dTask {
  id: string
  taskType?: Model3dTaskType
  provider?: string
  prompt?: string
  inputImageUrl?: string | null
  resultModelUrl?: string | null
  resultPreviewUrl?: string | null
  status: Model3dTaskStatus
  progress?: number
  errorMessage?: string | null
  isPublic?: boolean | number
  params?: Record<string, unknown> | null
  createdAt?: string
}

export interface Model3dTaskListResponse {
  list: Model3dTask[]
  total: number
  page: number
  pageSize: number
}

export interface Model3dGalleryItem {
  id: string
  prompt?: string
  resultModelUrl?: string
  resultPreviewUrl?: string
  createdAt?: string
}

export interface Model3dGalleryResponse {
  list: Model3dGalleryItem[]
  total: number
  page: number
  pageSize: number
}

export type Model3dPrintMaterial = 'pla' | 'white_clay' | 'purple_clay'
export type Model3dPrintOrderStatus = 'pending' | 'paid' | 'failed'

export interface CreateModel3dPrintOrderData {
  taskId: string
  material: Model3dPrintMaterial
  receiverName: string
  receiverPhone: string
  receiverAddress: string
  remark?: string
}

export interface Model3dPrintOrder {
  id: string
  taskId: string
  orderNo: string
  material: Model3dPrintMaterial
  receiverName: string
  receiverPhone: string
  receiverAddress: string
  remark?: string | null
  amount: number
  modelUrl: string
  previewUrl?: string | null
  qrCodeUrl?: string | null
  tradeNo?: string | null
  status: Model3dPrintOrderStatus
  payTime?: string | null
  createdAt?: string
}

export interface Model3dPrintOrderListResponse {
  list: Model3dPrintOrder[]
  total: number
  page: number
  pageSize: number
}

export function createModel3dTask(data: CreateModel3dTaskData) {
  return request.post<Model3dTask>('/model3d/create', data)
}

export function getMyModel3dTasks(page = 1, pageSize = 20) {
  return request.get<Model3dTaskListResponse>('/model3d/tasks', {
    params: { page, pageSize },
  })
}

export function getModel3dTasksStatusBatch(ids: string[]) {
  return request.get<Model3dTask[]>('/model3d/tasks/status', {
    params: { ids: (ids || []).join(',') },
  })
}

export function getModel3dGallery(page = 1, pageSize = 20) {
  return request.get<Model3dGalleryResponse>('/model3d/gallery', {
    params: { page, pageSize },
  })
}

export function getModel3dTaskStatus(id: string) {
  return request.get<Model3dTask>(`/model3d/task/${id}`)
}

export function toggleModel3dPublic(id: string) {
  return request.put(`/model3d/task/${id}/public`)
}

export function deleteModel3dTask(id: string) {
  return request.delete(`/model3d/task/${id}`)
}

export function retryModel3dTask(id: string) {
  return request.post<Model3dTask>(`/model3d/task/${id}/retry`)
}

export function createModel3dPrintOrder(data: CreateModel3dPrintOrderData) {
  return request.post<Model3dPrintOrder>('/model3d/print-order/create', data)
}

export function payModel3dPrintOrder(id: string, tradeNo?: string) {
  return request.post<Model3dPrintOrder>(`/model3d/print-order/${id}/pay`, tradeNo ? { tradeNo } : {})
}

export function getMyModel3dPrintOrders(page = 1, pageSize = 10) {
  return request.get<Model3dPrintOrderListResponse>('/model3d/print-orders', {
    params: { page, pageSize },
  })
}
