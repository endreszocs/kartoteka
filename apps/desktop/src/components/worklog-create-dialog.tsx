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

import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@kartoteka/ui'
// 2026-07-11 (F2/W5): élő visszajelzés a rögzítéskor — ének-cím az
// énekeskönyvből, kanonikus igehely-alak a biblia-parserből. Desktopon a
// statikus import rendben van (offline app, a bundle-méret nem kritikus).
import { getEnek } from '@kartoteka/enekeskonyv'
import { formatReference, parseMultiReference, validateReference } from '@kartoteka/biblia'

import {
  createWorklogEntry,
  updateWorklogEntry,
  type WorklogInput,
  type WorklogLocalRow,
} from '../lib/sync'

// A web `lib/constants/worklog.ts` másolata — forrás: apps/web/lib/constants/worklog.ts
// 2026-06-12 (Endre #5 munkanapló): a webes bővítés tükre — a kazuáliák
// (Keresztelő, Esketés, Temetés, Konfirmáció) a szolgálati típusok közé
// kerültek, a katekézis Vallásóra/Kátéóra-val, a látogatás Beteglátogatás-sal bővült.
// 2026-08-14 (18. pont): a HIVATALOS EREK-készlet (IT 66/2023 ív: 37+11+2) —
// a webes lib/constants/worklog.ts WORKLOG_TYPES tükre, azonos sorrendben.
// A régi típusnevek a LEGACY_WORKLOG_TYPES-ban élnek (append-only elv:
// meglévő sor jellege-értéke nem változik, csak a legördülő készlete).
export const WORKLOG_TYPES: Record<'szolgalat' | 'katekezis' | 'latogatas', string[]> = {
  szolgalat: [
    'Vasárnapi i.t.', 'Ünnepi i.t.', 'Bűnbánati i.t.', 'Hétköznapi i.t.',
    'Úrvacsora templomban', 'Betegúrvacsora',
    'Felnőtt bibliaóra', 'Ifj. vagy IKE bibliaóra', 'Presbiteri bibliaóra',
    'Nőszöv. bibliaóra', 'Házasok bibliaórája', 'Más bibliaóra 1', 'Más bibliaóra 2',
    'F. keresztelő', 'N. keresztelő', 'Keresztelői felkészítő',
    'F. temetés', 'N. temetés', 'Virrasztó',
    'Azonos esketés', 'Vegyes esketés', 'Jegyesbeszélgetés',
    'Digitális alkalmak', 'Imahét',
    'Húsvét I. it.', 'Húsvét II. it.', 'Húsvét III. it.',
    'Pünkösd I. it.', 'Pünkösd II. it.', 'Pünkösd III. it.',
    'Karácsony I. it.', 'Karácsony II. it.', 'Karácsony III. it.',
    'Vallásos ünnepély', 'Szeretetvendégség', 'Presbiteri felkészítő',
    'Egyéb szolgálat',
  ],
  katekezis: [
    'Vallásóra 1. csoport', 'Vallásóra 2. csoport', 'Vallásóra 3. csoport',
    'Vallásóra 4. csoport', 'Vallásóra 5. csoport',
    'Elsőéves konf. felkészítő', 'Másodéves konf. felkészítő',
    'Gyermekistentisztelet', 'Vasárnapi iskola',
    'VBH – Vakációs Bibliahét', 'Egyéb foglalkozás',
  ],
  latogatas: ['Családlátogatás', 'Beteglátogatás'],
}

// A 2026 előtti rögzítések típusnevei — a webes LEGACY_WORKLOG_TYPES tükre.
export const LEGACY_WORKLOG_TYPES: Record<'szolgalat' | 'katekezis' | 'latogatas', string[]> = {
  szolgalat: ['Istentisztelet', 'Igehirdetés', 'Úrvacsora', 'Bűnbánati istentisztelet', 'Bibliaóra', 'Imaóra', 'Esti áhítat', 'Alkalmi istentisztelet', 'Presbiteri gyűlés', 'Nőszövetségi összejövetel', 'Keresztelő', 'Esketés', 'Temetés', 'Konfirmáció'],
  katekezis: ['Ifjúsági bibliaóra (IKE)', 'Hittan', 'Vallásóra', 'Kátéóra', 'Konfirmáció előkészítő', 'Ifjúsági óra', 'Gyermek foglalkozás', 'Egyéb katekézis'],
  latogatas: ['Kórházlátogatás', 'Idősek otthona', 'Börtönlátogatás', 'Egyéb látogatás'],
}

