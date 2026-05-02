import request from './index'

/** 文本检测结果（阿里云内容安全） */
export interface TextCheckResult {
  passed: boolean
  riskLevel?: string
  labels?: string
  reason?: string
  descriptions?: string
}

/** 图片检测结果 */
export interface ImageCheckResult {
  passed: boolean
  riskLevel?: string
  result?: Array<{ label?: string; description?: string; confidence?: number }>
}

/**
 * 文本内容安全预检（提交前调用）
 */
export function checkText(content: string) {
  return request.post<TextCheckResult>('/content-moderation/check-text', {
    content,
  })
}

/**
 * 图片内容安全预检（须传公网可访问 URL）
 */
export function checkImage(imageUrl: string) {
  return request.post<ImageCheckResult>('/content-moderation/check-image', {
    imageUrl,
  })
}
