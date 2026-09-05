/**
 * Excel-előkészítés közös lépés-logika (2026-06-12, Endre #1 Excel-wizard).
 *
 * EGYETLEN igazság-forrás a Beállítások → Könyvelés panel
 * (`components/settings/konyveles-panel.tsx`) ÉS az Excel-beállítás varázsló
 * (`components/excel-setup-wizard.tsx`) számára — mindkét felület UGYANEZEKET
 * a függvényeket hívja, így a lépések logikája sosem térhet el egymástól.
 *
 * A lépések (a varázsló sorrendjében):
 *   1. Könyvelés-mappa előkészítése  → loadExcelFolderState / setupExcelFolder
 *   2. Excel-fejléc (Koltsegvetes!B78 = egyházmegye a hivatalos 24-es listából,
 *      B79 = egyházközség)           → loadExcelFejlecState / applyExcelFejlec
 *   3. Bankszámla → betű-lap párosítás (deviza-javaslat + KÖTELEZŐ megerősítés
 *      + duplikált-betű védelem)     → loadExcelBankMappingState /
 *                                      suggestBankLetters / confirmExcelBankMapping
 *   4. Excel-szinkron kapcsoló       → applyExcelSyncEnabled
 *   5. Záró ellenőrzés               → isExcelSetupComplete
 *
 * A tényleges Excel-fájl-írást továbbra is kizárólag a Rust-réteg
 * (`excel.ts` burok) és az `excel-write-sync.ts` worker végzi.
 */

import {
  excelDefaultFolder,
  excelFolderInfo,
  excelReadCells,
  excelReadMeta,
  excelSaveFile,
  excelSetCells,
  excelSetupFolder as excelSetupFolderCmd,
  type ExcelFolderInfo,
  type SheetMeta,
} from './excel'
import {
  EXCEL_EGYHAZMEGYEK,
  KOLTSEGVETES_SHEET,
  KOLTSEGVETES_MEGYE_CELL,
  KOLTSEGVETES_EGYHAZKOZSEG_CELL,
  LS_DIOCESE,
  LS_FOLDER,
  LS_LOGO,
  getBankMap,
  isExcelSyncEnabled,
  saveBankMap,
  setExcelSyncEnabled,
  suggestExcelMegye,
  suggestExcelEgyhazkozsegNev,
  type BankMapEntry,
} from './excel-settings'
import {
  runExcelWriteSyncManually,
  startExcelWriteAutoSync,
} from './excel-write-sync'
import { getDesktopSupabase } from './supabase'
import { getDesktopUser } from './desktop-user'
import { getLocalOwnCongregation, getLocalOwnProfile } from './sync'

// ─────────────────────────────────────────────────────────────────────────
// Közös események — a panel és a varázsló laza összekötése
// ─────────────────────────────────────────────────────────────────────────

/** Erre az eseményre a desktop-shell megnyitja az Excel-beállítás varázslót. */
export const OPEN_EXCEL_WIZARD_EVENT = 'kartoteka:open-excel-wizard'

/**
 * A varázsló bezárásakor sül el — a nyitva maradt Könyvelés-panel erre
 * frissíti az állapotát (mappa / fejléc / párosítás / kapcsoló).
 */
export const EXCEL_SETUP_CHANGED_EVENT = 'kartoteka:excel-setup-changed'

export function emitExcelSetupChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EXCEL_SETUP_CHANGED_EVENT))
}

// ─────────────────────────────────────────────────────────────────────────
// 1. lépés — Könyvelés-mappa
// ─────────────────────────────────────────────────────────────────────────

/**
 * A Könyvelés-mappa aktuális állapota: a mentett (LS) vagy az alapértelmezett
 * útvonal feloldása + létezik-e az Adatok_<év>.xlsx. Nem-Tauri környezetben
 * (sima böngésző) dob — a hívó try/catch-csel kezeli.
 */
export async function loadExcelFolderState(year: number): Promise<ExcelFolderInfo> {
  const saved =
    typeof window !== 'undefined' ? window.localStorage.getItem(LS_FOLDER) : null
  const path = saved && saved.trim() ? saved : await excelDefaultFolder(year)
  return excelFolderInfo(path)
}

