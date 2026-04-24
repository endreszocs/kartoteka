'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Trash2 } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { wipeCongregationDataAction, type WipeResult } from '@/app/(dashboard)/admin/wipe-actions'

interface WipeCongregationPanelProps {
  /**
   * A megjelenített / wipe-olt gyülekezetek listája. Ha a user master, ő
   * mindent lát; ha admin/egyházkerületi admin, csak a sajátjait.
   */
  congregations: Array<{ id: string; nev: string }>
}

/**
 * Admin panel: gyülekezeti adatok törlése ("tiszta lap").
 *
 * Kétszintű megerősítés:
 *   1) A user kiválasztja a gyülekezetet (csak a sajátjai jelennek meg)
 *   2) Beírja a gyülekezet nevét — enélkül a gomb nem aktív
 *   3) Browser confirm() a végső "biztosan" kérdésre
 *   4) Backend RPC újra ellenőrzi a nevet
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
export function WipeCongregationPanel({ congregations }: WipeCongregationPanelProps) {
  const [selectedId, setSelectedId] = useState<string>('')
  const [typedName, setTypedName] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<WipeResult | null>(null)

  const selected = congregations.find((c) => c.id === selectedId)
  const expectedName = selected?.nev ?? ''
  const typedMatch = typedName.trim() === expectedName && expectedName.length > 0
  const canSubmit = !!selected && typedMatch && !busy

  async function handleWipe() {
    if (!selected || !typedMatch) return

    // Végső browser-confirm
    const msg =
      `BIZTOS, hogy törlöd a(z) "${selected.nev}" gyülekezet minden adatát?\n\n` +
      `Ez a művelet VISSZAVONHATATLAN!\n\n` +
      `Megtartódik: a gyülekezet alapadatai, a felhasználók profiljai.\n` +
      `Törlődik: minden tag, család, pénzügyi tétel, munkanapló, anyakönyv, stb.`
    if (typeof window !== 'undefined' && !window.confirm(msg)) return

    setBusy(true)
    setResult(null)
    try {
      const res = await wipeCongregationDataAction(selected.id, typedName.trim())
      setResult(res)
      if (res.success) {
        setTypedName('')
        setSelectedId('')
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-rose-300 bg-rose-50/30 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
            <AlertTriangle className="size-5" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg text-rose-900">
              Gyülekezeti adatok törlése (tiszta lap)
            </CardTitle>
            <CardDescription className="text-sm text-rose-800">
              Élesre váltás előtt egy gyülekezet <strong>minden beviteli adatát</strong>
              {' '}egy lépésben törölheted. A gyülekezet alapadatai és a felhasználók
              profiljai megmaradnak — csak a tagok, családok, pénzügyi tételek,
              munkanapló, anyakönyv, leltár és jegyzőkönyvek tűnnek el.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-md border border-rose-200 bg-white p-4 text-xs text-rose-900">
          <p className="mb-2 font-semibold">Ami <span className="underline">megmarad</span>:</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>A gyülekezet alapadatai (név, cím, egyházmegye-hovatartozás)</li>
            <li>A felhasználók profiljai és hozzárendeléseik</li>
            <li>Előfizetési és tagdíj-konfigurációk</li>
          </ul>
          <p className="mb-2 mt-3 font-semibold">Ami <span className="underline">törlődik</span>:</p>
          <ul className="list-inside list-disc space-y-0.5">
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

        {/* Form */}
        <div className="space-y-3 rounded-md border border-rose-200 bg-white p-4">
          <div className="space-y-1">
            <Label htmlFor="wipe-congregation">Válaszd ki a gyülekezetet</Label>
            <select
              id="wipe-congregation"
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.currentTarget.value)
                setTypedName('')
                setResult(null)
              }}
              disabled={busy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                placeholder={expectedName}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] italic text-muted-foreground">
                Elvárt: <span className="font-mono">{expectedName}</span>
              </p>
              {typedName && !typedMatch && (
                <p className="text-[11px] text-rose-700">
                  A begépelt név nem egyezik pontosan (betűre, ékezetre).
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleWipe}
              disabled={!canSubmit}
              className="bg-rose-700 text-white shadow hover:bg-rose-800 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              {busy ? 'Törlés folyamatban…' : 'Végleges törlés'}
            </Button>
          </div>
        </div>

        {/* Eredmény */}
        {result && result.success && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-900">
              <CheckCircle2 className="size-5 shrink-0" />
              <p className="text-sm font-semibold">Sikeres törlés</p>
            </div>
            <p className="mt-1 text-sm text-emerald-800">
              Összesen <strong>{result.rowsTotal?.toLocaleString('hu-HU')}</strong> sor
              törölve{' '}
              {result.deletedTables
                ? `${result.deletedTables.filter((t) => t.rows > 0).length} táblából`
                : ''}
              .
            </p>
            {result.deletedTables && result.deletedTables.filter((t) => t.rows > 0).length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-emerald-800 hover:underline">
                  Részletek (táblák szerint)
                </summary>
                <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-emerald-900 sm:grid-cols-3">
                  {result.deletedTables
                    .filter((t) => t.rows > 0)
                    .sort((a, b) => b.rows - a.rows)
                    .map((t) => (
                      <li key={t.table}>
                        <span className="font-mono">{t.table}</span>:{' '}
                        <strong>{t.rows}</strong>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {result && !result.success && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" />
              <p className="font-semibold">Nem sikerült a törlés</p>
            </div>
            <p className="mt-1">{result.error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
