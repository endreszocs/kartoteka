/**
 * Sötét / világos mód — a desktop EGYETLEN igazságforrása.
 *
 * 2026-08-15 (9. pont, néma beállítás-vesztés): a mentett módot korábban KIZÁRÓLAG
 * a Beállítások ablak `saveTheme`-je alkalmazta, az pedig csak a lelkész
 * kattintására futott le. Indításkor a `loadTheme` csupán a React-állapotot töltötte
 * fel, a `dark` osztály SOHA nem került vissza a <html>-re — a választás ott maradt
 * a localStorage-ban, a program mégis némán világos módban indult. A lelkész azt
 * hitte, a sötét mód „nem működik", és minden indítás után újra kattintania kellett.
 *
 * A visszaállítás KÉT helyen történik, hogy induláskor ne legyen világos-villanás:
 *   1. `apps/desktop/index.html` fejlécében egy BLOKKOLÓ inline szkript (render ELŐTT),
 *   2. itt, a `main.tsx` legelején (`initTheme`) — biztonsági háló + rendszer-figyelő.
 *
 * ⚠️ Az index.html szkriptje ennek a modulnak a kézi másolata (blokkoló, klasszikus
 * szkript nem importálhat modult). Ha itt változik a tároló-kulcs vagy a logika,
 * OTT IS át kell vezetni — különben a kettő némán széthúz.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

/** A localStorage-kulcs. UGYANEZ szerepel az index.html bootstrap-szkriptjében is. */
export const THEME_STORAGE_KEY = 'kartoteka-desktop-theme-v1'

/** Ismeretlen / hiányzó érték esetén a rendszer-beállítást követjük. */
const DEFAULT_MODE: ThemeMode = 'system'

/** A mentett mód beolvasása (érvénytelen érték → 'system'). */
export function loadThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // A webview letilthatja a localStorage-t — ilyenkor a rendszer-mód a helyes válasz.
  }
  return DEFAULT_MODE
}

/** 'system' mód esetén az operációs rendszer aktuális beállítása dönt. */
function prefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** A módból számolt tényleges sötétség (a `system` ág feloldásával). */
export function isDarkMode(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark())
}

/** A `dark` osztály ki-/bekapcsolása a <html> elemen. */
export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', isDarkMode(mode))
}

/** Mentés + azonnali alkalmazás (a Beállítások ablak ezt hívja kattintáskor). */
export function saveThemeMode(mode: ThemeMode): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch {
      // A mentés bukhat (kvóta / letiltott tároló), de a megjelenést ettől még
      // állítsuk át — a lelkész lássa a hatást a mostani munkamenetben.
    }
  }
  applyThemeMode(mode)
}

/**
 * Rendszer-mód figyelő: ha a lelkész a Windows sötét módját kapcsolja át futás
 * közben, és a beállítás „Rendszer", a program azonnal követi. Visszatérési
 * értéke a leiratkozó függvény.
 */
export function startSystemThemeWatcher(): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    // Csak a „Rendszer" beállítást követi — a kézi világos/sötét választás marad.
    if (loadThemeMode() === 'system') applyThemeMode('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** Indulási belépési pont: mentett mód visszaállítása + rendszer-figyelő. */
export function initTheme(): void {
  applyThemeMode(loadThemeMode())
  startSystemThemeWatcher()
}
