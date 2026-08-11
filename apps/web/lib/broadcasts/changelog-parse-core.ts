/**
 * CHANGELOG-elemző MAG — 2026-08-12.
 *
 * TISZTA függvény: se fájlrendszer, se Supabase, se `server-only`. Csak
 * `import type` van benne, ezért a `scripts/selftest-changelog.mjs` közvetlenül
 * be tudja tölteni és állításokat tehet rá. Ha ide valaha PROJEKT-import kerül,
 * az önteszt LÁTHATÓAN elbukik — ez szándékos.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT ÍRÓDOTT ÚJRA (2026-08-12) — HÁROM NÉMA HIBA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * (1) SORVÉG-ÉRZÉKENYSÉG — a FEJLESZTŐI GÉPEN a teljes listát elvitte.
 *     A régi minták így néztek ki:
 *       fejléc:   /^##\s+\[(\d{4}-\d{2}-\d{2})\]\s+—\s+(.+)$/
 *       metaadat: /^<!--\s*(\w+):\s*(.+?)\s*-->$/
 *     A JavaScriptben a `$` — a Perl/Python szokással ELLENTÉTBEN — `m` jelző
 *     nélkül CSAK a sztring végén illeszkedik, a `.` pedig SOHA nem illeszkedik
 *     a `\r`-re (az sorvég-karakter). A régi elemző `content.split('\n')`-nel
 *     dolgozott, tehát CRLF-es fájlon MINDEN sor egy `\r`-rel a végén érkezett.
 *     A repóban a `docs/CHANGELOG.md` LF-fel van tárolva, de a Windows-os
 *     munkapéldány (`core.autocrlf=true`, és NINCS `.gitattributes`) CRLF-re
 *     alakítja.
 *
 *     ⚠️ A KÖVETKEZMÉNY NEM AZ, AMIT ELSŐRE HINNI LEHET. Nem csak a
 *     `<!-- key: -->` sor bukott el a `$`-on, hanem a `## [dátum] — Cím`
 *     FEJLÉC is. Fejléc nélkül pedig nincs bejegyzés. A valódi munkapéldányon
 *     lemérve (17 499 CRLF sorvég): a RÉGI elemző CRLF mellett NULLA
 *     bejegyzést adott. Vagyis a fejlesztői gépen a Frissítések lista ÜRES
 *     volt, nem volt mit kiküldeni, és a `sendChangelogBroadcast` az
 *     `entries.find`-on állt meg — a localhost NEM tudott hibás kulcsot írni
 *     az éles adatbázisba. Éles (LF-es) futáson a régi elemző 342 bejegyzést
 *     adott, ott ez a hiba NEM jelentkezett.
 *     Ez a hiba tehát VALÓS, de a bejelentett éles tünetet nem ez okozza —
 *     azt lásd a (3) pontban.
 *     JAVÍTÁS: a szöveget beolvasás után normalizáljuk (`\r\n` és magányos `\r`
 *     is `\n` lesz), és a sorokat elemzés előtt jobbról trimmeljük.
 *
 * (2) A BETŰVEL TOLDOTT DÁTUMÚ FEJLÉCEK ELVESZTEK. A régi minta csak a sima
 *     `[ÉÉÉÉ-HH-NN]` alakot fogadta el, a `[2026-05-06c]`-féléket nem — azok
 *     NÉMÁN beleolvadtak az előttük álló bejegyzés törzsébe. 454 fejlécből 342
 *     jutott át; a `[2026-05-04]` bejegyzés törzse emiatt 141 794 karakteres
 *     lett (58 kiadást nyelt el). Egy „Kiküldés" kattintás ekkora értesítést
 *     és e-mailt küldött volna ~495 gyülekezetnek.
 *     JAVÍTÁS: a dátum után megengedett egy rövid betű/szám-toldalék. A
 *     `[YYYY-MM-DD]` SABLON-sor (a fájl tetején, kódblokkban) továbbra sem
 *     illeszkedik, mert a dátum-részt szigorúan `\d{4}-\d{2}-\d{2}` köti.
 *
 * (3) A CÍMBŐL GENERÁLT KULCS NÉMA CSAPDA — ez a LEGVALÓSZÍNŰBB ÉLES GYÖKÉR-OK.
 *     Ha nincs `<!-- key: -->`, a kulcs a címből képződik — egy elgépelés-javítás
 *     vagy egy átfogalmazás a címben némán ÚJ kulcsot csinál, a régi kiküldés
 *     „elveszik", a bejegyzés újra kiküldetlennek látszik.
 *     A MÉRET: a régi elemző éles (LF-es) futásán 342 bejegyzésből 121-nek NEM
 *     volt saját kulcsa, tehát 121 bejegyzés egyetlen cím-átíráson múlt. Ezért
 *     ez, és nem az (1), a bejelentett tünet („azokat is mutatja, hogy nem volt
 *     kiküldve, amik már voltak") legvalószínűbb éles magyarázata.
 *     JAVÍTÁS: a generálás megmarad (különben a bejegyzés eltűnne), de a
 *     `keyGenerated: true` mező MEGMONDJA, és a felület kiírja. A már
 *     elszakadt párosításokat a kézi „kiküldöttnek jelölöm" gomb hozza rendbe,
 *     valódi újraküldés nélkül.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { ChangelogEntry, ReleaseCategory } from './types'

/**
 * Fejléc: `## [2026-05-06] — Cím` vagy `## [2026-05-06c] — Cím`.
 *
 * A dátum-rész SZIGORÚAN `\d{4}-\d{2}-\d{2}`, a toldalék legfeljebb 3 betű/szám.
 * Így a fájl tetején lévő `## [YYYY-MM-DD] — Rövid összefoglaló` SABLON-sor
 * (ami egy ```-kódblokkban áll) továbbra sem számít bejegyzésnek.
 */