/**
 * A Könyvelés-mappa előkészítése: ha még nincs, a becsomagolt hivatalos
 * EREK-sablont a gépre másolja, és az útvonalat elmenti (LS_FOLDER).
 */
export async function setupExcelFolder(year: number): Promise<ExcelFolderInfo> {
  const saved =
    typeof window !== 'undefined' ? window.localStorage.getItem(LS_FOLDER) : null
  const info = await excelSetupFolderCmd(year, saved && saved.trim() ? saved : null)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LS_FOLDER, info.folderPath)
  }
  return info
}

// ─────────────────────────────────────────────────────────────────────────
// Gyülekezeti kontextus + logó-cache (a 2. lépés építőkövei)
// ─────────────────────────────────────────────────────────────────────────

export interface CongregationContext {
  /** Az egyházmegye hivatalos neve (dioceses.name / denormalizált / LS-cache). */
  dioceseName: string | null
  /** A gyülekezet neve (nev_hu, tartalékként name). */
  congName: string | null
  /** A gyülekezeti címer URL-je (a logó-cache-hez). */
  cimerUrl: string | null
}

/**
 * Gyülekezeti kontextus feloldása: az egyházmegye nevét (elsődlegesen a
 * hivatalos `dioceses.name` online, a congregation diocese_id-ja alapján;
 * tartalékként a denormalizált egyhazmegye-mező, majd a lokális LS-cache
 * offline) + a gyülekezet nevét és a logó URL-jét.
 */
export async function getCongregationContext(): Promise<CongregationContext> {
  let cimerUrl: string | null = null
  let congName: string | null = null
  try {
    const supabase = getDesktopSupabase()
    const user = await getDesktopUser()
    if (user) {
      const cong = await getLocalOwnCongregation(user.id)
      if (!cong) await getLocalOwnProfile(user.id) // best-effort hidratálás
      cimerUrl = cong?.cimer_url ?? null
      congName = cong?.nev_hu?.trim() || cong?.name?.trim() || null
      let name = cong?.egyhazmegye?.trim() || null
      if (cong?.diocese_id) {
        try {
          const { data } = await supabase
            .from('dioceses')
            .select('name')
            .eq('id', cong.diocese_id)
            .maybeSingle()
          if (data?.name) name = String(data.name).trim()
        } catch {
          /* offline — marad a denormalizált / cache */
        }
      }
      if (name) {
        window.localStorage.setItem(LS_DIOCESE, name)
        return { dioceseName: name, congName, cimerUrl }
      }
    }
  } catch {
    /* csendes — esünk a cache-re */
  }
  return { dioceseName: window.localStorage.getItem(LS_DIOCESE), congName, cimerUrl }
}

