/**
 * Admin-meghívó — közös típusok és validációs helperek (2026-08-09).
 *
 * A Next.js 16 szabály miatt a 'use server' fájl (meghivo-actions.ts) csak
 * async függvényeket exportálhat — a típusok és konstansok itt élnek, a
 * kliens-dialog és a szerver-action közösen importálja őket.
 */

/** A meghívott neve mező maximális hossza. */
export const INVITE_NAME_MAX = 120

/** A személyes üzenet maximális hossza. */
export const INVITE_MESSAGE_MAX = 1000

export interface InviteInput {
  /** A meghívott e-mail-címe (kötelező). */
  email: string
  /** A meghívott neve (opcionális — megszólításhoz). */
  name?: string
  /** Az admin személyes üzenete (opcionális — idézetként kerül a levélbe). */
  personalMessage?: string
}

export interface InviteResult {
  success?: boolean
  /** Magyar nyelvű hibaüzenet, ha a küldés nem sikerült. */
  error?: string
}

/**
 * A meghívó-levél rendszerbemutatója — kategorizálva, emojikkal, lelkész-barát
 * megfogalmazásban (2026-08-09, Endre kérése). EGY helyen él: a levél-sablon
 * (lib/email/templates/invite.ts) és a dialógus élő előnézete is innen olvassa.
 */
export interface InviteFeatureCategory {
  emoji: string
  title: string
  items: string[]
}

export const INVITE_FEATURE_CATEGORIES: InviteFeatureCategory[] = [
  {
    emoji: '👥',
    title: 'Tagnyilvántartás',
    items: [
      'Személyi és családi kartonok — nyomtatható, élő előnézettel',
      'Családfa több nemzedékre, házasságok és rokoni kapcsolatok',
      'Hivatalos választói névjegyzék egy gombnyomásra',
      'A meglévő Excel-nyilvántartás percek alatt importálható',
    ],
  },
  {
    emoji: '💰',
    title: 'Pénzügy és könyvelés',
    items: [
      'Kassza és bank vezetése, Chitanță-nyugtaszámozás automatikusan',
      'Egyházfenntartói járulék követése, hátralék-kimutatás családonként',
      'Hivatalos nyomtatványok: pénztárnapló, számadás, költségvetés',
      'Banki kivonat importálása, év végi zárás és újévi nyitás',
    ],
  },
  {
    emoji: '📖',
    title: 'Anyakönyvek',
    items: [
      'Keresztelési, konfirmációi, esketési és temetési anyakönyv',
      'Hivatalos anyakönyvi kivonatok és igazolások nyomtatása',
      'A bejegyzések a munkanaplóval maguktól összekapcsolódnak',
    ],
  },
  {
    emoji: '📦',
    title: 'Leltár és iktató',
    items: [
      'Vagyonleltár amortizáció-számítással, hivatalos nyomtatványokkal',
      'Tételenkénti fişă, a könyvelésből egy kattintással leltárba vétel',
      'Iktatókönyv sorszámozással, igazolás-sablonok kiállítása',
    ],
  },
  {
    emoji: '📔',
    title: 'Munkanapló és igehirdetési terv',
    items: [
      'Szolgálatok, hitoktatás és látogatások naplózása',
      'Hivatalos munkanapló és éves lelkészi jelentés nyomtatása',
      'Igehirdetési terv naptárral, emlékeztetőkkel',
      'Beépített énekkereső (teljes szövegű) és Károli-konkordancia',
    ],
  },
  {
    emoji: '📅',
    title: 'Gyülekezeti naptár',
    items: [
      'Programok és alkalmak tervezése, akár ismétlődően',
      'Google Naptárral összeköthető — a telefonon is ott van',
    ],
  },
  {
    emoji: '🔒',
    title: 'Biztonság és adatvédelem',
    items: [
      'Minden gyülekezet kizárólag a SAJÁT adatait látja',
      'Jogosultsági szintek: lelkész, gondnok, könyvelő, egyházmegye',
      'Biztonságos, folyamatos mentés — semmi nem vész el',
    ],
  },
  {
    emoji: '💻',
    title: 'Bárhonnan, magyarul',
    items: [
      'Böngészőből fut — számítógépen, tableten és telefonon is',
      'Végig magyar nyelven, a romániai hivatalos nyomtatványokhoz igazítva',
    ],
  },
]

// Egyszerű, gyakorlatias e-mail minta — a végleges ellenőrzést úgyis a
// levélküldő provider végzi; itt csak az elgépeléseket szűrjük ki.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidInviteEmail(email: string): boolean {
  const e = email.trim()
  return e.length > 3 && e.length <= 254 && EMAIL_RE.test(e)
}
