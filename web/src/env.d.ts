/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTEST_MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'markdown-it'

declare module 'nprogress'