/** ArrayBuffer → base64 (a webview btoa-jával; a logók kicsik, ez bőven elég). */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * A gyülekezeti logó letöltése + lokális cache-elése a Könyvelés-mappába
 * („csak letöltés/cache", NEM az Excelbe ágyazva). Best-effort: null hiba esetén.
 */
export async function cacheCongregationLogo(
  folderPath: string,
  cimerUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(cimerUrl)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const ext = (
      cimerUrl.split('?')[0].match(/\.(png|jpe?g|gif|webp|svg)$/i)?.[1] ?? 'png'
    ).toLowerCase()
    const sep = folderPath.includes('\\') ? '\\' : '/'
    const dest = `${folderPath}${sep}cimer.${ext}`
    await excelSaveFile(dest, arrayBufferToBase64(buf))
    window.localStorage.setItem(LS_LOGO, dest)
    return dest
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. lépés — Excel-fejléc (Koltsegvetes!B78 + B79)
// ─────────────────────────────────────────────────────────────────────────

export interface ExcelFejlecState {
  /** A fájl B78 cellájának aktuális (trimmelt) értéke. */
  fileMegye: string
  /** A fájl B79 cellájának aktuális (trimmelt) értéke. */
  fileNev: string
  /** Szerkesztő-draft: a fájl értéke; ha üres, a gyülekezeti adatokból javaslat. */
  megyeDraft: string
  nevDraft: string
}

/**
 * A Koltsegvetes-fejléc állapota: a fájl B78/B79 cellái + javaslatok a
 * gyülekezeti adatokból. null, ha a fájl nem olvasható (pl. nyitva/zárolt) —
 * a hívó ilyenkor a meglévő állapotot hagyja meg.
 */
export async function loadExcelFejlecState(
  target: ExcelFolderInfo,
): Promise<ExcelFejlecState | null> {
  if (!target.adatokPath) return null
  try {
    const [b78, b79] = await excelReadCells(target.adatokPath, KOLTSEGVETES_SHEET, [
      KOLTSEGVETES_MEGYE_CELL,
      KOLTSEGVETES_EGYHAZKOZSEG_CELL,
    ])
    // Draft: a fájl értéke az igazság; ha üres, a gyülekezeti adatokból javaslunk.
    const ctx = await getCongregationContext()
    const megyeJavaslat = suggestExcelMegye(ctx.dioceseName)
    const nevJavaslat = suggestExcelEgyhazkozsegNev(ctx.congName)
    return {
      fileMegye: b78.trim(),
      fileNev: b79.trim(),
      megyeDraft: b78.trim() || megyeJavaslat || '',
      nevDraft: b79.trim() || nevJavaslat,
    }
  } catch {
    return null
  }
}

export type ApplyFejlecResult =
  | { megye: string; nev: string; logoCached: boolean }
  | { error: string }

/**
 * A Koltsegvetes-fejléc beírása: B78 = egyházmegye (a sablon X1:X24 listájának
 * PONTOS rövid neve, pl. „Kolozsvári"), B79 = egyházközség neve („Református"
 * és „Egyházközség" nélkül). A V3/V1 suffix-konstansokból a B88/B90 képletek
 * állítják elő a hivatalos fejlécet — a V3-at egy korábbi (hibás) auto-konfig
 * felülírhatta a teljes megyenévvel, ezért a gyári értéket visszaállítjuk.
 * + a gyülekezeti logó letöltése/cache-elése (ha van beállítva).
 *
 * A `draft` a felületen szerkesztett értékpár; üres draft-mező esetén a
 * gyülekezeti adatokból javasolt érték kerül be (NEM találgatunk — érvénytelen
 * vagy hiányzó megye esetén hibával térünk vissza).
 */
export async function applyExcelFejlec(
  target: ExcelFolderInfo,
  draft?: { megye?: string; nev?: string },
): Promise<ApplyFejlecResult> {
  const ctx = await getCongregationContext()
  const megye = draft?.megye?.trim() || suggestExcelMegye(ctx.dioceseName) || ''
  const nev = draft?.nev?.trim() || suggestExcelEgyhazkozsegNev(ctx.congName)

  if (!megye) {
    return {
      error:
        'Az egyházmegye neve még hiányzik — válaszd ki a lenyílóból a Beállítások → Könyvelés „Excel-fejléc" részben (a rendszer nem találgat).',
    }
  }
  if (!(EXCEL_EGYHAZMEGYEK as readonly string[]).includes(megye)) {
    return {
      error: `„${megye}" nem szerepel a hivatalos egyházmegye-listában — válassz a lenyílóból.`,
    }
  }
  if (!nev) {
    return {
      error:
        'Az egyházközség neve még hiányzik — írd be a Beállítások → Könyvelés „Excel-fejléc" részben.',
    }
  }

  if (target.adatokPath) {
    await excelSetCells(target.adatokPath, [
      { sheet: KOLTSEGVETES_SHEET, cell: KOLTSEGVETES_MEGYE_CELL, value: megye },
      { sheet: KOLTSEGVETES_SHEET, cell: KOLTSEGVETES_EGYHAZKOZSEG_CELL, value: nev },
      // Gyári suffix visszaállítása (öngyógyítás a korábbi V3-felülírás után).
      { sheet: KOLTSEGVETES_SHEET, cell: 'V3', value: ' REFORMÁTUS EGYHÁZMEGYE' },
    ])
  }
  let logoCached = false
  if (ctx.cimerUrl) {
    logoCached = (await cacheCongregationLogo(target.folderPath, ctx.cimerUrl)) !== null
  }
  return { megye, nev, logoCached }
}

// ─────────────────────────────────────────────────────────────────────────
// 3. lépés — Bankszámla → betű-lap párosítás
// ─────────────────────────────────────────────────────────────────────────

export interface ExcelBankAccountRow {
  id: number
  bank_neve: string
  valuta: string | null
}

export interface ExcelBankMappingState {
  /** A felhasználó gyülekezete (null, ha nincs feloldható user/profil). */
  congregationId: string | null
  /** Aktív bankszámlák (online; offline üres — a mentett térkép nevei élnek). */
  bankAccounts: ExcelBankAccountRow[]
  /** Az Excel betű-lapjai devizával (a javaslathoz; olvasási hibánál üres). */
  bankSheets: SheetMeta[]
  /** A mentett térkép draft-alakban: bankszamlaId → betű. */
  draft: Record<number, string>
  /** A mentett térkép megerősített-e (enélkül a worker nem ír bank-lapra). */
  confirmed: boolean
}

/**
 * A bank-párosítás teljes állapotának betöltése: bankszámlák (online) +
 * Excel betű-lapok (deviza a C3-ból) + a mentett, évhez kötött térkép.
 * Minden rész-hiba türelmes — a visszatérő állapot a lehető legteljesebb.
 */
export async function loadExcelBankMappingState(
  target: ExcelFolderInfo | null,
  year: number,
): Promise<ExcelBankMappingState> {
  const empty: ExcelBankMappingState = {
    congregationId: null,
    bankAccounts: [],
    bankSheets: [],
    draft: {},
    confirmed: false,
  }
  let cid: string | null = null
  try {
    const user = await getDesktopUser()
    if (!user) return empty
    const profile = await getLocalOwnProfile(user.id)
    cid = profile?.congregation_id ?? null
  } catch {
    /* user-feloldási hiba — üres állapot, a hívó nem kap kivételt */
  }
  if (!cid) return empty

  const state: ExcelBankMappingState = { ...empty, congregationId: cid }

  // Bankszámlák — online; offline a mentett térkép nevei maradnak
  try {
    const supabase = getDesktopSupabase()
    const { data } = await supabase
      .from('bankszamlak')
      .select('id, bank_neve, valuta')
      .eq('congregation_id', cid)
      .eq('aktiv', true)
      .order('bank_neve')
    if (data) state.bankAccounts = data as ExcelBankAccountRow[]
  } catch {
    /* offline — a mentett térkép alapján mutatunk */
  }

  // Excel betű-lapok (deviza a C3-ból) — a javaslathoz
  if (target?.adatokPath) {
    try {
      const meta = await excelReadMeta(target.adatokPath)
      state.bankSheets = meta.sheets.filter((s) => s.isBank)
    } catch {
      /* csendes — pl. nyitott/zárolt fájl */
    }
  }

  // Mentett térkép
  const saved = getBankMap(cid, year)
  if (saved) {
    state.confirmed = saved.confirmed
    for (const e of saved.entries) state.draft[e.bankszamlaId] = e.letter
  }
  return state
}

/**
 * Deviza-alapú javaslat: az első olyan betű-lap, amelynek C3-devizája egyezik,
 * és még nincs másik bankhoz rendelve (bank_neve sorrendben). A már kiosztott
 * draft-bejegyzéseket nem írja felül.
 */
export function suggestBankLetters(
  bankAccounts: ExcelBankAccountRow[],
  bankSheets: SheetMeta[],
  current: Record<number, string>,
): Record<number, string> {
  const draft: Record<number, string> = { ...current }
  const used = new Set(Object.values(draft))
  for (const acc of bankAccounts) {
    if (draft[acc.id]) continue
    const wanted = (acc.valuta ?? 'RON').trim().toUpperCase()
    const candidate = bankSheets.find(
      (s) =>
        !used.has(s.name) &&
        (s.currency ?? '').trim().toUpperCase() === wanted,
    )
    if (candidate) {
      draft[acc.id] = candidate.name
      used.add(candidate.name)
    }
  }
  return draft
}

export type ConfirmBankMappingResult =
  | { ok: true; count: number }
  | { ok: false; error: string }

/**
 * A bank → betű-lap párosítás megerősítése: duplikált-betű védelem + mentés
 * (confirmed=true) + a várakozó banki tételek azonnali szinkron-kísérlete.
 */
export function confirmExcelBankMapping(
  congregationId: string,
  year: number,
  bankAccounts: ExcelBankAccountRow[],
  draft: Record<number, string>,
): ConfirmBankMappingResult {
  const entries: BankMapEntry[] = bankAccounts
    .filter((a) => draft[a.id])
    .map((a) => ({
      bankszamlaId: a.id,
      bankNeve: a.bank_neve,
      valuta: a.valuta,
      letter: draft[a.id],
    }))
  if (entries.length === 0) {
    return { ok: false, error: 'Legalább egy bankszámlához válassz betű-lapot.' }
  }
  // Duplikált betű-védelem
  const letters = entries.map((e) => e.letter)
  if (new Set(letters).size !== letters.length) {
    return {
      ok: false,
      error: 'Két bank nem kaphatja ugyanazt a betű-lapot — javítsd a kiosztást.',
    }
  }
  saveBankMap(congregationId, year, { confirmed: true, entries })
  // A várakozó banki tételek a megerősítés után azonnal mehetnek a fájlba.
  // Az időtúllépés / hiba nem néma (konzol), de a megerősítést nem buktatja el.
  runExcelWriteSyncManually().catch((err: unknown) => {
    console.warn('[excel-setup-flow] a megerősítés utáni Excel-írás jelzett:', err instanceof Error ? err.message : String(err))
  })
  return { ok: true, count: entries.length }
}

// ─────────────────────────────────────────────────────────────────────────
// 4. lépés — Excel-szinkron kapcsoló
// ─────────────────────────────────────────────────────────────────────────

/**
 * A kapcsoló átállítása + bekapcsoláskor a háttér-worker azonnali indítása
 * (boot-on az auth-gate indítja; itt nem várunk a következő appindításig).
 */
export function applyExcelSyncEnabled(enabled: boolean): void {
  setExcelSyncEnabled(enabled)
  if (enabled) startExcelWriteAutoSync()
}

// ─────────────────────────────────────────────────────────────────────────
// 5. lépés / belépési pontok — kész-e az előkészítés?
// ─────────────────────────────────────────────────────────────────────────

/**
 * Teljes-e az Excel-előkészítés? (mappa létezik + szinkron bekapcsolva +
 * Koltsegvetes!B78/B79 kitöltve). A Pénzügy-oldal „Excel-könyvelés" hero-gombja
 * ennek alapján dönt: hiányos előkészítésnél a varázslót nyitja.
 *
 * HIBÁRA TÜRELMES: bármilyen hibánál (nem-Tauri környezet, nyitott/zárolt
 * Excel-fájl…) true-t ad — ilyenkor inkább a megszokott Beállítások-fület
 * nyitjuk, semmint hogy tévesen a varázslóval zaklassuk a felhasználót.
 */
export async function isExcelSetupComplete(): Promise<boolean> {
  try {
    const year = new Date().getFullYear()
    const info = await loadExcelFolderState(year)
    if (!info.exists || !info.adatokPath) return false
    if (!isExcelSyncEnabled()) return false
    const [b78, b79] = await excelReadCells(info.adatokPath, KOLTSEGVETES_SHEET, [
      KOLTSEGVETES_MEGYE_CELL,
      KOLTSEGVETES_EGYHAZKOZSEG_CELL,
    ])
    return Boolean(b78.trim() && b79.trim())
  } catch {
    return true
  }
}