export type WorklogCategory = keyof typeof WORKLOG_TYPES

// 2026-07-11 (F2/W5): napszak-opciók — a webes lib/constants/worklog.ts
// NAPSZAK_OPTIONS tükre. Adat-kontraktus: du = napszak 'du' VAGY 'du2'.
// 2026-08-14 (18. pont): + De.2/Du.2 — második de./du. alkalom (EREK 2.2:
// a jelöléssel a résztvevők ÖSSZEADÓDNAK, nélküle a rendszer átlagol).
export const NAPSZAK_OPTIONS = [
  { value: 'de', label: 'Délelőtt' },
  { value: 'du', label: 'Délután' },
  { value: 'este', label: 'Este' },
  { value: 'de2', label: 'De. 2. — második délelőtti' },
  { value: 'du2', label: 'Du. 2. — második délutáni' },
] as const

export type Napszak = (typeof NAPSZAK_OPTIONS)[number]['value']

/** Rövid napszak-felirat a lista/táblázat-cellákhoz. */
export const NAPSZAK_SHORT_LABELS: Record<Napszak, string> = {
  de: 'de.',
  du: 'du.',
  este: 'este',
  de2: 'De.2',
  du2: 'Du.2',
}

/**
 * SQLite-sor → napszak: az új `napszak` oszlop az elsődleges, a legacy `du`
 * (0/1) a fallback — a közös kontraktus szerint: napszak ?? (du ? 'du' : 'de').
 */
export function napszakFromRow(row: { napszak?: string | null; du?: number | null }): Napszak {
  if (
    row.napszak === 'de' || row.napszak === 'du' || row.napszak === 'este' ||
    row.napszak === 'de2' || row.napszak === 'du2'
  ) return row.napszak
  return row.du === 1 ? 'du' : 'de'
}

/**
 * A webes `categorizeWorklogEntry` tükre (lib/constants/worklog.ts):
 *  1. ha a `kategoria` kifejezetten 'katekezis'/'latogatas' → azt használjuk
 *     (ezek nem DB-default értékek, tudatos beállítások);
 *  2. különben a `jellege` típuslisták döntenek (a kategoria oszlop DEFAULT
 *     'szolgalat'-tal jött létre, a legacy soroknál nem megbízható);
 *  3. alapértelmezés: 'szolgalat'.
 */
