'use client'

import {
  AlertCircle,
  Home,
  MapPin,
  Sparkles,
  User,
  UserCircle2,
  Users,
} from 'lucide-react'

/**
 * 2026-06-02 — Egységes „családi karton" megjelenítés.
 *
 * Egy elegáns, papír-szerű kártya, ami a család aktuális állapotát mutatja:
 * családfő + házastárs + gyerekek + cím + körzet, és **inline jelzi a hiányzó
 * adatokat**, hogy a felhasználó tudja mit kell még pótolni.
 *
 * Két fő használat:
 *   1. `FamilyFormDialog` jobb oszlopában — élő előnézet, ahogy a felhasználó
 *      gépeli/válogatja az adatokat. Frissül minden state-változásra.
 *   2. `FamiliesTab` „Kártyák" nézetében — a meglévő családok rácsban.
 *
 * A karton stílusa a kereszteleői emléklap mintájára épül: lekerekített
 * sarkok, finom shadow, halvány gradient háttér, dekoratív tipográfia
 * (Cormorant Garamond serif).
 */

interface FamilyMember {
  id: number
  name: string
  /** Opcionális kor — a kártyán "(X éves)" megjelenítéshez. */
  age?: number | null
  /** Elhunyt jelölés — szürkül és „†" symbol. */
  meghalt?: boolean
}

export interface FamilyCardData {
  /** A család „családneve" — a családfő vagy házastárs családnevéből számolva. */
  familyName: string | null
  husband: FamilyMember | null
  wife: FamilyMember | null
  children: FamilyMember[]
  street: string | null
  houseNumber: string | null
  districtName: string | null
  /** Ha true, a kártya „szerkesztés folyamatban" jelzéssel (kis amber sav). */
  isPreview?: boolean
  /** Ha false, a karton szürke (inaktív/törölt). */
  isActive?: boolean
}

interface FamilyCardPreviewProps {
  data: FamilyCardData
  /** Kompakt mód: kisebb fontok, kevesebb padding (kártya-rácshoz). */
  compact?: boolean
  /** Kattintható? */
  onClick?: () => void
}

