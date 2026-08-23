'use client'

/**
 * SZERVEZETI FA — a három szint csomópontjai (2026-08-22, 7. pont).
 *
 * Egyházkerület → egyházmegye → egyházközség. A vezérlést (betöltés, keresés,
 * rendezés, nyit/zár) a `szervezeti-fa.tsx` végzi; itt CSAK a megjelenítés van.
 *
 * ⚠️ HÁROM SZABÁLY, AMIT EZ A FÁJL ŐRIZ
 * ─────────────────────────────────────────────────────────────────────────
 * (1) A TAGSZÁM SOHA NEM ESIK NÉMÁN NULLÁRA. Minden kiírás a
 *     `tagszamFelirat()`-on megy át (`szervezet-shared.ts`): ismeretlen érték
 *     → „nem tudjuk", dőlten, nem szám. Egy `?? 0` ide SOHA nem kerülhet.
 * (2) A HIÁNYZÓ-MEZŐ JELVÉNY CSAK AKKOR JELENIK MEG, HA MEG IS NÉZTÜK.
 *     `hianyzoMezok === null` = kerületi admin (K4) → a jelvény EL SEM
 *     KERÜL a sorra. Az üres tömb ellenben azt jelenti: megnéztük, minden
 *     megvan — a két állapot nem keverhető össze.
 * (3) MOBIL-FIRST + TOKEN-ALAPÚ SZÍNEK. Nincs hardcode-olt fehér felület
 *     (a címer-csempe az egyetlen, szándékos kivétel — lásd ott).
 */

