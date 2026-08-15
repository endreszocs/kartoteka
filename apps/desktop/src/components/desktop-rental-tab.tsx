/**
 * DesktopRentalTab — a közös `RentalTab` desktop-bekötése
 * (2026-08-15, desktop-paritás 1. szelet — „gyors nyereségek" #4).
 *
 * A `desktop-bank-tab.tsx` online törzsadat-mintája: a bérleti szerződések
 * törzse NEM része a lokális (SQLCipher) tükörnek, ezért a lista direkt
 * Supabase-lekérdezéssel érkezik — a webes `getRentalContracts(false)` akcióval
 * bit-azonos szűréssel (congregation_id + deleted=false + aktiv=true).
 *
 * MIÉRT online-only: az offline íráshoz ütközés-kezelés kellene (a paritás-terv
 * 4.4. kockázata) — az első lépés a fail-closed út: offline vagy session nélkül
 * a fül HANGOSAN jelzi, hogy online belépés kell, nem mutat üres listát.
 *
 * Írások:
 *   - Törlés (soft delete): a webes `deleteRentalContract` tükre. Desktopon
 *     nincs middleware és nincs server action, ezért a webes KÉZI hatókör-
 *     szűkítést (congregation_id-egyezés) itt is kikényszerítjük (4.8.
 *     kockázat), és az írás a `getVerifiedSession` őrön át fut (4.3. kockázat).
 *   - Új szerződés / szerkesztés + e-Factura számlázás: a webre delegálva —
 *     a szerződés-ÍRÁS a terv szerint nem az 1. szelet része. A
 *     `contractDialogSlot` útjelző dialógust ad (hangos, nem néma gomb), az
 *     `invoiceDialogSlot` szándékosan nincs átadva, így számla-gomb nem is
 *     jelenik meg (a RentalTab e nélkül nem rendereli).
 *   - Excel-tükör szándékosan NINCS (4.9. kockázat): a szerződés törzs-adat,
 *     nem pénzmozgás — a hivatalos könyvelés-Excelbe csak a befizetések mennek.
 */

import { useCallback, useEffect, useState } from 'react'
import { Building2, CloudOff, RefreshCw } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@kartoteka/ui'
import { RentalTab, type RentalContractRow, type RentalToastKind } from '@kartoteka/ui-app'

import { errorMessage } from '../lib/error'
import { getDesktopSupabase } from '../lib/supabase'
import { isOnlineWithSession } from '../lib/use-session-online'
import { getVerifiedSession } from '../lib/verified-session'

interface DesktopRentalTabProps {
  congregationId: string
  onToast: (msg: string, kind: RentalToastKind) => void
}

export function DesktopRentalTab({ congregationId, onToast }: DesktopRentalTabProps) {
  // null = még nem töltött (első betöltés folyamatban)
  const [contracts, setContracts] = useState<RentalContractRow[] | null>(null)
  const [offline, setOffline] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // ⚠️ Effect-szabály: az első setState csak az első await UTÁN futhat —
    // ezért az online-ellenőrzés áll elöl (az mindig await-tel jár).
    const online = await isOnlineWithSession()
    // Fail-closed hatókör-őr (memória-hibaosztály: „skalár hatókör +
    // `if (id) filter` = néma teljes szivárgás"): üres congregation_id-vel
    // SOHA nem indítunk lekérdezést — hangos hiba, nem szűretlen lista.
    if (!congregationId) {
      setOffline(false)
      setLoadError('Hiányzó gyülekezet-azonosító — a bérleti szerződések nem tölthetők be.')
      return
    }
    if (!online) {
      setLoadError(null)
      setOffline(true)
      return
    }
    setOffline(false)
    try {
      const { data, error } = await getDesktopSupabase()
        .from('berleti_szerzodes')
        .select('*')
        .eq('congregation_id', congregationId)
        .eq('deleted', false)
        .eq('aktiv', true)
        .order('created_at', { ascending: false })
      if (error) {
        setLoadError(`Bérleti szerződések lekérése sikertelen: ${error.message}`)
        return
      }
      setLoadError(null)
      setContracts((data || []) as RentalContractRow[])
    } catch (err) {
      setLoadError(`Bérleti szerződések lekérése sikertelen: ${errorMessage(err)}`)
    }
  }, [congregationId])

  useEffect(() => {
    void load()
  }, [load])

  // A webes `deleteRentalContract` tükre: soft delete (aktiv=false, deleted=true)
  // — a rekord a DB-ben marad a historikus befizetés-párosításokhoz.
  const handleDelete = useCallback(
    async (id: string): Promise<{ success?: boolean; error?: string | null }> => {
      if (!id) return { error: 'Hiányzó azonosító.' }
      if (!congregationId) {
        return { error: 'Hiányzó gyülekezet-azonosító — a törlés nem futtatható.' }
      }
      // 4.3. kockázat: MINDEN felhő-írás a verified-session őrön át
      // (session + lejárat + fiók-egyezőség) — hibánál érthető magyar üzenet.
      const verified = await getVerifiedSession()
      if (!verified.ok) return { error: verified.message }
      try {
        const { error } = await getDesktopSupabase()
          .from('berleti_szerzodes')
          .update({ aktiv: false, deleted: true })
          .eq('id', id)
          // 4.8. kockázat: a webes kézi hatókör-szűkítés tükre — az RLS-en
          // FELÜL is csak a saját gyülekezet szerződését engedjük törölni.
          .eq('congregation_id', congregationId)
        if (error) return { error: `Törlés sikertelen: ${error.message}` }
        return { success: true }
      } catch (err) {
        return { error: `Törlés sikertelen: ${errorMessage(err)}` }
      }
    },
    [congregationId],
  )

  if (loadError) {
    return (
      <div className="card-raised p-8 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-amber-200" />
        <p className="text-sm font-medium text-destructive">{loadError}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void load()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Újrapróbálás
        </Button>
      </div>
    )
  }

  if (offline) {
    return (
      <div className="card-raised p-8 text-center">
        <CloudOff className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">
          A Bérleti szerződések fülhöz internetkapcsolat és online belépés szükséges.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          A szerződés-törzsnek nincs helyi másolata ezen a gépen — a lista a kapcsolat
          helyreállása és online bejelentkezés után tölthető be.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => void load()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Újrapróbálás
        </Button>
      </div>
    )
  }

  if (contracts === null) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        Bérleti szerződések betöltése…
      </div>
    )
  }

  return (
    <RentalTab
      contracts={contracts}
      onChanged={load}
      onDeleteContract={handleDelete}
      onToast={onToast}
      // Szerződés-írás (új / szerkesztés): a webre delegálva — útjelző dialógus,
      // a desktop-bank-tab `bcrImportWizardDialogSlot` mintájára (hangos, nem
      // néma gomb). Az 1. szelet szándékosan nem hozza át a szerződés-dialógust.
      contractDialogSlot={({ open, onOpenChange, editingContract }) => (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="size-5 text-amber-600" />
                {editingContract ? 'Szerződés szerkesztése' : 'Új bérleti szerződés'}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm leading-relaxed text-slate-600">
              A bérleti szerződés {editingContract ? 'szerkesztése' : 'rögzítése'} és az
              e-Factura számlázás egyelőre a webes felületen érhető el: nyisd meg a
              Kartotékát a böngészőben (<strong>kartoteka.app</strong> → Pénzügy →
              Bérleti szerződések). A lista és a törlés itt, az asztali alkalmazásban
              is működik.
            </p>
            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Bezárás
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    />
  )
}
