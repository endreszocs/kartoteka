'use client'

/**
 * Kézbesítési státusz-jelvények (értesítés + e-mail) — a korábbi kézi
 * DeliveryBadge/EmailDeliveryBadge helyett a közös StatusBadge-re építve.
 * A changelog-kártyák ÉS az archívum is innen kapja, így egy a nyelv.
 */

import { Check, Clock, Hand, KeyRound, Mail, MailWarning, MessageSquare, Star } from 'lucide-react'

import { StatusBadge } from '@/components/admin/_shared/status-badge'
import type { ChangelogJeloles } from '@/lib/broadcasts/types'
import { formatDateTime } from './format'

/**
 * ⚠️ 2026-08-12 — A JELVÉNY RÖVID, A MAGYARÁZAT ALATTA ÁLL.
 *
 * A `StatusBadge` alap-osztálya `whitespace-nowrap shrink-0`: a pirula SEM
 * törni, SEM zsugorodni nem tud. 320 px-en a jelvény-sorra ~228 px marad
 * (320 − 2×16 oldalkeret − 2×16 kártya − 16 jelölőnégyzet − 12 rés), egy
 * 60 karakteres, 12 px félkövér szöveg viszont ~400 px-et kérne. A dashboard
 * `<main>`-je `overflow-y-auto`, ezért az overflow-x `auto`-ra számítódik: a
 * tartalom vízszintesen görgethetővé válna, a szöveg vége levágódna — ez WCAG
 * 1.4.10 (Reflow, AA) bukás, és 375 px-en (~283 px) is fennáll.
 * SZABÁLY: a pirulában csak az ÁLLAPOT NEVE van; a ki/mikor/miért a jelvény
 * alatti sorba megy (`JelolesReszletek`, `GeneraltKulcsMagyarazat`).
 */

/**
 * Csengő-értesítés státusza.
 *
 * ⚠️ HÁROM ÁLLAPOT, HÁROM KÜLÖNBÖZŐ IKONALAK ÉS SZÖVEG.
 * A „kézzel kiküldöttnek jelölve" SOSEM kaphatja ugyanazt a zöld pipát, mint a
 * valódi kiküldés — különben a felület megint valótlant állítana, csak most az
 * ellenkező irányba. WCAG 1.4.1: az állapotot ikon + alak + kiírt szöveg
 * hordozza, nem a szín.
 */
export function NotificationStatusBadge({
  sent,
  jeloles,
}: {
  sent: boolean
  jeloles?: ChangelogJeloles | null
}) {
  if (sent) {
    return (
      <StatusBadge intent="success" icon={Check}>
        Értesítés elküldve
      </StatusBadge>
    )
  }
  if (jeloles?.kikuldottnekJelolveAt) {
    // A jelölő neve és időpontja a JelolesReszletek sorba megy — lásd fent.
    return (
      <StatusBadge intent="info" icon={Hand}>
        Kézzel jelölve
      </StatusBadge>
    )
  }
  return (
    <StatusBadge intent="neutral" icon={MessageSquare}>
      Még nincs kiküldve
    </StatusBadge>
  )
}

/** Csillag-jelvény: kiemelt bejegyzés. Ikon + kiírt szó, nem csak szín. */
export function KiemeltBadge() {
  return (
    <StatusBadge intent="warning" icon={Star}>
      Kiemelt
    </StatusBadge>
  )
}

/**
 * „A bejegyzésnek nincs saját azonosítója" jelvény.
 *
 * NÉMA CSAPDA VOLT: ha nincs `<!-- key: -->`, a kulcs a CÍMBŐL generálódik —
 * egy elgépelés-javítás a címben némán új kulcsot csinál, a korábbi kiküldés
 * „elveszik", és a bejegyzés újra kiküldetlennek látszik. Ezért kiírjuk.
 * A MIÉRT a `GeneraltKulcsMagyarazat` sorba megy, nem a pirulába.
 */
export function GeneraltKulcsBadge() {
  return (
    <StatusBadge intent="warning" icon={KeyRound}>
      Nincs saját azonosítója
    </StatusBadge>
  )
}

/** A generált kulcs magyarázata — TÖRHETŐ, teljes szélességű sor. */
export function GeneraltKulcsMagyarazat() {
  return (
    <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
      Ennek a bejegyzésnek nincs saját azonosítója, ezért a rendszer a CÍMBŐL
      képezte. Ha a címet átírod a fejlesztési naplóban, a korábbi kiküldéssel
      való párosítás elszakad, és a bejegyzés újra kiküldetlennek fog látszani.
    </p>
  )
}

/**
 * A kézi jelölés részletei (ki · mikor · kiemelte · megjegyzés).
 *
 * Külön sorban, TÖRHETŐ szöveggel — a jelvények nem tudnak tördelni, ezért
 * minden hosszú adat ide kerül.
 */
export function JelolesReszletek({ jeloles }: { jeloles: ChangelogJeloles }) {
  const sorok: string[] = []
  if (jeloles.kikuldottnekJelolveAt) {
    const ki = jeloles.kikuldottnekJelolteNev
    sorok.push(
      `Kézzel kiküldöttnek jelölve${ki ? ` — ${ki}` : ''} · ${formatDateTime(jeloles.kikuldottnekJelolveAt)}`,
    )
  }
  if (jeloles.kiemelt && jeloles.kiemelteNev) {
    sorok.push(`Kiemelte: ${jeloles.kiemelteNev}`)
  }
  if (jeloles.kikuldottnekJelolveAt && jeloles.megjegyzes) {
    sorok.push(`Megjegyzés a jelöléshez: ${jeloles.megjegyzes}`)
  }
  if (sorok.length === 0) return null

  return (
    <div className="mt-2 space-y-1">
      {sorok.map((s) => (
        <p key={s} className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {s}
        </p>
      ))}
    </div>
  )
}

/**
 * E-mail kézbesítés státusza.
 * - requested=false → nem volt kérve e-mail
 * - error → hiba
 * - sentAt → sikeres kiküldés (időponttal)
 * - egyébként → függőben
 */
export function EmailStatusBadge({
  requested,
  sentAt,
  error,
  notSentLabel = 'E-mail nem volt kérve',
}: {
  requested: boolean
  sentAt: string | null
  error: string | null
  notSentLabel?: string
}) {
  if (!requested) {
    return (
      <StatusBadge intent="neutral" icon={Mail}>
        {notSentLabel}
      </StatusBadge>
    )
  }
  if (error) {
    return (
      <StatusBadge intent="danger" icon={MailWarning}>
        E-mail hiba
      </StatusBadge>
    )
  }
  if (sentAt) {
    return (
      <StatusBadge intent="success" icon={Mail}>
        E-mail elküldve · {formatDateTime(sentAt)}
      </StatusBadge>
    )
  }
  return (
    <StatusBadge intent="warning" icon={Clock}>
      E-mail függőben
    </StatusBadge>
  )
}