export function categorizeWorklogEntry(e: { kategoria?: string | null; jellege?: string | null }): WorklogCategory {
  if (e.kategoria === 'katekezis' || e.kategoria === 'latogatas') return e.kategoria
  // 2026-08-14 (18. pont): a hivatalos ÉS a legacy készlet is számít — a
  // régi sorok besorolása nem változhat a taxonómia-bővítéstől.
  for (const cat of Object.keys(WORKLOG_TYPES) as WorklogCategory[]) {
    if (
      e.jellege &&
      (WORKLOG_TYPES[cat].includes(e.jellege) || LEGACY_WORKLOG_TYPES[cat].includes(e.jellege))
    ) return cat
  }
  return 'szolgalat'
}

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
  // 2026-07-11 (F2/W5): a korábbi "Délutáni alkalom" checkbox (legacy `du`)
  // helyett napszak-választó (de/du/este) — a mentés a `du`-t szinkronban
  // tartja (du = napszak === 'du'). A webes WorklogDialog tükre.
  const [napszak, setNapszak] = useState<Napszak>('de')
  // Úrvacsorázók — templomban / betegnél. String state: '' = nincs adat
  // (null-t tárolunk), a beírt 0 viszont értelmes érték marad.
  const [uvTemplomban, setUvTemplomban] = useState('')
  const [uvBetegnel, setUvBetegnel] = useState('')
  const [megjegyzes, setMegjegyzes] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dialog megnyitásakor a mezőket alapértelmezettre (create) vagy a szerkesztett
  // bejegyzés adataira (edit) állítjuk
  useEffect(() => {
    if (!open) return
    if (editEntry) {
      // Edit mód — pre-fill; a kategória a közös szabállyal (kategoria mező +
      // jellege fallback — a webes categorizeWorklogEntry tükre, 2026-06-12)
      setCategory(categorizeWorklogEntry(editEntry))
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
      // Napszak: az új oszlop az elsődleges, a legacy `du` a fallback
      // (kontraktus: napszak ?? (du ? 'du' : 'de')).
      setNapszak(napszakFromRow(editEntry))
      setUvTemplomban(editEntry.uv_templomban != null ? String(editEntry.uv_templomban) : '')
      setUvBetegnel(editEntry.uv_betegnel != null ? String(editEntry.uv_betegnel) : '')
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
      setNapszak('de')
      setUvTemplomban('')
      setUvBetegnel('')
      setMegjegyzes('')
    }
    setError(null)
  }, [open, editEntry])

  // 2026-07-11 (F2/W5): élő ének-cím visszajelzés — az "Énekek" mező vesszővel /
  // pontosvesszővel tagolt számait az énekeskönyvben oldjuk fel (pl. '458, 372'
  // vagy '400b'). A zsoltároknál (nincs cím) az első sor a gyakorlati cím.
  const enekTalalatok = useMemo(() => {
    const raw = enekek.trim()
    if (!raw) return []
    return raw
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((token) => {
        const enek = getEnek(token)
        return { token, cim: enek ? (enek.cim ?? enek.elsoSor) : null }
      })
  }, [enekek])

  // 2026-07-11 (F2/W5): kanonikus igehely-alak az alapige mező alatt — a
  // @kartoteka/biblia parser + formatter (pl. 'jn 3:16' → 'Jn 3,16'). Több
  // hivatkozás ';'-vel tagolható. Hibás alaknál magyar hibaüzenet.
  const alapigeInfo = useMemo(() => {
    const raw = alapige.trim()
    if (!raw) return null
    const results = parseMultiReference(raw)
    if (results.length === 0) return null
    const kanonikus: string[] = []
    const problemak: string[] = []
    for (const res of results) {
      if (!res.ok) {
        problemak.push(res.error.message)
        continue
      }
      const validation = validateReference(res.segments)
      if (!validation.valid) problemak.push(...validation.problemak)
      kanonikus.push(formatReference(res.segments))
    }
    return { kanonikus: kanonikus.join('; '), problemak }
  }, [alapige])

  async function handleSubmit() {
    if (!idopont || !jellege) {
      setError('A dátum és a típus kötelező.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // 2026-06-12 (Endre #5 munkanapló): a webes WorklogDialog mentésének
      // tükre — minden mező feltétel nélkül mentődik (a jelenlét mindhárom
      // kategóriánál, a persely + szolgalt a katekézisnél/látogatásnál is).
      const input: WorklogInput = {
        idopont,
        jellege,
        kategoria: category,
        cim: cim || null,
        bibliaolvasas: bibliaolvasas || null,
        alapige: alapige || null,
        enekek: enekek || null,
        szolgalt: szolgalt || null,
        jelenlet_ferfi: ferfi || null,
        jelenlet_no: no || null,
        jelenlet_gyermek: gyermek || null,
        persely: persely || null,
        megjegyzes: megjegyzes || null,
        // Napszak + legacy `du` szinkronban (adat-kontraktus: du = napszak==='du')
        napszak,
        du: napszak === 'du' || napszak === 'du2',
        // Úrvacsorázók: üres mező → null (a beírt 0 értelmes adat, azt tároljuk)
        uv_templomban: uvTemplomban === '' ? null : Number(uvTemplomban),
        uv_betegnel: uvBetegnel === '' ? null : Number(uvBetegnel),
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
                  const next = e.target.value as WorklogCategory
                  setCategory(next)
                  setJellege('')
                  // 2026-07-11 (web-tükör): váltáskor az ÚJ kategóriában nem
                  // látható mezők ürülnek — különben a rejtett értékek
                  // átszivárognának a mentésbe. A szolgalt mindhárom űrlapon
                  // látható, ezért marad.
                  if (next !== 'szolgalat') {
                    setAlapige('')
                    setBibliaolvasas('')
                    setEnekek('')
                    setNapszak('de')
                    setUvTemplomban('')
                    setUvBetegnel('')
                  }
                  if (next === 'latogatas') setPersely(0)
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
                {/* Legacy/egyedi típus megőrzése szerkesztéskor (pl. régi elgépelt
                    érték) — különben a select üresre ugrana. 2026-06-12 (web-tükör). */}
                {jellege && !types.includes(jellege) && (
                  <option value={jellege}>{jellege}</option>
                )}
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

          {/* Jelenlét — mindhárom kategóriánál (a hivatalos Excel naplók
              mindegyike tartalmaz létszámot: Férfi/Nő, Résztvett, Jelen volt).
              2026-06-12 (Endre #5 munkanapló — a webes bővített rögzítő tükre). */}
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

          {/* Szolgálat extra mezők */}
          {category === 'szolgalat' && (
            <>
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
                  {/* Kanonikus igehely-alak / hibaüzenet a biblia-parserből */}
                  {alapigeInfo && (
                    alapigeInfo.problemak.length > 0 ? (
                      <p className="text-xs text-destructive">{alapigeInfo.problemak[0]}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">✓ {alapigeInfo.kanonikus}</p>
                    )
                  )}
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
                  {/* Ének-cím visszajelzés az énekeskönyvből (szám → cím) */}
                  {enekTalalatok.length > 0 && (
                    <ul className="space-y-0.5 text-xs">
                      {enekTalalatok.map((t, i) => (
                        <li
                          key={`${t.token}-${i}`}
                          className={t.cim ? 'text-muted-foreground' : 'text-destructive'}
                        >
                          {t.cim
                            ? `${t.token} — ${t.cim}`
                            : `${t.token} — nincs ilyen ének az énekeskönyvben`}
                        </li>
                      ))}
                    </ul>
                  )}
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
                {/* 2026-07-11 (F2/W5): a "Délutáni alkalom" checkbox helyett
                    napszak-választó — a webes WorklogDialog tükre. */}
                <div className="space-y-1.5">
                  <Label htmlFor="wl-napszak">Napszak</Label>
                  <select
                    id="wl-napszak"
                    value={napszak}
                    onChange={(e) => setNapszak(e.currentTarget.value as Napszak)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {NAPSZAK_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Úrvacsorázók — templomban / betegnél (csak szolgálatnál) */}
              <div className="space-y-1.5">
                <Label>Úrvacsorázók — templomban / betegnél</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    id="wl-uv-templomban"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="Templomban"
                    aria-label="Úrvacsorázók templomban"
                    value={uvTemplomban}
                    onChange={(e) => setUvTemplomban(e.currentTarget.value)}
                  />
                  <Input
                    id="wl-uv-betegnel"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="Betegnél"
                    aria-label="Úrvacsorázók betegnél"
                    value={uvBetegnel}
                    onChange={(e) => setUvBetegnel(e.currentTarget.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Katekézis: persely + aki tartotta (a hivatalos Excel Katekézis
              naplójában: Perselypénz, Tartotta oszlopok) — webes tükör. */}
          {category === 'katekezis' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wl-k-persely">Perselypénz (RON)</Label>
                <Input
                  id="wl-k-persely"
                  type="number"
                  min={0}
                  step={0.01}
                  value={persely}
                  onChange={(e) => setPersely(Number(e.currentTarget.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wl-k-szolgalt">Tartotta</Label>
                <Input
                  id="wl-k-szolgalt"
                  value={szolgalt}
                  onChange={(e) => setSzolgalt(e.currentTarget.value)}
                  placeholder="Pl. a lelkész neve"
                />
              </div>
            </div>
          )}

          {/* Látogatás: a látogató lelkész (a hivatalos Excel Családlátogatás
              naplójában: lelkész + jelen volt) — webes tükör. */}
          {category === 'latogatas' && (
            <div className="space-y-1.5">
              <Label htmlFor="wl-l-szolgalt">Lelkész / látogató</Label>
              <Input
                id="wl-l-szolgalt"
                value={szolgalt}
                onChange={(e) => setSzolgalt(e.currentTarget.value)}
                placeholder="Pl. a lelkész neve"
              />
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
