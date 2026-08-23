'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Cake, Flower2, CalendarClock, List } from 'lucide-react'
import { HU_MONTHS_SHORT } from '@/lib/constants/dashboard'

/**
 * 2026-08-11 (5. kör, P2-#18): a szűrő/nyomtató modál — az üdvözlőkártya-
 * készítővel együtt ~54 KB forrás — LAZY töltődik. Az irányítópult a
 * leggyakrabban megnyitott képernyő, a modált viszont a lelkész többnyire ki
 * sem nyitja. A minta a repóban bevált (AdminImportLazy, FullBackupPanelClient).
 */
const BirthdayListDialog = dynamic(
  () => import('./birthday-list-dialog').then((m) => m.BirthdayListDialog),
  {
    ssr: false,
    // A dialógus portálba renderel, ezért a betöltés-jelző lebegő „pirula"
    // (mobilon is jól látszik), nem a kártyába szúrt üres sor.
    loading: () => (
      <span className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground shadow-lg">
        Születésnapos lista betöltése…
      </span>
    ),
  },
)

interface Birthday { name: string; age: number | null }
interface UpcomingBirthday { name: string; age: number; diffDays: number; month: number; day: number }

interface CelebrationsProps {
  todayBirthdays: Birthday[]
  todayNamedayMembers: string[]
  todayNamedayNames: string[]
  upcomingBirthdays: UpcomingBirthday[]
  /**
   * Az aktív tagok DARABSZÁMA — ettől jelenik meg a „Lista" és a „+N további"
   * gomb. 2026-08-11 (5. kör, P2-#18): korábban a TELJES taglista utazott ide
   * (id, név, születési dátum, nem — tagonként ~130 bájt a Flight-csomagban),
   * pusztán azért, hogy továbbadjuk a modálnak, ami első festéskor zárva van.
   * A lista most a modál első megnyitásakor töltődik szerver-akcióval.
   */
  memberCount?: number
  congregationName?: string
  congregationLogo?: string | null
}

/**
 * 2026-08-10 — görgetésmentes keretek.
 *
 * A csempe fix magasságú sorban ül (`.kt-dash-trio`), ezért NEM görgethető:
 * csak korlátozott számú sor fér el, a többi a „+N további" gombbal nyíló
 * teljes listában (BirthdayListDialog) érhető el.
 */
const TODAY_CAP = 4
const UPCOMING_CAP = 4
const UPCOMING_MAX = 6
const UPCOMING_MIN = 3

