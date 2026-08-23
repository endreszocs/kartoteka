/**
 * Leltár oldal — `/leltar` route.
 *
 * Sprint F (2026-04-25): READ-ONLY desktop-paritás a leltári tételekhez.
 * 2026-08-15 (desktop-paritás 4. szelet — „Leltár: rögzítés + fisa"):
 *   - ÚJ TÉTEL rögzítése + sor-szerkesztés (InventoryItemDialog) — online-only
 *     direkt Supabase-írás verified-session őrrel és szerver-visszaigazolással
 *     (lib/inventory-write.ts); siker után full-pull frissíti a lokális tükröt
 *   - kétnyelvű (HU/RO) fişă-nyomtatás soronként és az űrlapból — a KÖZÖS
 *     @kartoteka/ui-app fisa-builder + printHtmlViaIframe
 *   - kategória-szűrő a KÖZÖS kategória-készletből (web-azonos 7 kategória,
 *     darabszámmal) — a korábbi kézi címke-másolat törölve (a „második felület
 *     a régi implementációt őrzi" hibaosztály megszüntetése); a szűrés a
 *     normalizált kulcson fut, kliens-oldalon
 *
 * Funkciók:
 *   - PageHero + 4 statisztika-kártya + szöveg-keresés + tétel-lista
 *   - „Frissítés most" gomb (full-pull); az adatok offline is olvashatók
 *   - írás (új tétel / szerkesztés) CSAK online — a dialógus hangosan jelzi
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  AlertCircle,
  Archive,
  Boxes,
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'

import { Button, Card, CardContent, Input } from '@kartoteka/ui'
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  INVENTORY_CATEGORY_ROMANIAN_LABELS,
  OnlineStatePill,
  PageHero,
  buildInventoryItemCardHtml,
  calculateInventoryCurrentValue,
  getInventoryAmortizationCatalogEntry,
  getInventoryCategoryLabel,
  normalizeInventoryCategory,
  type InventoryCategory,
  type InventoryItem,
  type InventoryItemCardData,
} from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { InventoryItemDialog } from '../components/inventory-item-dialog'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import { printHtmlViaIframe } from '../lib/print-html'
import { useSessionOnline } from '../lib/use-session-online'
import {
  getLastPullInventoryIso,
  getLocalInventory,
  getLocalInventoryStats,
  getLocalOwnCongregation,
  getLocalOwnProfile,
  pullInventoryOfOwnCongregation,
  type InventoryItemLocalRow,
  type InventoryStats,
} from '../lib/sync'

// A kliens-oldali szűréshez elég nagy plafon (átlag <500 tétel/gyülekezet —
// lásd sync.ts pullInventory); a kategória-szűrés a normalizált kulcson fut,
// ezért nem tolható le az SQL-be.
const LIST_LIMIT = 1000

function formatCurrency(value: number): string {
  if (!value) return '0 RON'
  return `${Math.round(value).toLocaleString('hu')} RON`
}

export function LeltarPage() {
  const [user, setUser] = useState<User | null>(null)
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [congregationName, setCongregationName] = useState<string>('Gyülekezet')
  // 2026-08-22 (6. pont): a gyülekezet hivatalos ROMÁN neve (`nev_ro`) — a
  // ROMÁN nyelvre állított fişa fejlécébe. Ha nincs kitöltve, `null` marad, és
  // a kartonon a magyar név áll EGYEDÜL (kitalált román nevet nem írunk).
  const [congregationNameRo, setCongregationNameRo] = useState<string | null>(null)
  const [stats, setStats] = useState<InventoryStats | null>(null)
  const [items, setItems] = useState<InventoryItemLocalRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | null>(null)
  const [lastPullIso, setLastPullIso] = useState<string | null>(null)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [pullSuccess, setPullSuccess] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // 4. szelet: rögzítő/szerkesztő dialógus + a fişă nyelve (webes minta:
  // a soronkénti nyomtatás a legutóbb választott nyelven fut, HU az alap).
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState<InventoryItemLocalRow | null>(null)
  const [fisaLang, setFisaLang] = useState<'hu' | 'ro'>('hu')
  const online = useSessionOnline()

  // Auth + gyülekezet-feloldás: getDesktopUser (SOHA nem auth.getUser) →
  // lokális profil → congregation_id + hivatalos név a fişă fejlécéhez.
  useEffect(() => {
    let mounted = true
    getDesktopUser().then(async (resolvedUser) => {
      if (!mounted) return
      setUser(resolvedUser)
      if (!resolvedUser) return
      try {
        const [profile, cong] = await Promise.all([
          getLocalOwnProfile(resolvedUser.id),
          getLocalOwnCongregation(resolvedUser.id),
        ])
        if (!mounted) return
        setCongregationId(profile?.congregation_id ?? null)
        // A `name` a HIVATALOS név (nem nev_hu!) — a fişă ezt viseli.
        if (cong?.name) setCongregationName(cong.name)
        // A `nev_ro` a HIVATALOS ROMÁN név — a lokális congregations_local sor
        // már ma is tárolja (sync.ts SELECT-je olvassa), csak eddig senki nem
        // adta tovább a fişának.
        setCongregationNameRo((cong?.nev_ro || '').trim() || null)
      } catch {
        // csendes — a congregationId nélkül a mentés úgyis tiltott (fail-closed)
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  // Stats + last pull (ritka frissítés)
  useEffect(() => {
    if (!user) return
    let mounted = true
    void Promise.all([
      getLocalInventoryStats(user.id).catch(() => null),
      getLastPullInventoryIso(user.id).catch(() => null),
    ]).then(([s, lp]) => {
      if (!mounted) return
      setStats(s)
      setLastPullIso(lp)
    })
    return () => {
      mounted = false
    }
  }, [user, refreshKey])

  // Lista (search változáskor frissül; a kategória-szűrés kliens-oldali)
  useEffect(() => {
    if (!user) return
    let mounted = true
    void getLocalInventory(user.id, {
      search: search || undefined,
      limit: LIST_LIMIT,
    })
      .then((rows) => {
        if (mounted) setItems(rows)
      })
      .catch(() => {
        if (mounted) setItems([])
      })
    return () => {
      mounted = false
    }
  }, [user, search, refreshKey])

  const handlePull = useCallback(async () => {
    if (!user) return
    setPulling(true)
    setPullError(null)
    setPullSuccess(null)
    try {
      const result = await pullInventoryOfOwnCongregation(user.id)
      if (result.mode === 'no-congregation') {
        setPullError('Nincs hozzárendelt gyülekezet — a frissítés nem futott le.')
      } else {
        setPullSuccess(`Frissítve: ${result.pulledRows} leltári tétel.`)
        setRefreshKey((k) => k + 1)
      }
    } catch (err) {
      setPullError(errorMessage(err))
    } finally {
      setPulling(false)
    }
  }, [user])

  // Sikeres mentés: dialógus zár + full-pull (a lokális tükör a szerver
  // állapotát csak pull után látja — a Kuka-szelet 4.6. tanulsága).
  const handleSaved = useCallback(
    (message: string) => {
      setDialogOpen(false)
      setEditItem(null)
      setPullError(null)
      setPullSuccess(message)
      void handlePull()
    },
    [handlePull],
  )

  function openCreateDialog() {
    setEditItem(null)
    setDialogOpen(true)
  }

  function openEditDialog(item: InventoryItemLocalRow) {
    setEditItem(item)
    setDialogOpen(true)
  }

  // ── Fişă-nyomtatás egy lista-sorból (a webes itemToCardData tükre) ────────
  const rowToCardData = useCallback(
    (it: InventoryItemLocalRow): InventoryItemCardData => {
      const key = normalizeInventoryCategory(it.kategoria)
      const entry = getInventoryAmortizationCatalogEntry(it.katalogus_kod)
      // Szintetikus tétel az amortizáció-számításhoz (csak a használt mezőkkel).
      const syntheticItem = {
        kategoria_key: key,
        beszerzes_erteke: it.beszerzes_erteke ?? 0,
        mennyiseg: it.mennyiseg || 1,
        hasznalati_ido: it.hasznalati_ido,
        beszerzes_datuma: it.beszerzes_datuma,
      } as InventoryItem
      return {
        congregationName: congregationName || 'Gyülekezet',
        congregationNameRo,
        leltariSzam: it.leltari_szam,
        regiLeltariSzam: it.regi_leltari_szam,
        megnevezes: it.megnevezes,
        kategoriaLabel: getInventoryCategoryLabel(it.kategoria),
        kategoriaLabelRo: key ? INVENTORY_CATEGORY_ROMANIAN_LABELS[key] : null,
        isAlapeszkoz: key === 'alapeszkoz',
        mennyiseg: it.mennyiseg || 1,
        mertekegyseg: it.mertekegyseg,
        beszerzesDatuma: it.beszerzes_datuma,
        beszerzesBizonylat: it.beszerzes_bizonylat,
        beszerzesErteke: it.beszerzes_erteke || null,
        katalogusKod: it.katalogus_kod,
        katalogusNev: entry?.nev ?? null,
        hasznalatiIdoEv: it.hasznalati_ido,
        aktualisErtek: calculateInventoryCurrentValue(syntheticItem),
        helyszin: it.helyszin,
        felelosNev: it.felelos_nev,
        megjegyzes: it.megjegyzes,
        szerzo: it.szerzo,
        konyvIsbn: it.konyv_isbn,
      }
    },
    [congregationName, congregationNameRo],
  )

  function handleRowFisaPrint(item: InventoryItemLocalRow) {
    // A fişă a legutóbb választott nyelven nyomtatódik (HU az alap).
    void printHtmlViaIframe(
      buildInventoryItemCardHtml({ ...rowToCardData(item), lang: fisaLang }).html,
    )
  }

  // Kategóriánkénti darabszám a KÖZÖS kulcsokra normalizálva (a lokális stats
  // a nyers DB-értéken csoportosít — pl. 'Alapeszközök', 'Telkek_foldek_erdok').
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<InventoryCategory, number>> = {}
    for (const [raw, cnt] of Object.entries(stats?.byCategory ?? {})) {
      const key = normalizeInventoryCategory(raw)
      if (key) counts[key] = (counts[key] ?? 0) + cnt
    }
    return counts
  }, [stats])

  // Kliens-oldali kategória-szűrés a normalizált kulcson (fail-closed: a nem
  // besorolható sorok csak a „Mind" nézetben látszanak).
  const visibleItems = useMemo(
    () =>
      categoryFilter
        ? items.filter((it) => normalizeInventoryCategory(it.kategoria) === categoryFilter)
        : items,
    [items, categoryFilter],
  )

  const lastPullText = lastPullIso ? formatRelativeTime(lastPullIso) : 'még sosem'

  return (
    <DesktopShell>
      <div className="space-y-5">
        <PageHero
          eyebrow="Leltár"
          title="Leltári tételek"
          description="A gyülekezet alapeszközei, könyvei, kegyszerei és egyéb javai egy helyen. Az adatok offline is olvashatók; az új tétel rögzítéséhez és a szerkesztéshez internetkapcsolat kell."
          Icon={Boxes}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={openCreateDialog}
                disabled={!user || !congregationId || !online}
                title={
                  !online
                    ? 'Az új tétel rögzítéséhez internetkapcsolat és online belépés kell — a leltári számot a szerver osztja ki.'
                    : !congregationId
                      ? 'Nincs hozzárendelt gyülekezet ezen a gépen.'
                      : 'Új leltári tétel rögzítése'
                }
                className="rounded-xl border-slate-200 bg-white/90 shadow-sm"
              >
                <Plus className="mr-1 size-3.5" />
                Új tétel
              </Button>
              <Button
                size="sm"
                onClick={handlePull}
                disabled={pulling}
                className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)]"
              >
                <RefreshCw className={`mr-1 size-3.5 ${pulling ? 'animate-spin' : ''}`} />
                {pulling ? 'Frissítés…' : 'Frissítés most'}
              </Button>
            </>
          }
          stats={[{ label: 'Utolsó frissítés', value: lastPullText }]}
        />

        {/* DIAGNOSTICS P2-7: egységes online/offline pill */}
        <div className="flex justify-end">
          <OnlineStatePill lastSyncAt={lastPullIso} />
        </div>

        {pullError && (
          <Card className="border-red-200 bg-red-50/80">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{pullError}</span>
            </CardContent>
          </Card>
        )}
        {pullSuccess && (
          <Card className="border-emerald-200 bg-emerald-50/80">
            <CardContent className="flex items-start gap-2 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <span>{pullSuccess}</span>
            </CardContent>
          </Card>
        )}

        {/* 4 stat-kártya */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Összes tétel" value={stats?.total ?? 0} icon={Archive} gradient="from-sky-500 to-blue-600" />
          <StatCard label="Aktív tételek" value={stats?.active ?? 0} icon={Boxes} gradient="from-emerald-500 to-teal-600" />
          <StatCard label="Törölt" value={stats?.deleted ?? 0} icon={Trash2} gradient="from-slate-500 to-slate-700" />
          <StatCard label="Össz-érték" value={formatCurrency(stats?.totalValue ?? 0)} icon={Boxes} gradient="from-amber-500 to-orange-600" isText />
        </div>

        {/* Szűrők — a kategória-gombok a KÖZÖS készletből (web-azonos 7 kategória) */}
        <Card className="card-raised border-0">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Keresés megnevezésre, leltári-számra, helyszínre…"
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter(null)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    categoryFilter === null
                      ? 'bg-slate-800 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Mind
                  <span className="ml-1.5 opacity-70">({stats?.active ?? 0})</span>
                </button>
                {INVENTORY_CATEGORIES.map((cat) => {
                  const db = categoryCounts[cat] ?? 0
                  const active = categoryFilter === cat
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(active ? null : cat)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'bg-slate-800 text-white'
                          : db === 0
                            ? 'border border-slate-200 bg-white text-slate-400 hover:text-slate-500'
                            : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {INVENTORY_CATEGORY_LABELS[cat]}
                      <span className="ml-1.5 opacity-70">({db})</span>
                    </button>
                  )
                })}
              </div>
              {/* A fişă nyelve — a soronkénti nyomtatás ezt használja */}
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>A fişă nyelve:</span>
                <div
                  className="inline-flex overflow-hidden rounded-lg border border-slate-200"
                  role="group"
                  aria-label="A fişă nyelve"
                >
                  {(['hu', 'ro'] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setFisaLang(l)}
                      className={`px-2.5 py-1 text-xs font-semibold uppercase transition ${
                        fisaLang === l
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-slate-500 hover:text-slate-700'
                      }`}
                      title={
                        l === 'hu'
                          ? 'Magyar elsődleges, román alcímkék'
                          : 'Román elsődleges (hivatalos forma), magyar alcímkék'
                      }
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista */}
        {visibleItems.length === 0 ? (
          <Card className="card-raised border-0">
            <CardContent className="p-10 text-center">
              <Archive className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                {search || categoryFilter
                  ? 'A szűrőknek megfelelő tétel nem található.'
                  : 'Még nincsen leltári tétel a lokális cache-ben.'}
              </p>
              <p className="text-xs text-slate-400">
                Kattints a „Frissítés most" gombra, ha online vagy — vagy rögzítsd az
                első tételt az „Új tétel" gombbal.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="card-raised border-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Lelt. szám</th>
                  <th className="px-4 py-2.5">Megnevezés</th>
                  <th className="px-4 py-2.5">Kategória</th>
                  <th className="px-4 py-2.5">Helyszín</th>
                  <th className="px-4 py-2.5">Mennyiség</th>
                  <th className="px-4 py-2.5 text-right">Érték (RON)</th>
                  <th className="w-36 px-4 py-2.5"><span className="sr-only">Műveletek</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((it) => (
                  <tr
                    key={it.id}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/40"
                    onClick={() => openEditDialog(it)}
                    title="Kattints a szerkesztéshez"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{it.leltari_szam ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-800">
                      <div className="font-medium">{it.megnevezes}</div>
                      {it.szerzo && <div className="text-xs text-slate-500">{it.szerzo}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{getInventoryCategoryLabel(it.kategoria)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{it.helyszin ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700">
                      {it.mennyiseg.toLocaleString('hu')} {it.mertekegyseg ?? 'db'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                      {it.beszerzes_erteke ? formatCurrency(it.beszerzes_erteke * it.mennyiseg) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg px-2 text-xs text-teal-700"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRowFisaPrint(it)
                          }}
                          title="A tétel fişájának nyomtatása"
                          aria-label={`${it.megnevezes} fişájának nyomtatása`}
                        >
                          <FileText className="mr-1 size-3.5" /> Fişă
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-lg px-2 text-xs text-blue-600"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditDialog(it)
                          }}
                          title="Tétel szerkesztése"
                          aria-label={`${it.megnevezes} szerkesztése`}
                        >
                          <Pencil className="mr-1 size-3.5" /> Szerk.
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === LIST_LIMIT && (
              <div className="border-t border-slate-100 p-3 text-center text-xs text-slate-500">
                Az első {LIST_LIMIT} találat látszik. Szűkítsd a keresést, hogy a többit is láthasd.
              </div>
            )}
          </Card>
        )}
      </div>

      <InventoryItemDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next)
          if (!next) setEditItem(null)
        }}
        congregationId={congregationId}
        congregationName={congregationName}
        congregationNameRo={congregationNameRo}
        editItem={editItem}
        fisaLang={fisaLang}
        onFisaLangChange={setFisaLang}
        onSaved={handleSaved}
      />
    </DesktopShell>
  )
}

// ──────────────────────────────────────────────────────────────
// Helper komponensek
// ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: number | string
  icon: typeof Archive
  gradient: string
  isText?: boolean
}

function StatCard({ label, value, icon: Icon, gradient, isText }: StatCardProps) {
  return (
    <Card className="card-raised border-0 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {label}
            </p>
            <p className={`mt-1 font-bold text-slate-800 ${isText ? 'text-base' : 'text-2xl'}`}>
              {typeof value === 'number' ? value.toLocaleString('hu') : value}
            </p>
          </div>
          <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white shadow-sm`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatRelativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    const now = Date.now()
    const diffMs = now - then
    const diffMin = Math.round(diffMs / 60000)
    if (diffMin < 1) return 'most'
    if (diffMin < 60) return `${diffMin} perce`
    const diffHr = Math.round(diffMin / 60)
    if (diffHr < 24) return `${diffHr} órája`
    const diffDay = Math.round(diffHr / 24)
    if (diffDay < 30) return `${diffDay} napja`
    return new Date(iso).toLocaleDateString('hu-HU')
  } catch {
    return iso.slice(0, 10)
  }
}
