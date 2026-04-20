/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // M1.5 / M2 későbbi bővítések:
  // readonly VITE_APP_ENV?: 'development' | 'staging' | 'production'
  // readonly VITE_UPDATE_MANIFEST_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
