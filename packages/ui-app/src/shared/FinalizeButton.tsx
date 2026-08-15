'use client'

/**
 * FinalizeButton — az EGYSÉGES véglegesítés-gomb (KÖZÖS komponens).
 *
 * ENDRE DÖNTÉSE (2026-08-15, docs/EGYHAZMEGYEI-SZINT-DONTESEK-2026-08-15.md
 * 4. szakasz): a véglegesítés-gomb MINDEN jelentésnél EGYFORMA legyen, és
 * ugyanúgy elhelyezve (az adott oldal/fül fejléc-sávjának jobb szélén), mind a
 * hat irat-típusnál: számadás, költségvetés, költségvetés-módosítás,
 * vagyonleltári jelentés, választók névjegyzéke, lelkészi jelentés. Ez az
 * egyházmegyei archívum ELŐFELTÉTELE: a megye azt látja, amit a gyülekezet
 * véglegesített.
 *
 * MIÉRT közös komponens: eddig hat felület hatféle gombot mutatott (más szín,
 * más felirat, más hely, három helyen `window.confirm`/`window.prompt`) — a
 * lelkész felületenként másképp találkozott ugyanazzal a fogalommal. A széthúzó
 * másolat ismert hibaosztály; egy komponens = egy megjelenés, egy viselkedés.
 *
 * VISELKEDÉS (mind a hat helyen azonos):
 *   1. Nem véglegesített állapot: lila „Véglegesítés" gomb (a meglévő
 *      számadás-véglegesítés stílusa) → megerősítő dialógus, ami kimondja, MI
 *      zárul le és hogyan lehet később javítani → csak megerősítés után fut a
 *      tényleges akció. (Saját wizardos flow-nál — számadás, lelkészi
 *      jelentés — a `skipConfirm` kihagyja a dialógust: ott maga a wizard
 *      erősít meg.)
 *   2. Véglegesített állapot: zöld pecsét-jelvény + dátum, mellette a
 *      „Feloldás kérése" út — kötelező, legalább 10 karakteres indoklással
 *      (ReasonPromptDialog), a meglévő unlock_requested mintára.
 *   3. Folyamatban lévő kérelemnél sárga „Feloldási kérelem elbírálás alatt…"
 *      jelvény — a gomb nem kattintható újra.
 *
 * A komponens BUTA: minden akciót props-injektált callbackként kap (a web a
 * server actionjeit, a desktop a saját rétegét adja). Toast/refresh a hívó
 * felelőssége — a callback visszatérési értékéből (`{ error }`) csak azt
 * dönti el a komponens, hogy a dialógus bezárható-e.
 */

import { useState } from 'react'
import { BadgeCheck, Loader2, Send, ShieldAlert } from 'lucide-react'

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@kartoteka/ui'

import { ReasonPromptDialog } from '../form/ReasonPromptDialog'

export interface FinalizeActionResult {
  success?: boolean
  error?: string | null
}

export interface FinalizeButtonProps {
  /** Az irat lelkésznek szóló neve, pl. „számadás", „választók névjegyzéke". */
  documentLabel: string
  /** Az érintett év — a feliratokban és a megerősítő kérdésben jelenik meg. */
  year?: number | null
  /** Véglegesítve van-e az irat. */
  finalized: boolean
  /** A véglegesítés időpontja (ISO) — a zöld pecsét-jelvényen látszik, ha ismert. */
  finalizedAt?: string | null
  /** Van-e folyamatban lévő feloldás-kérés. */
  unlockRequested?: boolean
  /** A gomb felirata (alap: „Véglegesítés"; beküldős flow-nál „Véglegesítés és beküldés"). */
  finalizeLabel?: string
  /** A megerősítő dialógus irat-specifikus magyarázata (mi zárul le pontosan). */
  confirmDescription?: string
  /** Extra pontok a „Mi történik a véglegesítés után?" listához. */
  confirmBullets?: string[]
  /**
   * true = NINCS saját megerősítő dialógus: az onFinalize azonnal fut. Ott
   * használjuk, ahol a véglegesítést egy meglévő wizard vezeti végig (számadás,
   * lelkészi jelentés) — a dupla rákérdezés zavaró lenne.
   */
  skipConfirm?: boolean
  disabled?: boolean
  /** A véglegesítés akció (web: server action; wizardos flow-nál a wizard megnyitása). */
  onFinalize: () => void | Promise<void>
  /**
   * Feloldás-kérés indoklással (≥ 10 karakter — a ReasonPromptDialog kényszeríti
   * ki). Ha nincs megadva, a „Feloldás kérése" gomb nem jelenik meg (pl. desktop
   * read-only nézet).
   */
  onRequestUnlock?: (reason: string) => Promise<FinalizeActionResult | void> | void
  /** Az indoklás-mező placeholder szövege (irat-specifikus példa). */
  unlockPlaceholder?: string
  /**
   * 2026-08-15 (egyházmegyei szelet): KI bírálja el a feloldás-kérelmet?
   * Alap: „az egyházmegye" (gyülekezeti irat). Az egyházmegye SAJÁT iratainál
   * „az egyházkerület" — a gomb, a dialógus és a viselkedés BETŰRE ugyanaz
   * marad, csak a címzett neve követi a valóságot (Endre 4. döntése az
   * egyformaságról a MEGJELENÉSRE és a VISELKEDÉSRE vonatkozik, nem arra, hogy
   * a program rossz címzettet mondjon).
   */
  unlockAuthorityLabel?: string
  className?: string
}

