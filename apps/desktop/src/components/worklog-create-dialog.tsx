/**
 * WorklogCreateDialog — új munkanapló-bejegyzés form.
 *
 * A web `apps/web/components/modals/worklog-dialog.tsx` (180 sor) portja
 * desktopra. Eltérések:
 *   - `saveWorklog` (Server Action) helyett `createWorklogEntry` (direkt
 *     Supabase + outbox fallback)
 *   - `toast` (sonner) helyett belső error/success state + üzenet
 *   - `@kartoteka/ui` komponenseket használ (Dialog, Button, Input, Label,
 *     Textarea)
 *
 * Kategória (szolgalat / katekezis / latogatas) alapján dinamikus mezők.
 */

import { useEffect, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kartoteka/ui'

import {
  createWorklogEntry,
  updateWorklogEntry,
  type WorklogInput,
  type WorklogLocalRow,
} from '../lib/sync'

// A web `lib/constants/worklog.ts` másolata — forrás: apps/web/lib/constants/worklog.ts
const WORKLOG_TYPES: Record<'szolgalat' | 'katekezis' | 'latogatas', string[]> = {
  szolgalat: [
    'Istentisztelet',
    'Igehirdetés',
    'Úrvacsora',
    'Bibliaóra',
    'Imaóra',
    'Esti áhítat',
    'Alkalmi istentisztelet',
    'Egyéb szolgálat',
  ],
  katekezis: [
    'Bibliaóra',
    'Hittan',
    'Konfirmáció előkészítő',
    'Ifjúsági óra',
    'Gyermek foglalkozás',
    'Egyéb katekézis',
  ],
  latogatas: ['Családlátogatás', 'Kórházlátogatás', 'Idősek otthona', 'Börtönlátogatás', 'Egyéb látogatás'],
}

type WorklogCategory = keyof typeof WORKLOG_TYPES

export interface WorklogCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  /**
   * Ha `null` vagy undefined → új bejegyzés létrehozása.
   * Ha `WorklogLocalRow` → szerkesztés (revision-check konfliktus-kezeléssel).
   */
  editEntry?: WorklogLocalRow | null
  /** Hívó jelez sikert — a MunkanaploPage ebben frissíti a listát. */
  onSuccess: (result: {
    id: number | null
    queuedToOutbox: boolean
    conflict?: boolean
    isEdit?: boolean
  }) => void
}

