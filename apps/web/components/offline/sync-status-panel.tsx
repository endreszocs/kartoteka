'use client'

/**
 * SZINKRON-PANEL — „mi, hogyan és miért szinkronizál" (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SZABÁLY: CSAK VALÓDI ADAT
 * ════════════════════════════════════════════════════════════════════════════
 * Ez a panel KIZÁRÓLAG olyat mond ki, amit a rendszer tényleg tud. Amit
 * SZÁNDÉKOSAN NEM állítunk, mert nincs mögötte adat:
 *   · „hátralévő idő" / százalékos készültség — nincs haladás-modell,
 *   · „hány sor jött le az imént" — a `pulledCount` nem perzisztál,
 *   · „utolsó feltöltés időpontja" — a `_sync_meta.lastPushAt` mezőt a szinkron
 *     útvonal SOHA nem írja (csak az Excel-figyelő), tehát hazugság lenne.
 * Egy kitalált „még 2 perc" rosszabb, mint a hallgatás: elveszi a bizalmat
 * pont attól a kijelzőtől, amiért a lelkész ide kattintott.
 *
 * Amit MUTAT, és honnan:
 *   · MI — `TABLE_REGISTRY` ember-olvasható `label`-jei modulonként, mellettük
 *     a helyben tárolt rekordszám (élő Dexie `count()`),
 *   · MIKOR — `_sync_meta.lastPullAt` táblánként; a LEGRÉGEBBI belőlük a
 *     becsületes „utolsó teljes kör",
 *   · HOGYAN — a `SYNC_IDOZITES` VALÓDI konstansaiból (egyetlen igazságforrás),
 *   · MI VÁR FELTÖLTÉSRE — a mutációs sor TELJES állapot-bontása, benne a két
 *     korábban láthatatlan kategóriával (beragadt / véglegesen fentragadt),
 *   · HIBÁK — a `_sync_meta.lastError` VALÓDI mondatai, nem egy „próbáld újra".
 *
 * ⚠️ 2026-08-11 — A HATÓKÖR-MONDAT IS A KÓDBÓL SZÁMOLÓDIK. Itt korábban ez állt:
 * „Csak a saját gyülekezeted adatai kerülnek le a készülékedre." Ez NEM volt igaz
 * és nem is volt bizonyítható: a `TABLE_REGISTRY` tíz bejegyzésén `scopeFilter:
 * 'none'` áll, ezeknél a kliens SZŰRETLEN SELECT-et küld (`pull.ts` csak
 * `'congregation_id'` esetén tesz `.eq()`-t), a hatókört kizárólag az
 * adatbázis-oldali RLS adja. Maga a `table-registry.ts` dokumentálja, hogy ez a
 * feltételezés MÁR EGYSZER MEGBUKOTT (a három temetői tábla MINDEN gyülekezet
 * sorát letöltötte a böngésző helyi tárolójába). Egy „CSAK VALÓDI ADAT" fejlécű
 * panelben a legdrágább fajta állítás lett volna. A mondat mostantól a
 * regiszterből SZÁMOLÓDIK — ha valaha minden tábla `congregation_id`-re szűr,
 * magától visszaáll az erős állításra; addig őszintén megnevezi a kivételeket.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  History,
  Info,
  RefreshCw,
  WifiOff,
} from 'lucide-react'

import { huIdopontBukarest, huRelativIdo } from '@/lib/utils/idopont-bukarest'
import { getDb, type SyncMetaRecord } from '@/lib/offline/db'
import type { SyncAllapot } from '@/lib/offline/hooks/use-sync-status'
import { SYNC_IDOZITES } from '@/lib/offline/sync-orchestrator'
import {
  MODULE_META,
  TABLE_REGISTRY,
  getTablesByModule,
  type ModuleKey,
} from '@/lib/offline/table-registry'

interface TablaAllapot {
  dexieTable: string
  label: string
  darab: number
  lastPullAt: string | null
  lastError: string | null
}

/**
 * A HATÓKÖR-MONDAT — a `TABLE_REGISTRY`-BŐL SZÁMOLVA, nem beírva.
 *
 * A `SYNC_IDOZITES` mintáját követi: ami a felületen szám vagy állítás, az a
 * VALÓDI forrásból jöjjön, különben előbb-utóbb elsodródik tőle. Itt a tét külön
 * nagy: egy hamis biztonsági ígéret rosszabb, mint a hallgatás.
 */
const SZURETLEN_TABLAK = TABLE_REGISTRY.filter((t) => t.scopeFilter === 'none')

