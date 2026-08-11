'use client'

/**
 * ÁLLAPOT-KÁRTYA — egyetlen kérdésre válaszol: „TEGNAP VALÓDI VOLT-E A MENTÉS?"
 * (2026-08-11)
 *
 * ─── A ZÖLD BIZONYÍTÁSA ────────────────────────────────────────────────────
 * ⚠️ A kártya CSAK akkor zöld, ha a napló szerint a mentés `status='ok'` ÉS
 * `drive_verified_at IS NOT NULL` — vagyis a rendszer VISSZA IS OLVASTA a
 * fájlt a Drive-ról, és a hash egyezett. Egy „ok" sor igazolás nélkül itt
 * NEM zöld, hanem borostyán („elindult, de nem igazolt").
 *
 * Ez a szabály azért ilyen szigorú, mert a megnyugtató zöld pipa a
 * legveszélyesebb hazugság, amit egy mentés-felület mondhat.
 *
 * ─── A 14 NAPOS PULZUS ─────────────────────────────────────────────────────
 * Egy szám („12 mentés") elrejti a mintázatot. A csík megmutatja, hogy a hiba
 * egyszeri döccenő volt-e, vagy három hete tart.
 */

import { AlertTriangle, CheckCircle2, CircleSlash, Clock, ShieldAlert } from 'lucide-react'

import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import type { BackupOverview, DailyCoverage, PulseDay } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

function huNap(nap: string): string {
  if (!nap) return '—'
  const [y, m, d] = nap.split('-')
  return `${y}. ${m}. ${d}.`
}

function rovidNap(nap: string): string {
  const [, m, d] = nap.split('-')
  return `${m}.${d}.`
}