const FEJLEC = /^##\s+\[(\d{4}-\d{2}-\d{2})([a-z0-9]{0,3})\]\s+—\s+(.+)$/
const META = /^<!--\s*(\w+):\s*(.+?)\s*-->$/

const ERVENYES_KATEGORIAK: ReleaseCategory[] = [
  'bugfix',
  'feature',
  'improvement',
  'security',
  'breaking',
]

/**
 * A CHANGELOG szövegéből bejegyzés-lista.
 *
 * A visszaadott `alreadySent` / `broadcastStatus` / `jeloles` mezőket a hívó
 * tölti ki az adatbázisból — itt szándékosan üresek.
 */
export function parseChangelogText(raw: string): ChangelogEntry[] {
  // (1) SORVÉG-NORMALIZÁLÁS — lásd a fájl fejlécét. A BOM-ot is levágjuk:
  // egyetlen láthatatlan karakter a fájl elején az első fejlécet vinné el.
  const content = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const lines = content.split('\n').map((l) => l.replace(/[ \t]+$/, ''))

  const entries: ChangelogEntry[] = []
  let i = 0

  while (i < lines.length) {
    const headerMatch = lines[i].match(FEJLEC)
    if (!headerMatch) {
      i++
      continue
    }

    const date = headerMatch[1]
    const suffix = headerMatch[2] || ''
    const dateLabel = `${date}${suffix}`
    const title = headerMatch[3].trim()
    i++

    // Metaadat sorok: <!-- key: ... --> stb.
    let key: string | null = null
    let category: ReleaseCategory | null = null
    let version: string | null = null
    let targetsHint: string | null = null

    while (i < lines.length) {
      const metaMatch = lines[i].match(META)
      if (!metaMatch) break
      const [, name, value] = metaMatch
      if (name === 'key') key = value.trim()
      else if (name === 'category') {
        const v = value.trim() as ReleaseCategory
        if (ERVENYES_KATEGORIAK.includes(v)) category = v
      } else if (name === 'version') version = value.trim()
      else if (name === 'targets') targetsHint = value.trim()
      i++
    }

    // Body: a következő fejlécig vagy a fájl végéig.
    const bodyStart = i
    while (i < lines.length && !FEJLEC.test(lines[i])) i++
    const bodyMarkdown = lines
      .slice(bodyStart, i)
      .join('\n')
      .replace(/^-{3,}\s*$/gm, '') // vízszintes vonal eltávolítása
      .trim()

    // (3) Ha nincs saját kulcs, generálunk — de MEGJELÖLJÜK.
    const keyGenerated = !key
    if (!key) key = `${dateLabel}-${slugify(title).slice(0, 40)}`

    entries.push({
      key,
      keyGenerated,
      date,
      dateLabel,
      title,
      category,
      version,
      targetsHint,
      bodyMarkdown,
      alreadySent: false, // ezt a caller állítja be a DB alapján
      broadcastStatus: null,
      jeloles: null,
    })
  }

  return entries
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}
