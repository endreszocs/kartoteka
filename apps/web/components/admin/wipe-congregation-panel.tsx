'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AdminConfirmDialog } from './admin-confirm-dialog'

import { wipeCongregationDataAction, type WipeResult } from '@/app/(dashboard)/admin/wipe-actions'

interface WipeCongregationPanelProps {
  /**
   * A megjelenített / wipe-olt gyülekezetek listája (a szerver-oldali RPC
   * a saját scope-ját újra ellenőrzi).
   */
  congregations: Array<{ id: string; nev: string }>
  /** Sikeres törlés után hívódik (pl. az előzmény-lista frissítésére). */
  onWiped?: () => void
}

/**
 * Admin panel: gyülekezeti adatok törlése ("tiszta lap").
 *
 * Háromszintű megerősítés (2026-07-11: a natív window.confirm helyett
 * AdminConfirmDialog — a natív confirm mobilon/Safariban megbízhatatlan):
 *   1) A user kiválasztja a gyülekezetet
 *   2) Beírja a gyülekezet pontos nevét — enélkül a gomb nem aktív
 *   3) AdminConfirmDialog (danger tónus) a végső "biztosan" kérdésre
 *   4) Backend RPC újra ellenőrzi a nevet és a jogosultságot
 *
 * Megtartott adatok (NEM törlődnek):
 *   - A gyülekezet alapadatai (`congregations` sor)
 *   - A felhasználók profiljai és hozzárendeléseik
 *   - Előfizetési + éves tagdíj adatok
 *
 * Törölt adatok (minden egyéb, congregation_id-ra szűrve):
 *   - Tagok (`szemely`) + családok + gyerekek
 *   - Pénzügyi tranzakciók (befizetés, kiadás, chitanța, belső mozgás)
 *   - Munkanapló + anyakönyv + leltár + jegyzőkönyvek
 *   - Bankszámlák, pénzügyi célok (befizetés/kiadás célok), Oblio-fiókok
 *   - Iratszám-pointerek, stb.
 */
