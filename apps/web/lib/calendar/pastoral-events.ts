/**
 * Lelkészi (PRIVÁT) naptár-feed eseménygyártó — 2026-08-11.
 *
 * MI EZ
 * ─────
 * A gyülekezeti (nyilvános) feed a PROGRAMOKAT viszi ki a Google Naptárba.
 * Ez a modul azt a másik felét adja, ami a lelkésznek NAPI szinten segít, és
 * amit eddig a rendszer TÁROLT, de SOHA nem számolt ki naptárra:
 *   · születésnap            (szemely.sz_datum)
 *   · névnap                 (szemely.k_nev ⟷ nevnap tábla)
 *   · házassági évforduló    (hazassag.datum)
 *   · konfirmációi évforduló (konfirmalas.datum)
 *
 * ⚠️ PASZTORÁLIS ÉRZÉKENYSÉG — MI KERÜL KI EGY HARMADIK FÉL NAPTÁRÁBA
 * ──────────────────────────────────────────────────────────────────
 * Ez a feed a Google/Apple szerverére másolódik, és a telefon ZÁROLÁSI
 * KÉPERNYŐJÉN is megjelenhet — ott, ahol bárki elolvashatja, aki ránéz a
 * lelkész telefonjára. Ezért szándékosan SZŰK, amit kiadunk:
 *
 *  BENNE  · név + az évforduló sorszáma (ennyi kell a köszöntéshez)
 *  KINT   · teljes születési dátum, cím, telefon, CNP, e-mail
 *  KINT   · bármilyen pénzügyi állapot (járulék-hátralék) — egy „tartozik"
 *           felirat a zárolási képernyőn méltóságot sért
 *  KINT   · haláleset- / temetés-évfordulók: a gyász nem kéretlen push-értesítés
 *  KINT   · elhunyt házastárs melletti házassági évforduló (lásd lentebb)
 *  KINT   · keresztelési évfordulók (jellemzően kiskorúak — a szülő beleegyezése
 *           nélkül gyereklista nem megy ki külső szolgáltatóhoz)
 *  KINT   · munkanapló / megjegyzés szabad szövegek (lelkigondozói titok)
 *  KINT   · az „elv." (elvált) előtag — ez BELSŐ nyilvántartási jelölés, nem
 *           társadalmi megszólítás; a Google Naptárban a házasság felbomlását
 *           kürtölné világgá. Az „özv." marad, mert az bevett magyar megszólítás.
 *
 * A tényleges SQL-szűrés (elhunyt, elköltözött, nem látható tag kizárása) az
 * RPC-ben van: migration-docs/sql/2026-08-11-lelkeszi-naptar-token.sql
 */

import type { CalendarAllDayEvent } from './ics'
// MÉLY import (nem a barrel!): a barrel 'use client' komponenseket is exportál,
// ezt a fájlt viszont API-route és szerver-akció is húzza. Ugyanaz a minta,
// mint az apps/web/lib/utils/member-helpers.ts-ben.
import { formatNameWithPrefix } from '@kartoteka/ui-app/src/members/name-format'

// ─────────────────────────────────────────────────────────────────────────
// Az RPC (lelkeszi_naptar_feed) által visszaadott nyers sorok
// ─────────────────────────────────────────────────────────────────────────

export interface PastoralPersonRow {
  id: number | string
  csaladnev: string | null
  k_nev: string | null
  namepattern: string | null
  allapot: string | null
}

export interface PastoralBirthdayRow extends PastoralPersonRow {
  /** 'YYYY-MM-DD' */
  datum: string
}

export interface PastoralNamedayRow extends PastoralPersonRow {
  honap: number
  nap: number
}

export interface PastoralWeddingRow {
  id: number | string
  /** 'YYYY-MM-DD' (az RPC már dátumra vágja a timestamp-et) */
  datum: string
  ferfi: PastoralPersonRow
  no: PastoralPersonRow
}

export interface PastoralConfirmationRow extends PastoralPersonRow {
  /** 'YYYY-MM-DD' */
  datum: string
}

