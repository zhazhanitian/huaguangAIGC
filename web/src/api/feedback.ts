import request from './index'

export type FeedbackType = 'bug' | 'suggestion' | 'other'

export interface SubmitFeedbackData {
  type: FeedbackType
  content: string
  contact?: string
}

export function submitFeedback(data: SubmitFeedbackData) {
  return request.post('/feedback', data)
}

