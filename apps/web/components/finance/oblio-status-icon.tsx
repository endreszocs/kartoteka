'use client'

/**
 * Oblio státusz ikon a tranzakciók listájában.
 *
 * Minden befizetés sor mellett megjelenik egy kis ikon, ami mutatja:
 *   - 🟢 (kör+pipa)  → van Oblio számla, SPV-n is elfogadva (status=ok)
 *   - 🟡 (kör+óra)   → van Oblio számla, SPV-n feldolgozás alatt
 *   - 🔴 (kör+X)     → van Oblio számla, SPV visszautasította
 *   - 🟤 (irat)      → van chitanță (papír nyugta)
 *   - ⚪ (szürke)    → nincs Oblio számla
 *
 * Hover-on magyarázat tooltip. Kattintásra (ha van PDF) megnyitja új fülön.
 *
 * Adatforrás: `findOblioMatchForTransaction()` server action.
 * Lazy-load, a tranzakciók megjelenése után a háttérben kérdezzük.
 */

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  Clock3,
  XCircle,
  FileText,
  CircleDashed,
  ExternalLink,
  Loader2,
  FilePlus,
  Receipt,
} from 'lucide-react'
import {
  findOblioMatchForTransaction,
  type OblioMatchResult,
  type FindOblioMatchParams,
} from '@/app/(dashboard)/penzugy/oblio-lookup-actions'
import { getOblioStatusVisual } from '@/lib/finance/oblio/oblio-status-labels'

type Props = {
  /** A tranzakció típusa és azonosítója. */
  transactionType: 'befizetes' | 'kiadas'
  transactionId?: number
  /** A tranzakció dátuma (YYYY-MM-DD). */
  date: string
  /** A partner / forrás neve. */
  partnerName: string | null
  /** Bruttó összeg (RON) — segít a matchelésnél. */
  amount?: number
  /** Ha false, csak a DB-ben keres (nem hív Oblio API-t). Default: true. */
  allowApiLookup?: boolean
  /** Ha true, csak a kapcsolatot tesztelte a gyülekezet. Lookup nélküli placeholder. */
  disabled?: boolean
  /**
   * Ha jelen van, és nincs Oblio match, akkor egy „+ Számla" gomb jelenik
   * meg az ikon mellett. A parent komponens dolga a tranzakció → szerződés
   * párosítás és a dialog megnyitása.
   */
  onIssueInvoice?: () => void
  /**
   * Ha jelen van, és nincs Oblio match, akkor egy „Nyugta" gomb is megjelenik.
   * Általános: minden befizetésre felajánlható (nem csak bérleti díjra).
   */
  onIssueChitanta?: () => void
  /**
   * Ha jelen van, és a sor egy chitanță-papír (status='not_applicable')
   * típusú DB-ben tárolt nyugta, akkor kattintásra az újranyomtatást
   * hívja meg az átadott chitanță ID-val.
   */
  onReprintChitanta?: (chitantaId: string) => void
}

export function OblioStatusIcon(props: Props) {
  const [result, setResult] = useState<OblioMatchResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (props.disabled) return
    let aborted = false

    const params: FindOblioMatchParams = {
      transactionType: props.transactionType,
      transactionId: props.transactionId,
      date: props.date,
      partnerName: props.partnerName,
      amount: props.amount,
    }

    queueMicrotask(() => {
      if (aborted) return
      setLoading(true)
      findOblioMatchForTransaction(params)
        .then((r) => {
          if (!aborted) setResult(r)
        })
        .finally(() => {
          if (!aborted) setLoading(false)
        })
    })

    return () => {
      aborted = true
    }
  }, [
    props.disabled,
    props.transactionType,
    props.transactionId,
    props.date,
    props.partnerName,
    props.amount,
  ])

  if (props.disabled) {
    return <span className="inline-flex size-5 items-center justify-center" aria-hidden />
  }

  if (loading) {
    return (
      <span
        className="inline-flex size-5 items-center justify-center"
        title="Oblio ellenőrzés folyamatban…"
      >
        <Loader2 className="size-3.5 animate-spin text-slate-300" />
      </span>
    )
  }

  if (!result || !result.found) {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-flex size-5 items-center justify-center text-slate-300"
          title={result?.error || 'Nincs Oblio számla / nyugta ehhez a tranzakcióhoz'}
        >
          <CircleDashed className="size-4" />
        </span>
        {props.onIssueInvoice && (
          <button
            type="button"
            onClick={props.onIssueInvoice}
            className="inline-flex size-5 items-center justify-center rounded-full text-teal-600 hover:bg-teal-100 hover:text-teal-700"
            title="Számlát kiállít az Oblio-ban (e-Factura)"
          >
            <FilePlus className="size-4" />
          </button>
        )}
        {props.onIssueChitanta && (
          <button
            type="button"
            onClick={props.onIssueChitanta}
            className="inline-flex size-5 items-center justify-center rounded-full text-amber-600 hover:bg-amber-100 hover:text-amber-700"
            title="Nyugtát állít ki (papír chitanță, lokális)"
          >
            <Receipt className="size-4" />
          </button>
        )}
      </span>
    )
  }

  const status = result.status || ''
  const visual = status === 'not_applicable'
    ? {
        label: 'Papír nyugta (chitanță)',
        description: 'Papír chitanță típus — nem megy SPV-re.',
      }
    : getOblioStatusVisual(status)

  // Státusz alapján kiválasztjuk az ikont + színt
  let Icon = FileText
  let colorClass = 'text-slate-500'

  if (status === 'ok') {
    Icon = CheckCircle2
    colorClass = 'text-emerald-600'
  } else if (status === 'in_prelucrare') {
    Icon = Clock3
    colorClass = 'text-amber-500'
  } else if (status === 'nok') {
    Icon = XCircle
    colorClass = 'text-red-500'
  } else if (status === 'nepreluat') {
    Icon = Clock3
    colorClass = 'text-slate-400'
  } else if (status === 'not_applicable') {
    Icon = FileText
    colorClass = 'text-amber-700'
  }

  // Chitanță (papír nyugta) — ha van reprint callback és van DB-rekord ID,
  // a kattintás újranyomtatás-dialogot indít
  const isChitanta = status === 'not_applicable'
  const reprintHandler =
    isChitanta && props.onReprintChitanta && result.oblioSzamlaId
      ? () => props.onReprintChitanta!(result.oblioSzamlaId!)
      : null

  const titleParts = [
    visual.label,
    result.oblioInvoiceSeries && result.oblioInvoiceNumber
      ? `${result.oblioInvoiceSeries} ${result.oblioInvoiceNumber}`
      : null,
    result.invoiceDate,
    visual.description,
    result.pdfUrl
      ? '(kattintás → PDF)'
      : reprintHandler
        ? '(kattintás → újranyomtatás)'
        : null,
  ]
  const title = titleParts.filter(Boolean).join(' — ')

  if (result.pdfUrl) {
    return (
      <a
        href={result.pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex size-5 items-center justify-center rounded-full hover:bg-slate-100 ${colorClass}`}
        title={title}
      >
        <Icon className="size-4" />
        <ExternalLink className="sr-only" />
      </a>
    )
  }

  if (reprintHandler) {
    return (
      <button
        type="button"
        onClick={reprintHandler}
        className={`inline-flex size-5 items-center justify-center rounded-full hover:bg-slate-100 ${colorClass}`}
        title={title}
      >
        <Icon className="size-4" />
      </button>
    )
  }

  return (
    <span
      className={`inline-flex size-5 items-center justify-center ${colorClass}`}
      title={title}
    >
      <Icon className="size-4" />
    </span>
  )
}