export interface PastoralFeedPayload {
  status?: string
  congregation_name?: string | null
  szuletesnapok?: PastoralBirthdayRow[] | null
  nevnapok?: PastoralNamedayRow[] | null
  hazassagok?: PastoralWeddingRow[] | null
  konfirmaciok?: PastoralConfirmationRow[] | null
}

export interface PastoralEventOptions {
  /** A feed ablaka (mindkettő inkluzív) — a sorszámos események kibontásához. */
  fromYear: number
  toYear: number
  includeBirthdays: boolean
  includeNamedays: boolean
  includeWeddings: boolean
  /** 'nem' = ki | 'kerek' = csak az 5-tel osztható évek | 'mind' = minden év */
  confirmations: 'nem' | 'kerek' | 'mind'
}

// ─────────────────────────────────────────────────────────────────────────
// Segédek
// ─────────────────────────────────────────────────────────────────────────

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Létező naptári nap-e a (hónap, nap) pár? A rossz adat NEM lesz eseménnyé. */
function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= DAYS_IN_MONTH[month - 1]
}

/** 'YYYY-MM-DD' (vagy ISO timestamp) → [év, hónap, nap] vagy null. */
function parseIsoDate(value: string | null | undefined): [number, number, number] | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (!isValidMonthDay(mo, d)) return null
  return [y, mo, d]
}

/**
 * Az évforduló napja a CÉLÉVBEN, 'YYYY-MM-DD' alakban.
 *
 * Feb 29: nem szökőévben február 28-ra csúszik. (A másik bevett megoldás a
 * március 1. lenne — a magyar gyakorlat a 28-a, és a köszöntés így biztosan
 * még februárban történik.)
 */
