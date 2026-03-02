import request from './index'

export interface UploadFileResponse {
  url: string
  filename: string
  originalName: string
  size: number
  mimetype: string
}

export function uploadFile(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post<UploadFileResponse>('/upload/file', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