import {
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  Church,
  Crown,
  Landmark,
  Sparkles,
  ShieldCheck,
  TriangleAlert,
  UserCircle,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { StatusBadge, type StatusIntent } from '@/components/admin/_shared/status-badge'
import { ROLE_LABELS } from '@/lib/profile-roles/types'
import {
  gyulekezetekRendezve,
  keruletOsszeg,
  megyeOsszeg,
  megyekRendezve,
  tagszamFelirat,
  type FaEgyhazmegye,
  type FaGyulekezet,
  type FaKerulet,
  type FaRendezes,
} from '@/app/(dashboard)/admin/szervezet-shared'

// A szerepkör-jelvények ikonja/hangulata. A FELIRAT a kanonikus
// `ROLE_LABELS`-ből jön (lib/profile-roles/types.ts) — nem másoljuk le, hogy a
// két felület ne húzzon szét némán.
const SZEREP_META: Record<string, { intent: StatusIntent; icon: LucideIcon }> = {
  lelkesz: { intent: 'success', icon: Church },
  konyvelo: { intent: 'warning', icon: Calculator },
  esperes: { intent: 'info', icon: Crown },
  egyhazmegyei_admin: { intent: 'info', icon: Building2 },
  egyhazmegyei_szamvevo: { intent: 'warning', icon: Calculator },
  egyhazkeruleti_admin: { intent: 'info', icon: ShieldCheck },
  egyhazkeruleti_szamvevo: { intent: 'warning', icon: Calculator },
  admin: { intent: 'neutral', icon: ShieldCheck },
  custom: { intent: 'neutral', icon: Sparkles },
}

function szerepFelirat(role: string, customLabel: string | null): string {
  if (role === 'custom') return customLabel?.trim() || ROLE_LABELS.custom
  return (ROLE_LABELS as Record<string, string>)[role] || role
}

/** „3 napja" / „ma" — rövid, magyar. `null`-ra `null` (nem írunk ki semmit). */
function aktivitasFelirat(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const nap = Math.floor((Date.now() - t) / 86_400_000)
  if (nap <= 0) return 'ma'
  if (nap === 1) return 'tegnap'
  if (nap < 30) return `${nap} napja`
  if (nap < 365) return `${Math.floor(nap / 30)} hónapja`
  return `${Math.floor(nap / 365)} éve`
}

// ─────────────────────────────────────────────────────────────────────────
// 1. szint — Egyházkerület
// ─────────────────────────────────────────────────────────────────────────

export function KeruletKartya({
  kerulet,
  nyitva,
  nyitottMegyek,
  rendezes,
  onToggle,
  onToggleMegye,
}: {
  kerulet: FaKerulet
  nyitva: boolean
  nyitottMegyek: ReadonlySet<string>
  rendezes: FaRendezes
  onToggle: () => void
  onToggleMegye: (megyeKulcs: string) => void
}) {
  const osszeg = keruletOsszeg(kerulet)
  const arva = kerulet.id === ''
  const megyek = megyekRendezve(kerulet.egyhazmegyek, rendezes)

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={nyitva}
        className="flex w-full items-center gap-3 bg-muted/40 px-3 py-3 text-left transition hover:bg-muted/60 sm:px-5"
      >
        {/* ⚠️ A címer-csempe háttere SZÁNDÉKOSAN papír-fehér: a címer átlátszó
            hátterű, sötét vonalas kép, ami token-alapú felületen sötét módban
            gyakorlatilag eltűnne — a felhasználó azt hinné, nincs feltöltve. */}
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white shadow-sm sm:size-12">
          {kerulet.cimerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={kerulet.cimerUrl}
              alt=""
              aria-hidden
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <Landmark className="size-5 text-[var(--primary)]" aria-hidden />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-heading text-base leading-tight text-foreground sm:text-lg">
              {kerulet.nev}
            </span>
            {kerulet.nevRo && (
              <span className="text-xs italic text-muted-foreground">{kerulet.nevRo}</span>
            )}
            {arva && (
              <StatusBadge intent="warning" icon={TriangleAlert} className="text-[10px]">
                árva ág
              </StatusBadge>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {osszeg.egyhazmegyek} egyházmegye · {osszeg.gyulekezetek} gyülekezet ·{' '}
            <TagszamSzoveg ertek={osszeg.tagszam} /> tag
          </span>
          {kerulet.puspokNev && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Püspök: <span className="font-semibold text-foreground">{kerulet.puspokNev}</span>
            </span>
          )}
        </span>

        {nyitva ? (
          <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      {nyitva && (
        <div className="space-y-2 border-t border-border p-2 sm:p-3">
          {arva && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Ezek az egységek egyetlen egyházkerülethez sem tartoznak, ezért{' '}
                <b>egyetlen kerületi összesítőbe sem számítanak bele</b>. A számuk nem hibás, csak
                hiányos — és eddig semmi nem jelezte. A besorolást a Gyülekezetek oldalon lehet
                pótolni.
              </span>
            </p>
          )}
          {megyek.length === 0 ? (
            <p className="px-3 py-2 text-sm italic text-muted-foreground">
              Ehhez az egyházkerülethez még nem tartozik egyházmegye.
            </p>
          ) : (
            megyek.map((m) => {
              const kulcs = `${kerulet.id}|${m.id}`
              return (
                <MegyeCsomopont
                  key={kulcs}
                  megye={m}
                  rendezes={rendezes}
                  nyitva={nyitottMegyek.has(kulcs)}
                  onToggle={() => onToggleMegye(kulcs)}
                />
              )
            })
          )}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 2. szint — Egyházmegye
// ─────────────────────────────────────────────────────────────────────────

export function MegyeCsomopont({
  megye,
  rendezes,
  nyitva,
  onToggle,
}: {
  megye: FaEgyhazmegye
  rendezes: FaRendezes
  nyitva: boolean
  onToggle: () => void
}) {
  const osszeg = megyeOsszeg(megye)
  const arva = megye.id === ''
  const gyulekezetek = gyulekezetekRendezve(megye.gyulekezetek, rendezes)

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={nyitva}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-muted/50"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[var(--primary)]">
          <Building2 className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold leading-tight text-foreground">{megye.nev}</span>
            {arva && (
              <StatusBadge intent="warning" icon={TriangleAlert} className="text-[10px]">
                árva ág
              </StatusBadge>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {osszeg.gyulekezetek} gyülekezet · <TagszamSzoveg ertek={osszeg.tagszam} /> tag
            {megye.esperesNev ? (
              <>
                {' · esperes: '}
                <span className="font-semibold text-foreground">{megye.esperesNev}</span>
              </>
            ) : null}
          </span>
        </span>
        {nyitva ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      {nyitva && (
        <div className="space-y-1.5 border-t border-border/70 p-2">
          {arva && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Ezek a gyülekezetek egyetlen egyházmegyéhez sem tartoznak: nem jelennek meg a
                megyei és kerületi felületeken, és az irat-beküldésük nem értesíti az esperesi
                hivatalt.
              </span>
            </p>
          )}
          {gyulekezetek.length === 0 ? (
            <p className="px-2 py-1.5 text-xs italic text-muted-foreground">
              Ehhez az egyházmegyéhez még nem tartozik gyülekezet.
            </p>
          ) : (
            gyulekezetek.map((gy, i) => (
              <GyulekezetSor key={gy.id} sorszam={i + 1} gyulekezet={gy} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// 3. szint — Egyházközség
// ─────────────────────────────────────────────────────────────────────────

export function GyulekezetSor({
  sorszam,
  gyulekezet,
}: {
  sorszam: number
  gyulekezet: FaGyulekezet
}) {
  const aktivitas = aktivitasFelirat(gyulekezet.utolsoAktivitas)
  // ⚠️ `null` = NEM NÉZTÜK MEG (kerületi admin, K4). Ilyenkor a jelvény el sem
  //    kerül a sorra — üres tömb ellenben azt jelenti: megnéztük, minden megvan.
  const hianyzo = gyulekezet.hianyzoMezok

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-lg border border-border/60 bg-card px-2.5 py-2 transition hover:border-primary/40">
      <span className="flex shrink-0 items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
          {sorszam}
        </span>
        <Church className="size-4 text-[var(--primary)]" aria-hidden />
      </span>

      <span className="min-w-0 flex-1 basis-40">
        <span className="block text-sm font-semibold leading-tight text-foreground">
          {gyulekezet.nev}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="size-3" aria-hidden />
            <TagszamSzoveg ertek={gyulekezet.tagszam} /> tag
          </span>
          <span className="inline-flex items-center gap-1">
            <UserCircle className="size-3" aria-hidden />
            {gyulekezet.felhasznalok} felhasználó
          </span>
          {aktivitas && <span>utoljára aktív: {aktivitas}</span>}
        </span>
      </span>

      <span className="flex flex-wrap items-center gap-1">
        {gyulekezet.szerepek.map((sz) => {
          const meta = SZEREP_META[sz.role] || SZEREP_META.custom
          return (
            <StatusBadge
              key={`${sz.role}:${sz.customLabel ?? ''}`}
              intent={meta.intent}
              icon={meta.icon}
              className="px-2 text-[10px]"
            >
              {szerepFelirat(sz.role, sz.customLabel)}
              {sz.darab > 1 ? ` ×${sz.darab}` : ''}
            </StatusBadge>
          )
        })}
        <StatusBadge
          intent={gyulekezet.aktiv ? 'success' : 'neutral'}
          dot
          className="px-2 text-[10px]"
        >
          {gyulekezet.aktiv ? 'aktív' : 'inaktív'}
        </StatusBadge>
        {hianyzo && hianyzo.length > 0 && (
          <StatusBadge
            intent="warning"
            icon={TriangleAlert}
            className="px-2 text-[10px]"
            // A `title` egérrel elérhető részletet ad; a teljes lista a
            // kisegítő névben is ott van, hogy érintőképernyőn se vesszen el.
          >
            <span title={hianyzo.join(', ')} aria-label={`Hiányzó mezők: ${hianyzo.join(', ')}`}>
              {hianyzo.length} kötelező mező hiányzik
            </span>
          </StatusBadge>
        )}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// A „nem tudjuk" ≠ 0 EGYETLEN kiírási pontja
// ─────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ MINDEN tagszám-kiírás ezen megy át. Ismeretlen értéknél DŐLT szöveg áll a
 * szám helyén — nulla SOHA. A nulla megnyugtat, és pont az a baj vele.
 */
function TagszamSzoveg({ ertek }: { ertek: number | null }) {
  if (ertek === null) {
    return <span className="italic">{tagszamFelirat(null)}</span>
  }
  return <span className="font-semibold tabular-nums text-foreground">{tagszamFelirat(ertek)}</span>
}
