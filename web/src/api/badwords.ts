import request from './index'

/** 敏感词检测结果 */
export interface CheckContentResult {
  /** 是否完全通过（无任何敏感词） */
  passed: boolean
  /** 是否允许生成（无HIGH级别敏感词） */
  canGenerate: boolean
  /** 是否需要确认（有MEDIUM级别敏感词） */
  needConfirm: boolean
  /** 是否有标签提示（有LOW级别敏感词） */
  hasWarning: boolean
  /** LOW级别敏感词列表 */
  lowWords: string[]
  /** MEDIUM级别敏感词列表 */
  mediumWords: string[]
  /** HIGH级别敏感词列表 */
  highWords: string[]
}

/**
 * 检测文本内容是否包含敏感词（预检，不记录日志）
 * @param content 待检测文本
 */
export function checkContent(content: string) {
  return request.post<CheckContentResult>('/badwords/check', { content })
}
