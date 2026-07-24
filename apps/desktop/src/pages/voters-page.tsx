/**
 * Választók oldal — `/valasztok` route (2026-07-24, PR-8, F9 paritás-minimum).
 *
 * A webes Választók fül desktop-megfelelője a LOKÁLISAN szinkronizált adatból:
 *   - 18+ aktív tagok listája, választó-jelöléssel (voter_eligible — a webes
 *     „Jogosultság frissítése" számítja, a sync hozza le)
 *   - KPI-k: névjegyzéki választó / férfi / nő / összes felnőtt
 *   - diakritika-toleráns kereső
 *   - hivatalos „Választók névjegyzéke" nyomtatás — UGYANAZZAL a lapozott
 *     A4-építővel (@kartoteka/ui-app buildVoterListReport), mint a web.
 *
 * A pénzügyi (fizetett/felmentett) szűrés webes funkció marad — desktopon a
 * névjegyzék a szinkronizált voter_eligible flagre épül, ezt a nyomtatvány
 * fejléce alatt jelezzük is a lelkésznek (note-sor a buildVoterListReport-ban).
 *
 * Ismert V1-korlát: a nyomtatvány „Lakhelye" oszlopa desktopon üres — a
 * c_helysegid nincs a V1 sync-oszlopok között (sync.ts MEMBER_SELECT_COLS);
 * paritáshoz c_helysegid-szinkron + adrlocality_local névfeloldás kell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Printer, Scale, Search, User, UserRound, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button, Input } from '@kartoteka/ui'
import { PageHero, buildVoterListReport } from '@kartoteka/ui-app'
import type { SzemelyListRow } from '@kartoteka/validations'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { errorMessage } from '../lib/error'
import { getDesktopUser } from '../lib/desktop-user'
import { getLocalOwnCongregation, getLocalOwnProfile } from '../lib/sync'
import { useDataVersion } from '../lib/sync-orchestrator'
import { getTauriSqliteBackend } from '../lib/tauri-sqlite-backend'
import { printHtmlViaIframe } from '../lib/print-html'

function ageFromIso(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 ? age : null
}

function isAdult(iso: string | null): boolean {
  const age = ageFromIso(iso)
  return age !== null && age >= 18
}

function fullName(r: SzemelyListRow): string {
  return [r.csaladnev ?? r.ferjk_nev, r.k_nev].filter(Boolean).join(' ').trim() || `#${r.id}`
}

export function VotersPage() {
  const navigate = useNavigate()
  const dataVersion = useDataVersion()
  const [congregationId, setCongregationId] = useState<string | null>(null)
  const [congregationName, setCongregationName] = useState<string>('Gyülekezet')
  const [congregationCity, setCongregationCity] = useState<string | null>(null)
  // 2026-07-24 (PR-8 review): a nyomtatvány-fejléc cím+telefon (web-paritás)
  const [congregationAddress, setCongregationAddress] = useState<string | null>(null)
  const [congregationPhone, setCongregationPhone] = useState<string | null>(null)
  const [rows, setRows] = useState<SzemelyListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyVoters, setOnlyVoters] = useState(false)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let mounted = true
    getDesktopUser()
      .then(async (resolvedUser) => {
        if (!mounted || !resolvedUser) return
        try {
          const profile = await getLocalOwnProfile(resolvedUser.id)
          if (mounted) setCongregationId(profile?.congregation_id ?? null)
          const cong = await getLocalOwnCongregation(resolvedUser.id)
          if (mounted && cong) {
            setCongregationName(cong.name || cong.nev_hu || 'Gyülekezet')
            setCongregationCity(cong.varos ?? null)
            // A webes getVoterPrintContext cím-összeállításával egyezően
            setCongregationAddress([cong.cim, cong.varos, cong.megye].filter(Boolean).join(', ') || null)
            setCongregationPhone(cong.telefon ?? null)
          }
        } catch {
          /* csendes — offline fallback nevek maradnak */
        }
      })
      .catch(() => {
        /* csendes */
      })
    return () => {
      mounted = false
    }
  }, [])

  // A séma-plafon (szemelyListInputSchema.limit max 2000). Ha a lista pont
  // eléri, csonkolás gyanús — hivatalos névjegyzéket ilyenkor NEM nyomtatunk.
  const VOTER_LIST_LIMIT = 2000
  const [truncated, setTruncated] = useState(false)

  const loadList = useCallback(async () => {
    if (!congregationId) return
    setLoading(true)
    setError(null)
    try {
      const list = await getTauriSqliteBackend().listLocalSzemely({
        congregationId,
        search: search.trim() || undefined,
        statusFilter: 'aktiv',
        orderBy: 'csaladnev-asc',
        limit: VOTER_LIST_LIMIT,
      })
      setRows(list)
      // 2026-07-24 (PR-8 review): néma csonkolás-őr a hivatalos dokumentumhoz
      setTruncated(!search.trim() && list.length >= VOTER_LIST_LIMIT)
    } catch (err) {
      setError(`Választók betöltési hiba: ${errorMessage(err)}`)
    } finally {
      setLoading(false)
    }
  }, [congregationId, search])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadList()
    }, 300)
    return () => clearTimeout(timer)
  }, [loadList, dataVersion])

  // Felnőtt (18+) tagok — a névjegyzék alapsokasága
  const adults = useMemo(() => rows.filter((r) => isAdult(r.sz_datum)), [rows])
  const voters = useMemo(() => adults.filter((r) => r.voter_eligible === 1), [adults])
  const { maleCount, femaleCount } = useMemo(() => {
    let male = 0
    let female = 0
    for (const v of voters) {
      if (v.ferfi === 1) male++
      else female++
    }
    return { maleCount: male, femaleCount: female }
  }, [voters])

  const visible = onlyVoters ? voters : adults

  async function handlePrint() {
    if (!congregationId) return
    setPrinting(true)
    try {
      // 2026-07-24 (PR-8 review): a HIVATALOS nyomtatvány SOHA nem épülhet a
      // képernyőn épp aktív keresőszűrésre — friss, szűretlen lekérés megy.
      const fullList = await getTauriSqliteBackend().listLocalSzemely({
        congregationId,
        statusFilter: 'aktiv',
        orderBy: 'csaladnev-asc',
        limit: VOTER_LIST_LIMIT,
      })
      if (fullList.length >= VOTER_LIST_LIMIT) {
        setError(
          `A helyi taglista elérte a ${VOTER_LIST_LIMIT} soros plafont — a hivatalos névjegyzék csonka lehetne, ezért nem nyomtatjuk. Használd a webes nyomtatási központot.`,
        )
        return
      }
      const printVoters = fullList.filter((r) => isAdult(r.sz_datum) && r.voter_eligible === 1)
      const year = new Date().getFullYear()
      const report = buildVoterListReport({
        voters: printVoters.map((v) => ({
          name: fullName(v),
          occupation: v.foglalkozas ?? null,
          address: [v.c_szcim, v.c_szam].filter(Boolean).join(' ').trim() || null,
          settlement: null,
        })),
        year,
        congregationName,
        address: congregationAddress,
        phone: congregationPhone,
        city: congregationCity,
        // A webes kanonikus (fizetett/felmentett) szűréstől való eltérés a
        // papíron is látszik — hivatalos dokumentumnál kötelező jelzés.
        note: 'A névjegyzék a szinkronizált választói jogosultság-jelölés alapján készült; a járulékfizetés/felmentés szerinti szűrés a webes nyomtatási központban érhető el.',
      })
      await printHtmlViaIframe(report.html)
    } catch (err) {
      setError(`Nyomtatási hiba: ${errorMessage(err)}`)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <DesktopShell>
      <div className="space-y-4">
        <PageHero
          eyebrow="Tagnyilvántartás"
          title="Választók"
          description="A választói névjegyzék a szinkronizált jogosultság-jelölésekből. A jogosultság-újraszámítás és a befizetés-alapú szűrés a webes felületen érhető el."
          Icon={Scale}
          stats={[
            { label: 'Névjegyzéki választó', value: String(voters.length) },
            { label: 'Férfi', value: String(maleCount) },
            { label: 'Nő', value: String(femaleCount) },
            { label: 'Felnőtt (18+) tag', value: String(adults.length) },
          ]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/tagnyilvantartas')}
              >
                <Users className="mr-2 size-4" />
                Tag-lista
              </Button>
              <Button type="button" onClick={handlePrint} disabled={printing || voters.length === 0 || truncated}>
                <Printer className="mr-2 size-4" />
                {printing ? 'Nyomtatás…' : 'Névjegyzék nyomtatása'}
              </Button>
            </div>
          }
        />

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {truncated && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            A helyi lista elérte a {VOTER_LIST_LIMIT} soros plafont — a megjelenítés és a
            hivatalos nyomtatás csonka lehetne, ezért a nyomtatás letiltva. Használd a
            webes nyomtatási központot.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              placeholder="Keresés név alapján…"
              className="h-10 pl-9"
            />
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
            <input
              type="checkbox"
              checked={onlyVoters}
              onChange={(e) => setOnlyVoters(e.currentTarget.checked)}
              className="size-4 accent-emerald-600"
            />
            Csak választók
          </label>
          <span className="text-xs text-slate-500">{visible.length} fő</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">Betöltés…</div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              Nincs megjeleníthető felnőtt tag.
              {rows.length === 0 && ' (Fut már a szinkronizáció?)'}
            </div>
          ) : (
            <div className="max-h-[62vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Név</th>
                    <th className="px-3 py-2">Kor</th>
                    <th className="px-3 py-2">Foglalkozás</th>
                    <th className="px-3 py-2">Lakcím</th>
                    <th className="px-3 py-2 text-center">Választó</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((r, i) => {
                    const age = ageFromIso(r.sz_datum)
                    return (
                      <tr key={r.id} className="hover:bg-emerald-50/40">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          <span className="inline-flex items-center gap-1.5">
                            {r.ferfi === 1 ? (
                              <User className="size-3.5 text-blue-500" />
                            ) : (
                              <UserRound className="size-3.5 text-rose-500" />
                            )}
                            {fullName(r)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{age !== null ? `${age} év` : '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.foglalkozas || '—'}</td>
                        <td className="max-w-[26rem] truncate px-3 py-2 text-slate-500">
                          {[r.c_szcim, r.c_szam].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.voter_eligible === 1 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <Scale className="size-3" />
                              választó
                              {r.voter_manual_override != null && ' (kézi)'}
                            </span>
                          ) : r.voter_manual_override === 0 ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">
                              kézi: nem
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DesktopShell>
  )
}