export function WipeCongregationPanel({ congregations, onWiped }: WipeCongregationPanelProps) {
  const [selectedId, setSelectedId] = useState<string>('')
  const [typedName, setTypedName] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Az eredmény mellé eltesszük a törölt gyülekezet nevét (és a megadott
  // indoklást) is, hogy a visszajelzés a form-reset után is megnevezze,
  // MI és MIÉRT törlődött (audit-barát).
  const [lastWipe, setLastWipe] = useState<
    { name: string; reason?: string; result: WipeResult } | null
  >(null)

  const selected = congregations.find((c) => c.id === selectedId)
  const expectedName = selected?.nev ?? ''
  const typedMatch = typedName.trim() === expectedName && expectedName.length > 0
  const canSubmit = !!selected && typedMatch && !busy

  // A wipe-RPC a foreign_key_violation-t elnyeli, és az érintett táblát
  // „<tábla> (FK hiba)" néven, 0 sorral adja vissza. Ha van ilyen tábla, a
  // törlés csak RÉSZLEGESEN sikerült — a siker-panel sárga (figyelmeztető),
  // nem zöld. Csak minden-tábla-siker esetén marad a zöld visszajelzés.
  const resultTables = lastWipe?.result.deletedTables ?? []
  const failedTables = resultTables.filter((t) => t.table.includes('(FK hiba)'))
  const okTables = resultTables.filter((t) => !t.table.includes('(FK hiba)') && t.rows > 0)
  const isPartial = !!lastWipe?.result.success && failedTables.length > 0

  async function doWipe(reason?: string) {
    if (!selected || !typedMatch) return

    setBusy(true)
    setLastWipe(null)
    const wipedName = selected.nev
    const wipedReason = reason?.trim() || undefined
    try {
      // Megj.: az indoklást egyelőre CSAK a UI rögzíti (a visszajelző panelen
      // jelenítjük meg). Az action-be vezetése + data_wipe_log-ba írása külön kör.
      const res = await wipeCongregationDataAction(selected.id, typedName.trim())
      setLastWipe({ name: wipedName, reason: wipedReason, result: res })
      if (res.success) {
        setTypedName('')
        setSelectedId('')
        onWiped?.()
      }
    } catch (err) {
      setLastWipe({
        name: wipedName,
        reason: wipedReason,
        result: {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
      {/* Fejléc */}
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg text-foreground">
            Gyülekezeti adatok törlése (tiszta lap)
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Élesre váltás előtt egy gyülekezet <strong>minden beviteli adatát</strong>
            {' '}egy lépésben törölheted. A gyülekezet alapadatai és a felhasználók
            profiljai megmaradnak — csak a tagok, családok, pénzügyi tételek,
            munkanapló, anyakönyv, leltár és jegyzőkönyvek tűnnek el.
          </p>
        </div>
      </div>

      {/* Mi marad / mi törlődik */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 text-xs text-foreground sm:grid-cols-2">
        <div>
          <p className="mb-2 font-semibold">
            Ami <span className="underline">megmarad</span>:
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
            <li>A gyülekezet alapadatai (név, cím, egyházmegye-hovatartozás)</li>
            <li>A felhasználók profiljai és hozzárendeléseik</li>
            <li>Előfizetési és tagdíj-konfigurációk</li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold">
            Ami <span className="underline">törlődik</span>:
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
            <li>Minden tag (<code>szemely</code>), család, családi kapcsolat</li>
            <li>Minden pénzügyi tranzakció (befizetés, kiadás, chitanța, belső mozgás)</li>
            <li>Pénzügyi célok és kategóriák (befizetés-cél, kiadás-cél, számadási cél)</li>
            <li>Bankszámlák + nyitóegyenlegek, Oblio-fiókok</li>
            <li>Munkanapló-bejegyzések</li>
            <li>Anyakönyv (keresztelés, házasság, temetés) és sírhelyek</li>
            <li>Leltár, jegyzőkönyvek, éves jelentések, gyülekezeti programok</li>
            <li>Bérleti szerződések, iratszám-pointerek</li>
          </ul>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-3 rounded-xl border border-destructive/25 bg-card p-4">
        <div className="space-y-1">
          <Label htmlFor="wipe-congregation">Válaszd ki a gyülekezetet</Label>
          <select
            id="wipe-congregation"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.currentTarget.value)
              setTypedName('')
              setLastWipe(null)
            }}
            disabled={busy}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">— válassz —</option>
            {congregations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nev}
              </option>
            ))}
          </select>
          {congregations.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Nincs gyülekezet hozzád rendelve, vagy nincs jogosultságod.
            </p>
          )}
        </div>

        {selected && (
          <div className="space-y-1">
            <Label htmlFor="wipe-confirm-name">
              Megerősítéshez írd be a gyülekezet pontos nevét:
            </Label>
            <Input
              id="wipe-confirm-name"
              value={typedName}
              onChange={(e) => setTypedName(e.currentTarget.value)}
              placeholder="A gyülekezet pontos neve…"
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[11px] italic text-muted-foreground">
              Elvárt: <span className="font-mono">{expectedName}</span>
            </p>
            {typedName && !typedMatch && (
              <p className="text-[11px] text-destructive">
                A begépelt név nem egyezik pontosan (betűre, ékezetre).
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="w-full gap-2 sm:w-auto"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {busy ? 'Törlés folyamatban…' : 'Végleges törlés'}
          </Button>
        </div>
      </div>

      {/* Végső megerősítés — dialógus a natív window.confirm helyett */}
      <AdminConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open)
        }}
        title="Biztosan törlöd a gyülekezet adatait?"
        tone="danger"
        description={
          <>
            A(z) <strong>{selected?.nev}</strong> gyülekezet minden beviteli adata{' '}
            <strong>véglegesen törlődik</strong> — tagok, családok, pénzügyi tételek,
            munkanapló, anyakönyv, leltár, jegyzőkönyvek.
            <br />
            <br />
            Megmaradnak: a gyülekezet alapadatai és a felhasználói profilok. A művelet{' '}
            <strong>nem visszavonható</strong>.
          </>
        }
        confirmLabel="Igen, végleges törlés"
        cancelLabel="Mégse"
        loading={busy}
        reasonLabel="Indoklás (a törlés oka)"
        reasonPlaceholder="Miért törlöd a gyülekezet minden beviteli adatát? (pl. teszt-fázis lezárása élesítés előtt)"
        reasonRequired
        reasonMinLength={8}
        onConfirm={(reason) => void doWipe(reason)}
      />

      {/* Eredmény — TELJES siker (minden tábla törölve) */}
      {lastWipe && lastWipe.result.success && !isPartial && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="size-5 shrink-0" />
            <p className="text-sm font-semibold">Sikeres törlés</p>
          </div>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            A(z) <strong>{lastWipe.name}</strong> gyülekezet adatai törölve — összesen{' '}
            <strong>{lastWipe.result.rowsTotal?.toLocaleString('hu-HU')}</strong> sor
            {`, ${okTables.length} táblából`}.
          </p>
          {lastWipe.reason && (
            <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-300/90">
              Megadott indoklás: <span className="italic">{lastWipe.reason}</span>
            </p>
          )}
          {okTables.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-emerald-800 hover:underline dark:text-emerald-300">
                Részletek (táblák szerint)
              </summary>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-xs text-emerald-900 dark:text-emerald-200 sm:grid-cols-2 md:grid-cols-3">
                {[...okTables]
                  .sort((a, b) => b.rows - a.rows)
                  .map((t) => (
                    <li key={t.table} className="break-all">
                      <span className="font-mono">{t.table}</span>:{' '}
                      <strong>{t.rows.toLocaleString('hu-HU')}</strong>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Eredmény — RÉSZLEGES siker (a törlés lefutott, de FK-hiba miatt maradt tábla) */}
      {lastWipe && lastWipe.result.success && isPartial && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="size-5 shrink-0" />
            <p className="text-sm font-semibold">Részlegesen sikerült</p>
          </div>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/90">
            A(z) <strong>{lastWipe.name}</strong> gyülekezet adatainak nagy része törölve
            (<strong>{lastWipe.result.rowsTotal?.toLocaleString('hu-HU')}</strong> sor,{' '}
            {okTables.length} táblából), de{' '}
            <strong>{failedTables.length}</strong> tábla nem törlődött hivatkozási
            (foreign key) korlátozás miatt. Ezeket manuálisan, a hivatkozó adatok
            eltávolítása után lehet törölni.
          </p>
          {lastWipe.reason && (
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
              Megadott indoklás: <span className="italic">{lastWipe.reason}</span>
            </p>
          )}
          <div className="mt-2 rounded-lg border border-amber-300/70 bg-amber-100/50 p-2.5 dark:border-amber-800/50 dark:bg-amber-900/20">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Nem törölt táblák:
            </p>
            <ul className="mt-1 grid grid-cols-1 gap-0.5 text-xs text-amber-900 dark:text-amber-200/90 sm:grid-cols-2">
              {failedTables.map((t) => (
                <li key={t.table} className="break-all">
                  <span className="font-mono">{t.table.replace(' (FK hiba)', '')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Eredmény — HIBA (a törlés egyáltalán nem futott le) */}
      {lastWipe && !lastWipe.result.success && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0" />
            <p className="font-semibold">Nem sikerült a törlés</p>
          </div>
          <p className="mt-1">{lastWipe.result.error}</p>
        </div>
      )}
    </div>
  )
}
