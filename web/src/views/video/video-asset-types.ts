export interface VideoAssetFile {
  url: string
  file: File
}

export interface VideoRefImage extends VideoAssetFile {
  id: string
}