const HATOKOR_MONDAT = (() => {
  if (SZURETLEN_TABLAK.length === 0) {
    // Minden tábla `congregation_id`-re szűr — az erős állítás BIZONYÍTOTT.
    return 'Csak a bekapcsolt gyülekezeted adatai kerülnek le a készülékedre.'
  }
  const peldak = SZURETLEN_TABLAK.slice(0, 3)
    .map((t) => t.label.toLowerCase())
    .join(', ')
  return (
    'Az adatkörök nagy része a bekapcsolt gyülekezetedre szűkítve jön le. ' +
    `${SZURETLEN_TABLAK.length} kapcsolódó adatkör (${peldak}…) hatókörét viszont ` +
    'nem a kérés, hanem az adatbázis jogosultsági szabálya adja — rendszergazdai ' +
    'fiókkal ezekből több gyülekezeté is lekerülhet.'
  )
})()

export function SyncStatusPanel({ allapot }: { allapot: SyncAllapot }) {
  const [tablak, setTablak] = useState<TablaAllapot[]>([])
  const [betoltve, setBetoltve] = useState(false)
  const [kezi, setKezi] = useState(false)

  const frissit = useCallback(async () => {
    if (typeof window === 'undefined') return
    try {
      const db = getDb()
      const sorok: TablaAllapot[] = []
      for (const entry of TABLE_REGISTRY) {
        const darab = await db.table(entry.dexieTable).count()
        const meta = (await db._sync_meta.get(entry.dexieTable)) as SyncMetaRecord | undefined
        sorok.push({
          dexieTable: entry.dexieTable,
          label: entry.label,
          darab,
          lastPullAt: meta?.lastPullAt ?? null,
          lastError: meta?.lastError ?? null,
        })
      }
      setTablak(sorok)
    } catch (e) {
      console.warn('[szinkron-panel] a helyi állapot nem olvasható:', e)
    } finally {
      setBetoltve(true)
    }
  }, [])

  useEffect(() => {
    void frissit()
    const id = window.setInterval(() => void frissit(), 5_000)
    return () => window.clearInterval(id)
  }, [frissit])

  const terkep = new Map(tablak.map((t) => [t.dexieTable, t]))
  const osszesRekord = tablak.reduce((s, t) => s + t.darab, 0)
  const hibasTablak = tablak.filter((t) => t.lastError)

  // A becsületes „utolsó teljes kör": a LEGRÉGEBBI tábla-időbélyeg. Ha akár egy
  // tábla sincs még letöltve, nem állítunk teljes kört.
  const idobelyegek = tablak.map((t) => t.lastPullAt)
  const vanHianyzo = idobelyegek.some((x) => !x)
  const legregebbi = idobelyegek
    .filter((x): x is string => !!x)
    .sort()[0]

  async function keziSzinkron() {
    setKezi(true)
    try {
      await allapot.szinkronizaljMost()
      await frissit()
    } finally {
      setKezi(false)
    }
  }

  const b = allapot.bontas

  return (
    // A magasságot a HÍVÓ korlátozza (a gombhoz mérten, lásd sync-status-button):
    // itt csak görgethetővé tesszük a tartalmat.
    <div className="flex h-full flex-col overflow-y-auto overscroll-contain">
      {/* ── MOST: az aktuális állapot, egy mondatban ──────────────────── */}
      <div className="border-b border-border p-4">
        <div className="flex items-start gap-3">
          <AllapotIkon allapot={allapot} />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[15px] font-semibold text-foreground">
              {ALLAPOT_CIM[allapot.kulcs]}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {allapotMagyarazat(allapot)}
            </p>
          </div>
        </div>

        {/* A visszaállítás-üzenet a legfontosabb: külön kiemelve.

            ⚠️ A SZÖVEG SZÍNE `--foreground`, NEM `--destructive`. Lemérve a kert
            témában, a `--destructive`/10 tintán (a `--popover` fölött): világosban
            4,18:1, sötétben 3,88:1 — a 12,5px-es félkövér felirat NORMÁL szöveg,
            tehát 4,5:1 kellene. MINDKÉT mód bukott. A `--foreground` ugyanezeken a
            felületeken 13,0:1 és 10,1:1. A „baj" jelentését az IKON és a piros
            KERET hordozza (grafikai elem: 3:1 az elvárás, azt tartják) — pontosan
            az a minta, amit a `hangsulySzin()` és az `AllapotIkon` már követ. */}
        {allapot.visszaallitasUzenet ? (
          <div className="mt-3 flex gap-2 rounded-xl border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 p-3">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0"
              style={{ color: 'var(--destructive)' }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold leading-relaxed text-foreground">
                {allapot.visszaallitasUzenet}
              </p>
              <button
                type="button"
                onClick={allapot.visszaallitasNyugtaz}
                className="mt-2 inline-flex min-h-11 items-center rounded-lg px-3 text-[12.5px] font-semibold text-foreground underline underline-offset-2"
              >
                Elolvastam
              </button>
            </div>
          </div>
        ) : null}

        {/* A VALÓDI hibaüzenet — nem „próbáld újra". */}
        {allapot.utolsoHiba && !allapot.visszaallitasUzenet ? (
          <p className="mt-3 rounded-xl border border-border bg-muted/60 p-3 text-[12.5px] leading-relaxed text-foreground">
            {allapot.utolsoHiba}
          </p>
        ) : null}

        {/* ⚠️ A gomb NEM tehet úgy, mintha csinálna valamit. Ha az orchestrator el
            sem indult (nincs gyülekezet-kontextus), a `syncNow()` NÉMÁN visszatér
            — korábban a lelkész kattintott, és semmi, még hibaüzenet sem történt.
            Beszédes felirat + tiltás. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void keziSzinkron()}
            disabled={!allapot.szinkronAktiv || !allapot.online || kezi || allapot.fut}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-[13px] font-semibold text-[var(--primary-foreground)] transition hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${kezi || allapot.fut ? 'animate-spin' : ''}`} aria-hidden />
            {!allapot.szinkronAktiv
              ? 'Itt nincs mit szinkronizálni'
              : allapot.online
                ? 'Szinkronizálás most'
                : 'Nincs internet'}
          </button>
          <Link
            href="/offline"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-4 text-[13px] font-semibold text-foreground transition hover:bg-muted"
          >
            Offline mentés
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      {/* ── MI VÁR FELTÖLTÉSRE ─────────────────────────────────────────── */}
      {b.osszesVarakozo > 0 || b.conflict > 0 ? (
        <Szakasz cim="A te módosításaid" ikon={CloudUpload}>
          <ul className="space-y-1.5 text-[12.5px] text-foreground">
            {b.pending > 0 ? <li>{b.pending} módosítás vár feltöltésre.</li> : null}
            {b.failed > 0 ? (
              <li>{b.failed} módosítás feltöltése hibázott — a rendszer újrapróbálja.</li>
            ) : null}
            {b.syncing > 0 ? (
              <li>
                {b.syncing} módosítás feltöltés közben megszakadt. Nem veszett el: a következő
                belépéskor a rendszer automatikusan újrapróbálja.
              </li>
            ) : null}
            {/* ⚠️ A SÚLYOS sorok szövege `--foreground`, a piros az IKONÉ. A
                `--destructive` sima `bg-popover`-en világosban 4,79:1 (átmegy),
                SÖTÉTBEN viszont 4,39:1 — épphogy bukik a 4,5:1-en. A szín amúgy
                sem lehet egyedüli jelzés (WCAG 1.4.1), az ikon egyszerre oldja
                meg a kontrasztot és a jelzés-redundanciát. */}
            {b.dead > 0 ? (
              <SulyosSor>
                {b.dead} módosítás többszöri próbálkozás után SEM ment fel. Ez emberi
                beavatkozást kíván — szólj a rendszergazdának.
              </SulyosSor>
            ) : null}
            {b.conflict > 0 ? (
              <SulyosSor>
                {b.conflict} ütközés: ugyanazt a rekordot közben más is módosította.
              </SulyosSor>
            ) : null}
          </ul>
        </Szakasz>
      ) : null}

      {/* ── HIBÁK, TÁBLÁNKÉNT, VALÓDI SZÖVEGGEL ────────────────────────── */}
      {hibasTablak.length > 0 ? (
        <Szakasz cim="Ami nem töltődött le hibátlanul" ikon={AlertTriangle}>
          <ul className="space-y-2 text-[12.5px] leading-relaxed text-foreground">
            {hibasTablak.map((t) => (
              <li key={t.dexieTable}>
                <span className="font-semibold">{t.label}:</span> {t.lastError}
              </li>
            ))}
          </ul>
        </Szakasz>
      ) : null}

      {/* ── MI SZINKRONIZÁL ────────────────────────────────────────────── */}
      <Szakasz
        cim="Mi kerül le a készülékedre"
        ikon={History}
        also={
          betoltve ? (
            <span className="text-[11.5px] text-muted-foreground">
              Összesen {osszesRekord.toLocaleString('hu-HU')} tétel van elmentve helyben.
              {' '}
              {vanHianyzo
                ? 'Van olyan adatkör, amelyről még nem készült helyi másolat.'
                : legregebbi
                  ? `A legrégebbi frissítés: ${relativIdo(legregebbi)}.`
                  : ''}
            </span>
          ) : null
        }
      >
        <ul className="space-y-2">
          {(Array.from(new Set(TABLE_REGISTRY.map((t) => t.module))) as ModuleKey[]).map(
            (modul) => {
              const modulTablak = getTablesByModule(modul)
              const osszeg = modulTablak.reduce(
                (s, t) => s + (terkep.get(t.dexieTable)?.darab ?? 0),
                0,
              )
              return (
                <li key={modul} className="text-[12.5px]">
                  <span className="font-semibold text-foreground">
                    {MODULE_META[modul].label}
                  </span>
                  <span className="text-muted-foreground">
                    {' — '}
                    {modulTablak.map((t) => t.label.toLowerCase()).join(', ')}
                    {betoltve ? ` (${osszeg.toLocaleString('hu-HU')} tétel)` : ''}
                  </span>
                </li>
              )
            },
          )}
        </ul>
      </Szakasz>

      {/* ── HOGYAN ─────────────────────────────────────────────────────── */}
      <Szakasz cim="Hogyan működik" ikon={RefreshCw}>
        <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          <li>
            Amíg nyitva van az ablak, {percben(SYNC_IDOZITES.aktivPullMs)} frissül a helyi
            másolat; háttérben {percben(SYNC_IDOZITES.hatterPullMs)}.
          </li>
          <li>
            A te módosításaid {masodpercben(SYNC_IDOZITES.pushMs)} indulnak felfelé, amint van
            internet.
          </li>
          <li>
            Ha egy kör {percTartam(SYNC_IDOZITES.pullKorIdokorlatMs)}-nél tovább tartana, a
            rendszer megszakítja, és a következő körben folytatja. Így a jelző nem pöröghet
            a végtelenségig.
          </li>
          <li>{HATOKOR_MONDAT}</li>
        </ul>
      </Szakasz>

      {/* ── MIÉRT ──────────────────────────────────────────────────────── */}
      <Szakasz cim="Miért csinálja ezt" ikon={Info}>
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          A gyülekezeti munka nagy része nem az iroda asztalánál történik: temetőben, beteg
          mellett, gyülekezetlátogatáson gyakran nincs térerő. A Kartotéka ezért folyamatosan
          másolatot tart a készülékeden, és amit beírsz, előbb helyben menti el — majd amint
          újra van internet, magától felküldi. Nem kell figyelned rá, és nem kell megvárnod.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Őszintén a mai állapotról:</span>{' '}
          ez a helyi másolat ma az Excel-mentést és a teljes helyi biztonsági másolatot
          szolgálja ki; a modulok képernyői egyelőre élő internetkapcsolattal dolgoznak. Az
          offline szerkesztés modulonként épül be — addig is ez a másolat az, ami miatt az
          adataid nem csak egy helyen léteznek.
        </p>
      </Szakasz>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Kisegítő megjelenítés
// ─────────────────────────────────────────────────────────────────────────────

/** Súlyos lista-sor: piros IKON + `--foreground` szöveg (lásd a kontraszt-jegyzetet). */
function SulyosSor({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-1.5 font-semibold text-foreground">
      <AlertTriangle
        className="mt-0.5 size-3.5 shrink-0"
        style={{ color: 'var(--destructive)' }}
        aria-hidden
      />
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}

function Szakasz({
  cim,
  ikon: Ikon,
  children,
  also,
}: {
  cim: string
  ikon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  also?: React.ReactNode
}) {
  return (
    <section className="border-b border-border p-4 last:border-b-0">
      <h3 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <Ikon className="size-3.5" aria-hidden />
        {cim}
      </h3>
      {children}
      {also ? <p className="mt-2">{also}</p> : null}
    </section>
  )
}

function AllapotIkon({ allapot }: { allapot: SyncAllapot }) {
  const { kulcs } = allapot
  const baj =
    kulcs === 'konfliktus' || kulcs === 'hiba' || kulcs === 'fentragadt' || kulcs === 'visszaallitas'
  // A „nem szinkronizál" SEMLEGES, nem baj és nem siker — a `varakozo`/`offline`
  // ággal azonos, visszafogott formanyelvet kap.
  const semleges = kulcs === 'varakozo' || kulcs === 'offline' || kulcs === 'nincs_szinkron'
  const Ikon =
    kulcs === 'offline'
      ? WifiOff
      : baj
        ? AlertTriangle
        : kulcs === 'folyamatban'
          ? RefreshCw
          : kulcs === 'varakozo'
            ? CloudUpload
            : kulcs === 'nincs_szinkron'
              ? CloudOff
              : CheckCircle2

  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-xl"
      style={{
        background: baj
          ? 'color-mix(in oklab, var(--destructive) 15%, transparent)'
          : semleges
            ? 'color-mix(in oklab, var(--accent) 22%, transparent)'
            : 'color-mix(in oklab, var(--primary) 15%, transparent)',
        // ⚠️ A „várakozik" ág `--foreground`-ot kap, NEM `--accent-foreground`-ot:
        // az utóbbi mindkét témában majdnem fekete, tehát sötét módban bukna a
        // kontraszt. Az állapotot az IKON hordozza, nem a szín.
        color: baj ? 'var(--destructive)' : semleges ? 'var(--foreground)' : 'var(--primary)',
      }}
      aria-hidden
    >
      <Ikon className={`size-5 ${kulcs === 'folyamatban' ? 'animate-spin' : ''}`} />
    </span>
  )
}

const ALLAPOT_CIM: Record<SyncAllapot['kulcs'], string> = {
  offline: 'Nincs internet — offline módban dolgozol',
  visszaallitas: 'A rendszergazda visszaállított egy korábbi mentést',
  konfliktus: 'Ütközés — emberi döntés kell',
  hiba: 'A legutóbbi szinkron hibába futott',
  fentragadt: 'Van módosítás, ami nem ment fel',
  folyamatban: 'Szinkronizálás folyamatban',
  varakozo: 'Van feltöltésre váró módosításod',
  nincs_szinkron: 'Ezen a profilon nem készül helyi másolat',
  rendben: 'Minden szinkronban van',
}

function allapotMagyarazat(allapot: SyncAllapot): string {
  switch (allapot.kulcs) {
    case 'offline':
      return 'Amit most beírsz, helyben mentődik, és magától felkerül, amint újra van internet. Nyugodtan dolgozz tovább.'
    case 'visszaallitas':
      return 'A helyi másolat teljesen újratöltődik. Nézd át, mi került karanténba — az el nem küldött módosításaid nem vesztek el.'
    case 'konfliktus':
      return 'Ugyanazt a rekordot közben valaki más is módosította, ezért a rendszer nem dönthet helyetted.'
    case 'hiba':
      return 'A részletes hibaüzenet lentebb olvasható. A rendszer a következő körben újrapróbálja.'
    case 'fentragadt':
      return 'Több próbálkozás után sem sikerült feltölteni. Az adat megvan a készülékeden, de a szerverre nem jutott fel.'
    case 'folyamatban':
      return 'Épp fut az adatcsere. Nyugodtan dolgozz közben, nem kell megvárnod.'
    case 'varakozo':
      return 'A módosításaid a készüléken vannak, és a következő körben felkerülnek.'
    case 'nincs_szinkron':
      // ŐSZINTE: rendszergazdai / egyházkerületi / egyházmegyei profilban nincs
      // gyülekezet-kontextus, ezért a szinkron el sem indul. Korábban itt zöld
      // pipa és „a legutóbbi letöltés hibátlan volt" állt — egyetlen letöltés
      // nélkül.
      return 'Rendszergazdai, egyházkerületi és egyházmegyei profilban a Kartotéka nem tart helyi másolatot. Kapcsolj át egy gyülekezeti profilra, ha offline is dolgoznál.'
    case 'rendben':
      return 'Nincs feltöltésre váró módosítás, és a legutóbbi letöltés hibátlan volt.'
  }
}

/** „2 percenként" — a VALÓDI konstansból, nem beírt számból. */
function percben(ms: number): string {
  const perc = Math.round(ms / 60_000)
  return `${perc} percenként`
}

function masodpercben(ms: number): string {
  const mp = Math.round(ms / 1000)
  return `${mp} másodpercenként`
}

/** „4 perc" — időtartam, nem gyakoriság. */
function percTartam(ms: number): string {
  return `${Math.round(ms / 60_000)} perc`
}

function relativIdo(iso: string): string {
  // 2026-08-12: a saját másolat helyett a KÖZÖS relatív idő. Ez volt a harmadik
  // egyforma implementáció a kódbázisban; a negyedik írta volna ki az admin
  // Áttekintésen a „10.650685 órája" szöveget. A pontos időpont formázója
  // ugyanabban a modulban lakik, tehát a kettő nem tud széthúzni.
  const szoveg = huRelativIdo(iso)
  return szoveg || huIdopontBukarest(iso, 'short')
}
