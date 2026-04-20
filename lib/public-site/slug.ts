// Slug validáció és reserved words

/**
 * Olyan szavak, amelyek ütköznek Next.js útvonalakkal vagy rendszer-funkciókkal.
 * Ezek a slug-ok nem használhatók gyülekezeti oldalakhoz.
 */
const RESERVED_SLUGS = new Set([
  // Next.js és framework útvonalak
  '_next', 'api', 'public', 'static', 'assets',

  // Next.js file conventions (layout, page, loading, stb. fájlnevek)
  'favicon', 'favicon.ico', 'icon', 'apple-touch-icon', 'apple-icon',
  'robots', 'robots.txt', 'sitemap', 'sitemap.xml',
  'opengraph-image', 'twitter-image', 'manifest', 'manifest.json',

  // Auth útvonalak
  'auth', 'login', 'logout', 'register', 'signup', 'signin',
  'forgot-password', 'reset-password', 'oauth-complete', 'verify',
  'oauth', 'sso', 'callback',

  // Admin és dashboard
  'admin', 'dashboard', 'profile', 'settings', 'beallitasok',
  'kartoteka', 'admin-override', 'god-mode', 'delegated-import',

  // Publikus oldal névteret foglaló útvonalak
  'gy', 'publikus-oldal',

  // Modulok
  'tagnyilvantartas', 'tagok', 'tag', 'member', 'members',
  'penzugy', 'finance', 'anyakonyv', 'munkanaplo', 'worklog',
  'leltar', 'inventory', 'iktato', 'filing', 'sirhelyek', 'cemetery',
  'misszios-muhely', 'missions', 'community',
  'notifications', 'ertesitesek', 'support', 'help',
  'dashboard-egyhazmegye', 'dashboard-kerulet', 'congregation',

  // Általános reserved webes útvonalak
  'www', 'mail', 'ftp', 'ssh', 'smtp', 'imap',
  'search', 'about', 'contact', 'home', 'index',
  'files', 'upload', 'download', 'storage',
  'uj', 'new', 'edit', 'create', 'delete', 'update',

  // Közérzéki szavak, amelyek gondot okozhatnak
  'null', 'undefined', 'true', 'false',
  'regisztracio', 'belepes', 'kijelentkezes',
])

/**
 * A slug formátum: kisbetűk, számok, kötőjel — 3-60 karakter, első és utolsó
 * karakter alfanumerikus.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/

export interface SlugValidationResult {
  valid: boolean
  error?: string
}

export function validateSlug(slug: string): SlugValidationResult {
  if (!slug) {
    return { valid: false, error: 'A slug nem lehet üres.' }
  }
  if (slug.length < 3) {
    return { valid: false, error: 'A slug legalább 3 karakter hosszú legyen.' }
  }
  if (slug.length > 60) {
    return { valid: false, error: 'A slug legfeljebb 60 karakter hosszú lehet.' }
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      error: 'A slug csak kisbetűket, számokat és kötőjelet tartalmazhat. Az első és utolsó karakter nem lehet kötőjel.',
    }
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { valid: false, error: 'Ez a slug foglalt, válassz mást.' }
  }
  return { valid: true }
}

/**
 * Egy nyers szövegből (pl. gyülekezet neve) ajánlott slug-ot generál.
 * Ékezeteket eltávolít, speciális karaktereket kötőjelre cserél.
 */
export function suggestSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // diakritikus jelek eltávolítása
    .replace(/[^a-z0-9]+/g, '-')     // minden más → kötőjel
    .replace(/^-+|-+$/g, '')          // vezető/záró kötőjelek eltávolítása
    .slice(0, 60)
}