function occurrenceDate(month: number, day: number, year: number): string | null {
  if (!isValidMonthDay(month, day)) return null
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Naptárba írható név.
 *
 * A kanonikus `formatNameWithPrefix`-et használjuk (egyetlen igazság-forrás a
 * web és a desktop között), de az „elvált" állapotot ELŐTTE kinullázzuk — lásd
 * a fájl fejlécének pasztorális szakaszát. Az „özv." előtag marad.
 */
export function calendarSafeName(person: PastoralPersonRow | null | undefined): string {
  if (!person) return '(névtelen)'
  const namepattern =
    (person.namepattern || '').trim().toLowerCase().replace(/\.$/, '') === 'elv'
      ? null
      : person.namepattern
  return formatNameWithPrefix({
    csaladnev: person.csaladnev,
    k_nev: person.k_nev,
    namepattern,
    allapot: person.allapot === 'elvált' ? null : person.allapot,
  })
}

const SOURCE_LINE = (congregation: string) => `Kartotéka — lelkészi naptár (${congregation})`

// ─────────────────────────────────────────────────────────────────────────
// Eseménygyártás
// ─────────────────────────────────────────────────────────────────────────

export function buildPastoralEvents(
  payload: PastoralFeedPayload,
  options: PastoralEventOptions,
): CalendarAllDayEvent[] {
  const { fromYear, toYear } = options
  const congregation = (payload.congregation_name || 'Gyülekezet').trim()
  const source = SOURCE_LINE(congregation)
  const events: CalendarAllDayEvent[] = []

  // ── Születésnapok — a cím SORSZÁMOT hordoz („80. születésnap"), ezért
  //    évenként kibontva (RRULE-lal minden évben ugyanaz a szám állna). ──
  if (options.includeBirthdays) {
    for (const row of payload.szuletesnapok ?? []) {
      const parsed = parseIsoDate(row.datum)
      if (!parsed) continue
      const [birthYear, month, day] = parsed
      const name = calendarSafeName(row)
      for (let y = fromYear; y <= toYear; y++) {
        const age = y - birthYear
        // 0. vagy negatív „születésnap" nincs: elgépelt jövőbeli dátum, vagy
        // maga a születés éve.
        if (age <= 0) continue
        const date = occurrenceDate(month, day, y)
        if (!date) continue
        events.push({
          uid: `kartoteka-lp-szul-${row.id}-${y}`,
          summary: `🎂 ${name} — ${age}. születésnap`,
          date,
          description: source,
          category: 'Születésnap',
        })
      }
    }
  }

  // ── Névnapok — a cím ÉVRŐL ÉVRE UGYANAZ, tehát ez a valódi „évente
  //    ismétlődő" eset: EGY VEVENT + RRULE:FREQ=YEARLY. ──
  if (options.includeNamedays) {
    // Ugyanaz a személy több névnap-soron is szerepelhet (több névnapos nevek),
    // de ugyanarra a (személy, hónap, nap) hármasra csak EGY esemény kell.
    const seen = new Set<string>()
    for (const row of payload.nevnapok ?? []) {
      const month = Number(row.honap)
      const day = Number(row.nap)
      const date = occurrenceDate(month, day, fromYear)
      if (!date) continue
      const key = `${row.id}-${month}-${day}`
      if (seen.has(key)) continue
      seen.add(key)
      events.push({
        uid: `kartoteka-lp-nevnap-${row.id}-${month}-${day}`,
        summary: `💐 ${calendarSafeName(row)} — névnap`,
        date,
        yearly: true,
        description: source,
        category: 'Névnap',
      })
    }
  }

  // ── Házassági évfordulók ──
  // Az RPC csak azokat adja, ahol MINDKÉT házasfél él és a gyülekezethez
  // tartozik: az özvegy számára az esküvő napja gyászdátum, nem ünnep.
  if (options.includeWeddings) {
    for (const row of payload.hazassagok ?? []) {
      const parsed = parseIsoDate(row.datum)
      if (!parsed) continue
      const [weddingYear, month, day] = parsed
      const nev = `${calendarSafeName(row.ferfi)} és ${calendarSafeName(row.no)}`
      for (let y = fromYear; y <= toYear; y++) {
        const nth = y - weddingYear
        if (nth <= 0) continue
        const date = occurrenceDate(month, day, y)
        if (!date) continue
        events.push({
          uid: `kartoteka-lp-hazassag-${row.id}-${y}`,
          summary: `💍 ${nev} — ${nth}. házassági évforduló`,
          date,
          description: source,
          category: 'Házassági évforduló',
        })
      }
    }
  }

  // ── Konfirmációi évfordulók ──
  // ALAPÉRTELMEZÉS: csak a KEREK (5-tel osztható) évek. Egy 400 lelkes
  // gyülekezetben az összes évforduló évi ~300 további eseményt jelentene —
  // a naptár használhatatlan zajjá válna, és a fontos (25./50.) évfordulók
  // épp abban vesznének el. A `?konfirmacio=mind` paraméter feloldja.
  if (options.confirmations !== 'nem') {
    const all = options.confirmations === 'mind'
    for (const row of payload.konfirmaciok ?? []) {
      const parsed = parseIsoDate(row.datum)
      if (!parsed) continue
      const [confYear, month, day] = parsed
      const name = calendarSafeName(row)
      for (let y = fromYear; y <= toYear; y++) {
        const nth = y - confYear
        if (nth <= 0) continue
        if (!all && nth % 5 !== 0) continue
        const date = occurrenceDate(month, day, y)
        if (!date) continue
        events.push({
          uid: `kartoteka-lp-konf-${row.id}-${y}`,
          summary: `✝ ${name} — ${nth} éve konfirmált`,
          date,
          description: source,
          category: 'Konfirmációi évforduló',
        })
      }
    }
  }

  // Determinisztikus sorrend — a feed így byte-azonos két egymás utáni
  // lekérésnél, amíg az adat nem változik (a naptár-szolgáltatók egy része
  // ebből következtet arra, hogy van-e egyáltalán változás).
  events.sort((a, b) => (a.date === b.date ? a.uid.localeCompare(b.uid) : a.date.localeCompare(b.date)))
  return events
}