export function FamilyCardPreview({ data, compact, onClick }: FamilyCardPreviewProps) {
  const isActive = data.isActive !== false
  const missing = collectMissingFields(data)
  const hasMissing = missing.length > 0

  const cardClasses = [
    'relative rounded-2xl border bg-gradient-to-br shadow-sm transition-shadow',
    isActive
      ? 'border-amber-200 from-amber-50/40 via-white to-emerald-50/40'
      : 'border-slate-200 from-slate-50 via-white to-slate-50 opacity-70',
    onClick ? 'cursor-pointer hover:shadow-md' : '',
    compact ? 'p-3' : 'p-5',
  ].join(' ')

  return (
    <div className={cardClasses} onClick={onClick} role={onClick ? 'button' : undefined}>
      {data.isPreview && (
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          <Sparkles className="size-2.5" />
          Élő előnézet
        </div>
      )}

      {/* Felső sáv: család neve + cím */}
      <div className={compact ? 'mb-2' : 'mb-3'}>
        <h3 className={`font-heading font-semibold text-slate-800 ${compact ? 'text-base' : 'text-xl'}`}>
          {data.familyName ?? <span className="text-slate-400">— család neve hiányzik —</span>}
          {data.familyName && ' család'}
        </h3>
        {(data.street || data.houseNumber) ? (
          <div className={`flex items-center gap-1 text-slate-500 ${compact ? 'text-xs' : 'text-sm'} mt-0.5`}>
            <MapPin className={compact ? 'size-3' : 'size-3.5'} />
            <span>
              {data.street || <em className="text-amber-700">— utca hiányzik —</em>}
              {data.houseNumber ? ` ${data.houseNumber}` : ''}
            </span>
          </div>
        ) : (
          <div className={`flex items-center gap-1 text-amber-700 ${compact ? 'text-xs' : 'text-sm'} mt-0.5`}>
            <MapPin className={compact ? 'size-3' : 'size-3.5'} />
            <em>cím hiányzik</em>
          </div>
        )}
      </div>

      {/* Felnőttek: családfő + házastárs */}
      <div className={`space-y-${compact ? '1' : '1.5'}`}>
        {data.husband ? (
          <MemberRow icon={<UserCircle2 className="size-3.5 text-blue-600" />}
            roleColor="text-blue-700"
            roleName="Családfő"
            member={data.husband}
            compact={compact}
          />
        ) : (
          <MissingRow color="blue" roleName="Családfő" compact={compact} />
        )}
        {data.wife ? (
          <MemberRow icon={<UserCircle2 className="size-3.5 text-pink-600" />}
            roleColor="text-pink-700"
            roleName="Házastárs"
            member={data.wife}
            compact={compact}
          />
        ) : (
          <MissingRow color="pink" roleName="Házastárs" optional compact={compact} />
        )}
      </div>

      {/* Gyermekek lista */}
      {data.children.length > 0 ? (
        <div className={`${compact ? 'mt-2' : 'mt-3'} border-t border-slate-100 pt-${compact ? '2' : '3'}`}>
          <div className={`flex items-center gap-1 ${compact ? 'text-xs' : 'text-sm'} font-medium text-slate-600 mb-1`}>
            <Users className={compact ? 'size-3' : 'size-3.5'} />
            Gyermekek ({data.children.length})
          </div>
          <ul className="space-y-0.5">
            {data.children.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'} text-slate-700`}
              >
                <User className={compact ? 'size-2.5' : 'size-3'} />
                <span className={c.meghalt ? 'text-slate-400 line-through' : ''}>
                  {c.meghalt && '† '}
                  {c.name}
                  {c.age != null && (
                    <span className="text-slate-400"> ({c.age} éves)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={`${compact ? 'mt-2' : 'mt-3'} ${compact ? 'text-xs' : 'text-sm'} text-slate-400 italic`}>
          Nincs gyermek rögzítve.
        </div>
      )}

      {/* Körzet badge */}
      <div className={`${compact ? 'mt-2' : 'mt-3'} flex items-center gap-2`}>
        <Home className={compact ? 'size-3' : 'size-3.5'} />
        {data.districtName ? (
          <span className={`inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 ${compact ? 'text-[10px]' : 'text-xs'} font-medium text-emerald-700`}>
            Körzet: {data.districtName}
          </span>
        ) : (
          <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-slate-400 italic`}>
            Körzet nincs hozzárendelve
          </span>
        )}
      </div>

      {/* Hiányzó adatok figyelmeztetés (csak ha vannak) */}
      {hasMissing && (
        <div className={`${compact ? 'mt-2' : 'mt-3'} rounded-lg border border-amber-200 bg-amber-50/70 ${compact ? 'p-2' : 'p-2.5'}`}>
          <div className={`flex items-start gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'} text-amber-800`}>
            <AlertCircle className={`${compact ? 'size-3' : 'size-3.5'} shrink-0 mt-0.5`} />
            <div>
              <strong className="font-semibold">
                Hiányzó adatok ({missing.length}):
              </strong>{' '}
              {missing.join(', ')}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Alkomponensek

function MemberRow({
  icon,
  roleColor,
  roleName,
  member,
  compact,
}: {
  icon: React.ReactNode
  roleColor: string
  roleName: string
  member: FamilyMember
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
      {icon}
      <span className={`${roleColor} font-semibold`}>{roleName}:</span>
      <span className={member.meghalt ? 'text-slate-400 line-through' : 'text-slate-800'}>
        {member.meghalt && '† '}
        {member.name}
        {member.age != null && (
          <span className="text-slate-400"> ({member.age} éves)</span>
        )}
      </span>
    </div>
  )
}

function MissingRow({
  color,
  roleName,
  optional,
  compact,
}: {
  color: 'blue' | 'pink'
  roleName: string
  optional?: boolean
  compact?: boolean
}) {
  const tone =
    color === 'blue'
      ? 'text-blue-400'
      : 'text-pink-400'
  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'} ${optional ? 'text-slate-400' : tone}`}>
      <UserCircle2 className={compact ? 'size-3' : 'size-3.5'} />
      <span className="italic">
        {roleName}: {optional ? '— nincs megadva (opcionális)' : '— hiányzik'}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Hiányzó adatok detektálás
function collectMissingFields(data: FamilyCardData): string[] {
  const missing: string[] = []
  if (!data.husband && !data.wife) missing.push('családfő/házastárs')
  if (!data.street) missing.push('utca')
  if (!data.houseNumber) missing.push('házszám')
  if (!data.districtName) missing.push('körzet')
  return missing
}

// ─────────────────────────────────────────────────────────────────────────
// Helper: a régi `FamilyRow` (tagnyilv. lista) átkonvertálása `FamilyCardData`-vá
import type { FamilyRow } from '@/app/(dashboard)/tagnyilvantartas/family-actions'
import type { DistrictRow } from '@/app/(dashboard)/tagnyilvantartas/presbyter-actions'

export function familyRowToCardData(
  row: FamilyRow,
  districtMap?: Map<number, string>,
): FamilyCardData {
  const yearNow = new Date().getFullYear()
  const ageOf = (d: string | null | undefined) =>
    d ? yearNow - new Date(d).getFullYear() : null

  const familyName =
    row.ferfi?.csaladnev || row.no?.csaladnev || null

  return {
    familyName,
    husband: row.ferfi
      ? {
          id: row.ferfi.id,
          name: `${row.ferfi.csaladnev} ${row.ferfi.k_nev}`.trim(),
          age: ageOf(row.ferfi.sz_datum),
          meghalt: row.ferfi.meghalt,
        }
      : null,
    wife: row.no
      ? {
          id: row.no.id,
          name: `${row.no.csaladnev} ${row.no.k_nev}`.trim(),
          age: ageOf(row.no.sz_datum),
          meghalt: row.no.meghalt,
        }
      : null,
    children: [], // a lista-nézetben nem hozzuk be (több query lenne); a részletek dialog mutatja
    street: row.utca?.name ?? null,
    houseNumber: row.c_szam,
    districtName:
      row.id_csoport != null && districtMap ? districtMap.get(row.id_csoport) ?? null : null,
    isActive: row.isaktiv,
  }
}

export function districtsToMap(districts: DistrictRow[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const d of districts) m.set(d.id, d.nev)
  return m
}