/** ISO időbélyeg → rövid magyar dátum a pecsétre (csak a nap pontosság számít). */
function pecsetDatum(iso?: string | null): string | null {
  if (!iso) return null
  const napig = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(napig) ? napig.replace(/-/g, '. ') + '.' : null
}

export function FinalizeButton({
  documentLabel,
  year,
  finalized,
  finalizedAt,
  unlockRequested = false,
  finalizeLabel = 'Véglegesítés',
  confirmDescription,
  confirmBullets,
  skipConfirm = false,
  disabled = false,
  onFinalize,
  onRequestUnlock,
  unlockPlaceholder,
  unlockAuthorityLabel = 'az egyházmegye',
  className,
}: FinalizeButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockSending, setUnlockSending] = useState(false)

  const evvel = year ? `A(z) ${year}. évi ${documentLabel}` : `A ${documentLabel}`

  async function runFinalize() {
    // Dupla-kattintás védelem — amíg az akció fut, nem indul második.
    if (finalizing) return
    setFinalizing(true)
    try {
      await onFinalize()
      setConfirmOpen(false)
    } finally {
      setFinalizing(false)
    }
  }

  async function runUnlockRequest(reason: string) {
    if (!onRequestUnlock || unlockSending) return
    setUnlockSending(true)
    try {
      const result = await onRequestUnlock(reason)
      // Hibánál a dialógus NYITVA marad (a hívó toastolja a hibát) — a lelkész
      // az indoklás elvesztése nélkül próbálhat újra.
      if (result && result.error) return
      setUnlockOpen(false)
    } finally {
      setUnlockSending(false)
    }
  }

  // ── Véglegesített állapot: zöld pecsét + a feloldás útja ──────────────────
  if (finalized) {
    const datum = pecsetDatum(finalizedAt)
    return (
      <div className={`flex flex-wrap items-center justify-end gap-2 ${className ?? ''}`}>
        <Badge className="gap-1 rounded-full border border-emerald-300/70 bg-emerald-100 px-2.5 py-1 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300">
          <BadgeCheck className="size-3.5" />
          Véglegesítve{datum ? ` · ${datum}` : ''}
        </Badge>
        {unlockRequested ? (
          <Badge
            variant="outline"
            className="rounded-full border-amber-300 bg-amber-50 px-2.5 py-1 text-amber-800 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-300"
          >
            Feloldási kérelem elbírálás alatt…
          </Badge>
        ) : onRequestUnlock ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl max-sm:min-h-10 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-400/40 dark:text-amber-300"
              onClick={() => setUnlockOpen(true)}
              disabled={disabled}
            >
              <ShieldAlert className="mr-1 size-3.5" />
              Feloldás kérése
            </Button>
            <ReasonPromptDialog
              open={unlockOpen}
              onOpenChange={next => {
                if (!unlockSending) setUnlockOpen(next)
              }}
              title={`Feloldás kérése — ${year ? `${year}. évi ` : ''}${documentLabel}`}
              description={`A kérelmet ${unlockAuthorityLabel} bírálja el. Írja le röviden, mit kell javítania a már véglegesített iraton — ebből tudják eldönteni, hogy feloldják-e.`}
              reasonLabel="A feloldás indoklása"
              reasonPlaceholder={unlockPlaceholder}
              reasonMinLength={10}
              confirmLabel="Kérelem elküldése"
              loading={unlockSending}
              onConfirm={reason => void runUnlockRequest(reason)}
            />
          </>
        ) : null}
      </div>
    )
  }

  // ── Nem véglegesített állapot: lila véglegesítés-gomb + megerősítés ───────
  return (
    <div className={`flex flex-wrap items-center justify-end gap-2 ${className ?? ''}`}>
      <Button
        size="sm"
        className="rounded-xl max-sm:min-h-10 gap-1.5 bg-violet-600 text-white hover:bg-violet-700"
        onClick={() => (skipConfirm ? void runFinalize() : setConfirmOpen(true))}
        disabled={disabled || finalizing}
      >
        {finalizing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {finalizeLabel}
      </Button>

      {!skipConfirm && (
        <Dialog
          open={confirmOpen}
          onOpenChange={next => {
            if (!finalizing) setConfirmOpen(next)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="pr-8 text-lg text-foreground">
                {evvel} véglegesítése
              </DialogTitle>
            </DialogHeader>

            {confirmDescription ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{confirmDescription}</p>
            ) : null}

            <div className="rounded-xl border border-amber-300/50 bg-amber-50/60 p-3 dark:border-amber-400/30 dark:bg-amber-400/10">
              <p className="text-sm font-semibold text-foreground">
                Mi történik a véglegesítés után?
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>{evvel} lezárul — a tartalma ezután nem módosítható.</li>
                <li>
                  Javítani csak úgy lehet, ha a „Feloldás kérése" gombbal indoklást küld, és az
                  egyházmegye jóváhagyja a feloldást.
                </li>
                {(confirmBullets ?? []).map(pont => (
                  <li key={pont}>{pont}</li>
                ))}
              </ul>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={finalizing}
                className="min-h-11 w-full sm:w-auto"
              >
                Mégse
              </Button>
              <Button
                onClick={() => void runFinalize()}
                disabled={finalizing}
                className="min-h-11 w-full bg-violet-600 text-white hover:bg-violet-700 sm:w-auto"
              >
                {finalizing ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                {finalizeLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
