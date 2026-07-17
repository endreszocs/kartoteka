/**
 * A konfiguralt publikus Supabase Storage kepet a Next kepoptimalizaloja
 * kezelheti. Mas, de HTTPS-sel biztonsagos legacy URL a bongeszoben toltodik
 * be `unoptimized` modban; igy nem kell ismeretlen hostot engedelyezni a
 * next.config remotePatterns listajaban, es a render sem torik el.
 */
export function shouldBypassPublicImageOptimization(src: string): boolean {
  if (src.startsWith('/') && !src.startsWith('//')) return false

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return true

  try {
    const imageUrl = new URL(src)
    const configuredSupabaseUrl = new URL(supabaseUrl)

    return !(
      imageUrl.protocol === 'https:' &&
      imageUrl.hostname === configuredSupabaseUrl.hostname &&
      imageUrl.pathname.startsWith('/storage/v1/object/public/')
    )
  } catch {
    return true
  }
}