export function Celebrations({
  todayBirthdays,
  todayNamedayMembers,
  todayNamedayNames,
  upcomingBirthdays,
  memberCount = 0,
  congregationName = 'Gyülekezet',
  congregationLogo,
}: CelebrationsProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  // 2026-08-11 (P2-#18): a modált csak az ELSŐ megnyitás után rendereljük —
  // így a szűrő/nyomtató felület kódja és adata sem terheli az első festést.
  const [listRequested, setListRequested] = useState(false)
  const hasTodayEvents = todayBirthdays.length > 0 || todayNamedayMembers.length > 0
  const hasList = memberCount > 0

  function openList() {
    setListRequested(true)
    setFilterOpen(true)
  }

  // ── Sor-keret (2026-08-10) ────────────────────────────────────────────────
  // A mai köszöntések kapják az első TODAY_CAP helyet; a fel nem használt
  // helyeket a „Következő 14 nap" blokk kapja meg, hogy a csempe kitöltse a
  // közös sormagasságot — de sose lógjon ki belőle.
  const shownBirthdays = todayBirthdays.slice(0, TODAY_CAP)
  const namedaySlots = Math.max(1, TODAY_CAP - shownBirthdays.length)
  const shownNamedays = todayNamedayMembers.slice(0, namedaySlots)
  const usedToday = shownBirthdays.length + shownNamedays.length
  const hiddenToday =
    (todayBirthdays.length - shownBirthdays.length) +
    (todayNamedayMembers.length - shownNamedays.length)

  const upcomingSlots = Math.min(
    UPCOMING_MAX,
    Math.max(UPCOMING_MIN, UPCOMING_CAP + (TODAY_CAP - usedToday))
  )
  const shownUpcoming = upcomingBirthdays.slice(0, upcomingSlots)
  const hiddenUpcoming = upcomingBirthdays.length - shownUpcoming.length

  return (
    <div className="card-raised flex h-full flex-col overflow-hidden">
      {/* Fejléc — eyebrow + cím + „Lista" akció-chip */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
        <div className="icon-raised size-9 shrink-0 bg-gradient-to-br from-amber-400 to-orange-500">
          <Cake className="size-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
            Születésnapok és névnapok
          </p>
          <h3 className="truncate text-[15px] font-semibold leading-tight text-foreground">
            Ma köszöntjük
          </h3>
        </div>
        {hasList && (
          <button
            type="button"
            onClick={openList}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
            title="Szűrés + nyomtatás"
          >
            <List className="size-3" />
            Lista
          </button>
        )}
      </div>

      {/* Tartalom — NINCS belső görgetés (2026-08-10) */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5">
        {/* Születésnaposok */}
        {shownBirthdays.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">Születésnap</p>
            {shownBirthdays.map((b, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-muted px-2.5 py-2"
              >
                <div className="icon-raised size-7 shrink-0 bg-gradient-to-br from-amber-400 to-amber-500">
                  <Cake className="size-3.5 text-white" />
                </div>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{b.name}</span>
                {b.age !== null && b.age > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-400/20 dark:text-amber-200">
                    {b.age} éves
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Névnaposok */}
        {shownNamedays.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">Névnap</p>
            {shownNamedays.map((name, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-muted px-2.5 py-2"
              >
                <div className="icon-raised size-7 shrink-0 bg-gradient-to-br from-pink-400 to-rose-500">
                  <Flower2 className="size-3.5 text-white" />
                </div>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Levágott mai sorok → a teljes lista a modálban érhető el */}
        {hiddenToday > 0 && hasList && (
          <button type="button" className="kt-more-line" onClick={openList}>
            +{hiddenToday} további köszöntés
          </button>
        )}

        {!hasTodayEvents && (
          <div className="rounded-xl border border-dashed border-border bg-muted/60 px-3 py-3 text-center">
            <p className="text-[13px] text-muted-foreground">
              {todayNamedayNames.length > 0 ? (
                <>
                  Ma <em className="not-italic font-semibold text-foreground">{todayNamedayNames.join(', ')}</em> napja
                  van — nincs érintett tag.
                </>
              ) : (
                'Ma nincs köszöntés.'
              )}
            </p>
          </div>
        )}

        {/* Következő 14 nap — a csempe aljára horgonyozva (mt-auto), így a
            kártya szépen kitölti a közös sormagasságot */}
        {shownUpcoming.length > 0 && (
          <div className="mt-auto space-y-1.5 border-t border-border pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
                  Következő 14 nap
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {upcomingBirthdays.length} fő
              </span>
            </div>
            {shownUpcoming.map((b, i) => (
              <div key={i} className="flex items-center gap-2.5 py-0.5">
                <div className="flex size-9 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-muted">
                  <span className="text-[13px] font-bold leading-none text-foreground">{b.day}</span>
                  <span className="text-[9px] font-medium text-muted-foreground">{HU_MONTHS_SHORT[b.month]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{b.name}</p>
                  <p className="text-[11px] text-muted-foreground">{b.age} éves lesz</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    b.diffDays <= 3
                      ? 'bg-red-100 text-red-800 dark:bg-red-400/20 dark:text-red-200'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {b.diffDays === 1 ? 'holnap' : `${b.diffDays} nap`}
                </span>
              </div>
            ))}
            {hiddenUpcoming > 0 && hasList && (
              <div className="flex justify-center">
                <button type="button" className="kt-more-line" onClick={openList}>
                  +{hiddenUpcoming} további a 14 napban
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* A modál csak az első megnyitás után kerül a fába; a taglistát ő maga
          kéri le (getBirthdayListData) — lásd BirthdayListDialog. */}
      {hasList && listRequested && (
        <BirthdayListDialog
          open={filterOpen}
          onOpenChange={setFilterOpen}
          congregationName={congregationName}
          congregationLogo={congregationLogo}
        />
      )}
    </div>
  )
}
