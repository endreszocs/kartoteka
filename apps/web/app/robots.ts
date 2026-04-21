import type { MetadataRoute } from 'next'

/**
 * robots.txt — a lelkészi admin és auth route-ok tiltva.
 * A publikus gyülekezeti oldalak (/gy/*) indexelhetők.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://kartoteka.local'

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/gy/'],
        disallow: [
          '/',
          '/dashboard/',
          '/tagnyilvantartas',
          '/penzugy',
          '/anyakonyv',
          '/munkanaplo',
          '/iktato',
          '/leltar',
          '/sirhelyek',
          '/admin',
          '/publikus-oldal',
          '/misszios-muhely',
          '/profile',
          '/notifications',
          '/support',
          '/login',
          '/register',
          '/forgot-password',
          '/oauth-complete',
          '/auth/',
          '/api/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