export function WorklogCreateDialog({
  open,
  onOpenChange,
  userId,
  editEntry,
  onSuccess,
}: WorklogCreateDialogProps) {
  const isEdit = Boolean(editEntry)
  const [category, setCategory] = useState<WorklogCategory>('szolgalat')
  const [idopont, setIdopont] = useState('')
  const [jellege, setJellege] = useState('')
  const [cim, setCim] = useState('')
  const [bibliaolvasas, setBibliaolvasas] = useState('')
  const [alapige, setAlapige] = useState('')
  const [enekek, setEnekek] = useState('')
  const [szolgalt, setSzolgalt] = useState('')
  const [ferfi, setFerfi] = useState<number>(0)
  const [no, setNo] = useState<number>(0)
  const [gyermek, setGyermek] = useState<number>(0)
  const [persely, setPersely] = useState<number>(0)
  const [du, setDu] = useState(false)
  const [megjegyzes, setMegjegyzes] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dialog megnyitásakor a mezőket alapértelmezettre (create) vagy a szerkesztett
  // bejegyzés adataira (edit) állítjuk
  useEffect(() => {
    if (!open) return
    if (editEntry) {
      // Edit mód — pre-fill
      const cat = (editEntry.kategoria ?? 'szolgalat') as WorklogCategory
      setCategory(WORKLOG_TYPES[cat] ? cat : 'szolgalat')
      setIdopont(editEntry.idopont ?? new Date().toISOString().slice(0, 10))
      setJellege(editEntry.jellege ?? '')
      setCim(editEntry.cim ?? '')
      setBibliaolvasas(editEntry.bibliaolvasas ?? '')
      setAlapige(editEntry.alapige ?? '')
      setEnekek(editEntry.enekek ?? '')
      setSzolgalt(editEntry.szolgalt ?? '')
      setFerfi(editEntry.jelenlet_ferfi ?? 0)
      setNo(editEntry.jelenlet_no ?? 0)
      setGyermek(editEntry.jelenlet_gyermek ?? 0)
      setPersely(editEntry.persely ?? 0)
      setDu(editEntry.du === 1)
      setMegjegyzes(editEntry.megjegyzes ?? '')
    } else {
      // Create mód — default értékek
      setCategory('szolgalat')
      setIdopont(new Date().toISOString().slice(0, 10))
      setJellege('')
      setCim('')
      setBibliaolvasas('')
      setAlapige('')
      setEnekek('')
      setSzolgalt('')
      setFerfi(0)
      setNo(0)
      setGyermek(0)
      setPersely(0)
      setDu(false)
      setMegjegyzes('')
    }
    setError(null)
  }, [open, editEntry])

  async function handleSubmit() {
    if (!idopont || !jellege) {
      setError('A dátum és a típus kötelező.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const input: WorklogInput = {
        idopont,
        jellege,
        kategoria: category,
        cim: cim || null,
        bibliaolvasas: category === 'szolgalat' ? bibliaolvasas || null : null,
        alapige: category === 'szolgalat' ? alapige || null : null,
        enekek: category === 'szolgalat' ? enekek || null : null,
        szolgalt: category === 'szolgalat' ? szolgalt || null : null,
        jelenlet_ferfi: category !== 'latogatas' ? ferfi || null : null,
        jelenlet_no: category !== 'latogatas' ? no || null : null,
        jelenlet_gyermek: category !== 'latogatas' ? gyermek || null : null,
        persely: category === 'szolgalat' ? persely || null : null,
        megjegyzes: megjegyzes || null,
        du,
      }

      if (editEntry) {
        // Edit mód — conditional update revision-checkel
        const res = await updateWorklogEntry(userId, editEntry.id, input, editEntry.revision)
        if (res.error) {
          setError(res.error)
        } else if (res.conflict) {
          setError(
            'Konfliktus: a bejegyzés időközben megváltozott (másik eszközről vagy webről). ' +
              'A lokális cache-t frissítettük — nézd át a mezőket és próbáld újra.',
          )
        } else {
          onSuccess({
            id: editEntry.id,
            queuedToOutbox: res.queuedToOutbox,
            conflict: false,
            isEdit: true,
          })
          onOpenChange(false)
        }
      } else {
        // Create mód
        const res = await createWorklogEntry(userId, input)
        if (res.error) {
          setError(res.error)
        } else {
          onSuccess({
            id: res.id,
            queuedToOutbox: res.queuedToOutbox,
            isEdit: false,
          })
          onOpenChange(false)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setLoading(false)
    }
  }

  const types = WORKLOG_TYPES[category]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            {isEdit ? 'Munkanapló-bejegyzés szerkesztése' : 'Új munkanapló-bejegyzés'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* Kategória + típus */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Kategória</Label>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as WorklogCategory)
                  setJellege('')
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="szolgalat">Szolgálat</option>
                <option value="katekezis">Katekézis</option>
                <option value="latogatas">Látogatás</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Típus <span className="text-destructive">*</span>
              </Label>
              <select
                value={jellege}
                onChange={(e) => setJellege(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Válasszon —</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="worklog-idopont">
                Dátum <span className="text-destructive">*</span>
              </Label>
              <Input
                id="worklog-idopont"
                type="date"
                value={idopont}
                onChange={(e) => setIdopont(e.currentTarget.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="worklog-cim">Cím</Label>
              <Input
                id="worklog-cim"
                value={cim}
                onChange={(e) => setCim(e.currentTarget.value)}
                placeholder={category === 'latogatas' ? 'pl. Kovács család' : undefined}
              />
            </div>
          </div>

          {/* Szolgálat extra mezők */}
          {category === 'szolgalat' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wl-ferfi">Férfi</Label>
                  <Input
                    id="wl-ferfi"
                    type="number"
                    min={0}
                    value={ferfi}
                    onChange={(e) => setFerfi(Number(e.currentTarget.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-no">Nő</Label>
                  <Input
                    id="wl-no"
                    type="number"
                    min={0}
                    value={no}
                    onChange={(e) => setNo(Number(e.currentTarget.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-gyermek">Gyermek</Label>
                  <Input
                    id="wl-gyermek"
                    type="number"
                    min={0}
                    value={gyermek}
                    onChange={(e) => setGyermek(Number(e.currentTarget.value))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wl-persely">Perselypénz (RON)</Label>
                  <Input
                    id="wl-persely"
                    type="number"
                    min={0}
                    step={0.01}
                    value={persely}
                    onChange={(e) => setPersely(Number(e.currentTarget.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-alapige">Alapige</Label>
                  <Input
                    id="wl-alapige"
                    value={alapige}
                    onChange={(e) => setAlapige(e.currentTarget.value)}
                    placeholder="Pl. Jn 3,16"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wl-bibliaolvasas">Bibliaolvasás</Label>
                  <Input
                    id="wl-bibliaolvasas"
                    value={bibliaolvasas}
                    onChange={(e) => setBibliaolvasas(e.currentTarget.value)}
                    placeholder="Pl. Mt 5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-enekek">Énekek</Label>
                  <Input
                    id="wl-enekek"
                    value={enekek}
                    onChange={(e) => setEnekek(e.currentTarget.value)}
                    placeholder="Pl. 458, 372"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wl-szolgalt">Szolgálatot vezette</Label>
                  <Input
                    id="wl-szolgalt"
                    value={szolgalt}
                    onChange={(e) => setSzolgalt(e.currentTarget.value)}
                  />
                </div>
                <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={du}
                    onChange={(e) => setDu(e.currentTarget.checked)}
                    className="size-4"
                  />
                  <span className="text-foreground">Délutáni alkalom</span>
                </label>
              </div>
            </>
          )}

          {/* Katekézis résztvevők */}
          {category === 'katekezis' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wl-k-ferfi">Férfi</Label>
                <Input
                  id="wl-k-ferfi"
                  type="number"
                  min={0}
                  value={ferfi}
                  onChange={(e) => setFerfi(Number(e.currentTarget.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-k-no">Nő</Label>
                <Input
                  id="wl-k-no"
                  type="number"
                  min={0}
                  value={no}
                  onChange={(e) => setNo(Number(e.currentTarget.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-k-gyermek">Gyermek</Label>
                <Input
                  id="wl-k-gyermek"
                  type="number"
                  min={0}
                  value={gyermek}
                  onChange={(e) => setGyermek(Number(e.currentTarget.value))}
                />
              </div>
            </div>
          )}

          {/* Megjegyzés */}
          <div className="space-y-1.5">
            <Label htmlFor="wl-megjegyzes">Megjegyzés</Label>
            <textarea
              id="wl-megjegyzes"
              value={megjegyzes}
              onChange={(e) => setMegjegyzes(e.currentTarget.value)}
              className="min-h-[60px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Részletek, emlékeztetők…"
            />
          </div>

          {/* Hibaüzenet */}
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </div>
          )}

          {/* Gombok */}
          <div className="flex gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Mégse
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={loading}>
              {loading ? 'Mentés…' : 'Mentés'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