function huIdopont(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface Megjelenes {
  intent: StatusIntent
  cimke: string
  keret: string
  hatter: string
  szoveg: string
  Ikon: typeof CheckCircle2
}

function megjelenes(overview: BackupOverview): Megjelenes {
  switch (overview.health.allapot) {
    case 'friss':
      return {
        intent: 'success',
        cimke: 'Ellenőrzött mentés van',
        keret: 'border-emerald-300 dark:border-emerald-900',
        hatter: 'bg-emerald-50 dark:bg-emerald-950/30',
        szoveg: 'text-emerald-900 dark:text-emerald-200',
        Ikon: CheckCircle2,
      }
    case 'elavult':
      return {
        intent: 'warning',
        cimke: 'Elavult',
        keret: 'border-amber-300 dark:border-amber-800/60',
        hatter: 'bg-amber-50 dark:bg-amber-950/30',
        szoveg: 'text-amber-900 dark:text-amber-100',
        Ikon: AlertTriangle,
      }
    case 'sql_hianyzik':
      return {
        intent: 'neutral',
        cimke: 'Nincs telepítve',
        keret: 'border-border',
        hatter: 'bg-muted/50',
        szoveg: 'text-foreground',
        Ikon: CircleSlash,
      }
    default:
      return {
        intent: 'danger',
        cimke: overview.health.allapot === 'nincs_mentes' ? 'Nincs mentés' : 'Kritikus',
        keret: 'border-destructive/40',
        hatter: 'bg-destructive/10',
        szoveg: 'text-destructive',
        Ikon: ShieldAlert,
      }
  }
}

/** A nap egyetlen, kimondott mondata — soha nem puszta szám. */
function napMondat(cov: DailyCoverage, cimke: string): { szoveg: string; intent: StatusIntent } {
  if (cov.varhato === 0) {
    return { szoveg: `${cimke}: nincs olyan gyülekezet, amire mentést várnánk.`, intent: 'neutral' }
  }
  if (cov.igazolt === cov.varhato) {
    return {
      szoveg: `${cimke}: mind a(z) ${cov.varhato} mentés elkészült ÉS ellenőrizve lett.`,
      intent: 'success',
    }
  }
  const reszek: string[] = [`${cov.igazolt} igazolt`]
  if (cov.hianyzik > 0) reszek.push(`${cov.hianyzik} HIÁNYZIK`)
  if (cov.hibas > 0) reszek.push(`${cov.hibas} hibára futott`)
  if (cov.befejezetlen > 0) reszek.push(`${cov.befejezetlen} nem fejeződött be`)
  return {
    szoveg: `${cimke} (${cov.varhato} hatókörből): ${reszek.join(', ')}.`,
    intent: cov.igazolt === 0 ? 'danger' : 'warning',
  }
}

function PulzusCsik({ napok }: { napok: PulseDay[] }) {
  if (napok.length === 0) return null
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Az elmúlt 14 nap
      </p>
      <ul className="flex items-end gap-1" role="list">
        {napok.map((n) => {
          const teljes = n.varhato > 0 && n.igazolt === n.varhato
          const reszleges = n.igazolt > 0 && !teljes
          const cim = teljes
            ? `${huNap(n.nap)}: mind a(z) ${n.varhato} mentés igazolt`
            : n.igazolt === 0
              ? `${huNap(n.nap)}: NINCS igazolt mentés (${n.varhato} kellett volna)`
              : `${huNap(n.nap)}: ${n.igazolt} igazolt a(z) ${n.varhato}-ból`
          return (
            <li key={n.nap} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              {/* 44px-es érintőfelület: a 12px-es csík fölé láthatatlan sáv kerül. */}
              <span
                title={cim}
                aria-label={cim}
                className="flex h-11 w-full items-end justify-center"
              >
                <span
                  aria-hidden
                  className={[
                    'block h-3 w-full rounded-sm',
                    teljes
                      ? 'bg-emerald-500'
                      : reszleges
                        ? 'bg-amber-400'
                        : 'bg-destructive/70',
                  ].join(' ')}
                />
              </span>
              <span className="text-[9px] tabular-nums text-muted-foreground sm:text-[10px]">
                {rovidNap(n.nap)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function BackupOverviewCard({ overview }: { overview: BackupOverview }) {
  const m = megjelenes(overview)
  const tegnap = napMondat(overview.tegnap, `Tegnap (${huNap(overview.tegnap.nap)})`)
  const ma = napMondat(overview.ma, `Ma (${huNap(overview.ma.nap)})`)

  return (
    <section
      aria-label="A biztonsági mentés állapota"
      className={`rounded-2xl border p-4 sm:p-5 ${m.keret} ${m.hatter}`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background/60 ${m.szoveg}`}>
          <m.Ikon className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`font-heading text-lg leading-tight ${m.szoveg}`}>{overview.health.mondat}</h2>
            <StatusBadge intent={m.intent} dot>
              {m.cimke}
            </StatusBadge>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" aria-hidden />
            <span>
              Utolsó <strong>ellenőrzött</strong> mentés: {huIdopont(overview.health.utolsoIgazoltAt)}
            </span>
          </p>

          {overview.health.driveHiba ? (
            <p className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {overview.health.driveHiba}
            </p>
          ) : null}
        </div>
      </div>

      {/* A KÉT KÖZPONTI MONDAT */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {[tegnap, ma].map((sor, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <div className="flex items-start gap-2">
              <StatusBadge intent={sor.intent} dot>
                {sor.intent === 'success' ? 'rendben' : sor.intent === 'neutral' ? 'nincs adat' : 'baj van'}
              </StatusBadge>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{sor.szoveg}</p>
          </div>
        ))}
      </div>

      {/* MEGNEVEZETT hiányzók — „37 sor törlődik" semmit nem jelent, a NÉV mindent. */}
      {overview.tegnap.problemasNevek.length > 0 && (
        <details className="mt-3 rounded-xl border border-border bg-card px-3 py-2">
          <summary className="min-h-11 cursor-pointer list-none py-2 text-sm font-semibold text-foreground">
            Melyik gyülekezetről nincs igazolt tegnapi mentés? ({overview.tegnap.problemasNevek.length})
          </summary>
          <ul className="mt-1 grid grid-cols-1 gap-0.5 pb-2 text-xs text-muted-foreground sm:grid-cols-2">
            {overview.tegnap.problemasNevek.map((nev) => (
              <li key={nev} className="truncate">
                • {nev}
              </li>
            ))}
          </ul>
        </details>
      )}

      <PulzusCsik napok={overview.pulzus} />

      {/*
        ⚠️ HOVA MEGY VALÓJÁBAN A MENTÉS.
        A felület korábban „Google Drive összekötve"-t mutatott pusztán attól,
        hogy volt OAuth-token — miközben minden fájl ugyanabba a Supabase-fiókba
        került, ahol az adatbázis is van. Egy mentés fő értéke az, hogy MÁSHOL
        van; ezt nem szabad félreérthetően kiírni.
      */}
      {overview.taroloNev !== 'google-drive' && (
        <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-foreground">
          <strong>A mentések NEM a Google Drive-ra kerülnek</strong>, hanem ide:{' '}
          <code className="rounded bg-muted px-1">{overview.taroloNev}</code>. Ez ugyanabban a
          felhő-fiókban van, mint az adatbázis — egyetlen fiók-szintű baleset (törölt projekt,
          elvesztett hozzáférés) mindkettőt viszi. Kösd össze a Google Drive-ot.
        </p>
      )}

      {/*
        ⚠️ A KULCS-LETÉT. Enélkül a napi (felügyelet nélküli) mentések KIZÁRÓLAG
        a szerver kulcsával nyílnak. Ez nem apró részlet: ha az a kulcs elveszik
        vagy lecserélődik, MINDEN felhőben lévő mentés véglegesen olvashatatlan.
      */}
      {!overview.helyreallitoKulcs && (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-foreground">
          <strong>A mentések CSAK a szerver kulcsával nyithatók meg.</strong> Amíg nincs beállítva
          MENTÉSI JELSZÓ, a napi mentések kizárólag a szerver{' '}
          <code className="rounded bg-muted px-1">BACKUP_ENCRYPTION_KEY</code> változójával fejthetők
          vissza. Ha az elveszik vagy lecserélődik, minden felhőben lévő mentés véglegesen
          olvashatatlanná válik. Állíts be mentési jelszót — attól kezdve minden ÚJ mentés a
          jelszóval, a rendszer nélkül is megnyitható (a{' '}
          <code className="rounded bg-muted px-1">kartoteka-mentes-megnyitas.mjs</code> szkripttel).
        </p>
      )}

      {overview.egyeztetes.futott && (
        <p
          className={[
            'mt-3 rounded-lg px-3 py-2 text-xs',
            overview.egyeztetes.hianyzo > 0
              ? 'border border-destructive/30 bg-destructive/5 text-destructive'
              : 'bg-muted/60 text-muted-foreground',
          ].join(' ')}
        >
          {overview.egyeztetes.hianyzo > 0 ? (
            <>
              <strong>Egyeztetés:</strong> a napló szerint {overview.egyeztetes.naploSzerint} fájl kellene, a
              tárolóban {overview.egyeztetes.driveOn} található — {overview.egyeztetes.hianyzo} HIÁNYZIK.
              Valószínűleg kézzel elmozgatták vagy törölték őket.
              {overview.egyeztetes.hianyzoMedia && overview.egyeztetes.hianyzoMedia > 0 ? (
                <>
                  {' '}
                  Ebből <strong>{overview.egyeztetes.hianyzoMedia} FÉNYKÉP-FÁJL</strong>: az ezekre
                  hivatkozó mentések a listán zöldek maradnak, de a visszaállításuk (helyesen) meg
                  fog tagadni, nehogy minden arckép törlődjön.
                </>
              ) : null}
            </>
          ) : (
            <>
              <strong>Egyeztetés:</strong> a napló szerinti {overview.egyeztetes.naploSzerint} fájl mind megvan a
              tárolóban.
              {overview.egyeztetes.ismeretlen > 0
                ? ` Ezen felül ${overview.egyeztetes.ismeretlen} ismeretlen fájl van a mappában — ezeket a rendszer soha nem törli automatikusan.`
                : ''}
              {overview.egyeztetes.masTaroloban && overview.egyeztetes.masTaroloban > 0
                ? ` Ezen kívül ${overview.egyeztetes.masTaroloban} régebbi mentés MÁSIK tárolóban van — azok innen nem látszanak, de nem is vesztek el.`
                : ''}
            </>
          )}
        </p>
      )}
    </section>
  )
}
