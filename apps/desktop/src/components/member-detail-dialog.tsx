/**
 * MemberDetailDialog — M8.0a (read-only) + M8.0b (edit-mode) +
 * M8.2 soft-delete + M8.4 admin-mezők (2026-04-24).
 *
 * Két állapot:
 *   - 'view': read-only tag-portré, csoportos megjelenítés (eredeti M8.0a);
 *     + M8.2: "Elrejtés / Visszahozás" gomb az `isvisible` flag toggle-re
 *   - 'edit': inline szerkesztő form a `szemely_local` / Supabase `szemely`
 *     írásához. A write-back az `updateSzemelyEntry` sync-helper-en megy,
 *     ami optimistic-local UPDATE + online conditional-revision UPDATE +
 *     outbox-fallback offline módban (M8.0c write-offline ugyanezen a síkon);
 *     + M8.4: "Admin jelzők" szekció (meghalt, voter_eligible, csaladfo,
 *     member_status) — lelkész-szintű jogosultsággal szerkeszthetők, mert
 *     a napi pasztorális munkához kellenek (haláleset, választói regisztráció).
 *
 * UX-elvek (feedback_modal_design_system, feedback_lelkesz_informalas):
 *   - Serif cím, csoportos szekciók, pasztorális feedback-sávok
 *   - Konfliktus esetén világos magyar üzenet (`másik eszközről módosították`)
 *   - Offline esetén világos banner: `sync-re váró` jelzéssel
 *   - Rejtés előtt browser-confirm, pasztorális magyarázattal
 *   - A `cnp`, `congregation_id`, `family_id`, `type`, `isvisible` az edit-formból
 *     kimarad: külön flow vagy admin-felület (M8.3 család-UI, M8.1 új tag)
 *
 * 2026-08-15 (desktop-paritás 2. szelet — „A törlés egy nyelvet beszéljen"):
 *   - Új „Kivezetés" gomb (onRemoveRequest) — a webes négyutas kivezetést
 *     nyitja (elhunyt / elköltözött / kitért / végleges törlés), amely az
 *     anyakönyvi láncot, a kapcsolat-lezárást és a választói frissítést is
 *     elvégzi (members-page → DesktopMemberRemoveDialog).
 *   - A régi „Elrejtés / Visszahozás" toggle MEGMARAD admin-műveletként
 *     (lista-szűrés, nem kivezetés).
 *   - A kézi „Elhunyt" pipa az edit-formból TÖRÖLVE: a régi M8.2-es út az
 *     anyakönyv (temetés-bejegyzés) kihagyásával jelölt halált — pontosan az
 *     az adatminőség-rés, amit a kivezetés-port megszüntet.
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Camera, Check, EyeOff, Eye, Pencil, UserMinus, X } from 'lucide-react'

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label } from '@kartoteka/ui'
import { AvatarEditorBody } from '@kartoteka/ui-app'
import {
  normalizeSzemelyPatch,
  szemelyUpdateInputSchema,
  type SzemelyListRow,
  type SzemelyUpdateInput,
} from '@kartoteka/validations'

import { pullMembersOfOwnCongregation, updateSzemelyEntry } from '../lib/sync'
import { getDesktopSupabase } from '../lib/supabase'
import { fetchSocialAvatarImageDesktop, saveMemberAvatarDesktop } from '../lib/avatar'

interface MemberDetailDialogProps {
  member: SzemelyListRow
  /** A szerkesztés után a parent hívja meg a lista-újratöltést. */
  onSaved?: () => void
  /** Bezárás callback. */
  onClose: () => void
  /** A bejelentkezett felhasználó id-je — a sync-helper-hez kell (pull-hoz). */
  userId: string
  /** Az aktuális szerver-revision (a szemely_local.revision mezőből olvasva). */
  currentRevision: number
  /**
   * 2026-08-15 (2. szelet): a négyutas kivezetés-dialógus megnyitása — a
   * members-page köti be (DesktopMemberRemoveDialog). Ha nincs megadva, a
   * Kivezetés gomb nem jelenik meg (defenzív).
   */
  onRemoveRequest?: () => void
}

type Mode = 'view' | 'edit'

type Banner =
  | { kind: 'success'; text: string }
  | { kind: 'conflict'; text: string }
  | { kind: 'offline'; text: string }
  | { kind: 'error'; text: string }
  | null

export function MemberDetailDialog({
  member: m,
  onSaved,
  onClose,
  userId,
  currentRevision,
  onRemoveRequest,
}: MemberDetailDialogProps) {
  const [mode, setMode] = useState<Mode>('view')
  const [form, setForm] = useState<EditableFields>(() => extractEditable(m))
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)
  // Fénykép-szerkesztő (online művelet) — desktop tag-nézet, a web-paritáshoz.
  const [avatarOpen, setAvatarOpen] = useState(false)

  // A tag-referencia változhat (pl. lista-refresh után); ha változik, reset.
  useEffect(() => {
    setForm(extractEditable(m))
    setBanner(null)
    // view-mode-ba állítunk vissza, ha a parent más tagot küld
    setMode('view')
  }, [m])

  const fullName = useMemo(() => formatFullName(m), [m])
  const age = m.sz_datum ? ageFromIso(m.sz_datum) : null

  /**
   * M8.2 — soft-delete / visszahozás. Az `isvisible` flag-et toggle-eli az
   * `updateSzemelyEntry` sync-helper-en. A lelkész oldalán ez a "Rejtett"
   * lista-szűrőbe teszi / onnan visszahozza a taget.
   *
   * 2026-08-15 (2. szelet): ez ADMIN-művelet maradt (lista-szűrés) — a valódi
   * kivezetés (haláleset, elköltözés, kitérés, törlés) útja a „Kivezetés"
   * gomb, amely az anyakönyvvel összekötött négyutas dialógust nyitja.
   */
  async function handleToggleVisibility() {
    const isCurrentlyVisible = m.isvisible === 1
    const confirmMsg = isCurrentlyVisible
      ? `Elrejted a "${fullName}" nevű tagot a default listából?\n\n` +
        `A tag adatai megmaradnak — a „Rejtett" szűrővel bármikor visszahozhatod. ` +
        `Ez nem halálozási jelzés; használd akkor, ha a tag már nem aktív, ` +
        `de még nem szeretnéd törölni.`
      : `Visszahozod a "${fullName}" nevű tagot a default listába?\n\n` +
        `Újra megjelenik az Aktív / Mind szűrőkben.`
    if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) return

    setSaving(true)
    setBanner(null)
    try {
      const result = await updateSzemelyEntry(
        userId,
        m.id,
        { isvisible: !isCurrentlyVisible },
        currentRevision,
      )
      if (result.conflict) {
        setBanner({
          kind: 'conflict',
          text:
            'Más eszközről módosították időközben — kérlek frissítsd az oldalt, ' +
            'és próbáld újra.',
        })
      } else if (result.queuedToOutbox) {
        setBanner({
          kind: 'offline',
          text: isCurrentlyVisible
            ? 'Elrejtés offline-ban elmentve. A szinkron felküldi, amint online leszel.'
            : 'Visszahozás offline-ban elmentve. Szinkron a következő online-menetben.',
        })
        onSaved?.()
      } else {
        setBanner({
          kind: 'success',
          text: isCurrentlyVisible ? 'A tag elrejtve.' : 'A tag visszahozva.',
        })
        onSaved?.()
        setTimeout(() => onClose(), 800)
      }
    } catch (err: unknown) {
      setBanner({
        kind: 'error',
        text: `Hiba: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setBanner(null)

    // 1. Csak a változott mezőket küldjük el
    const patch = buildPatch(m, form)
    if (Object.keys(patch).length === 0) {
      setBanner({ kind: 'success', text: 'Nincs változás a mentéshez.' })
      setSaving(false)
      setTimeout(() => setMode('view'), 600)
      return
    }

    // 2. Zod-validáció — kliens-oldali early-fail
    const parsed = szemelyUpdateInputSchema.safeParse(patch)
    if (!parsed.success) {
      const firstMsg = parsed.error.issues[0]?.message ?? 'Érvénytelen adat.'
      setBanner({ kind: 'error', text: firstMsg })
      setSaving(false)
      return
    }

    // 3. Normalizálás (üres string → null) + sync
    const normalized = normalizeSzemelyPatch(parsed.data as SzemelyUpdateInput)
    try {
      const result = await updateSzemelyEntry(userId, m.id, normalized, currentRevision)
      if (result.conflict) {
        // Tudatosan NEM hívjuk meg az onSaved-et — különben a parent lista-
        // refresh-ül, új member-objektum érkezik props-ban, és a
        // useEffect[m] reseteli a form-ot → a lelkész elveszíti a félig
        // megírt változtatásait. Inkább a Mégse (Cancel) gombra bízzuk.
        setBanner({
          kind: 'conflict',
          text:
            'Más eszközről módosították ezt a tagot időközben. ' +
            'A „Mégse" gombbal visszaállíthatod a szerver-verziót, vagy ' +
            'újragondolhatod a saját változtatásaidat és újra próbálhatod.',
        })
      } else if (result.queuedToOutbox) {
        // 2026-07-24 (PR-8 review): automatikusra visszaállított felülbírálásnál
        // offline nem tudunk újraszámolni — jelezzük, hogy a flag később frissül.
        const clearedToAutoOffline =
          'voter_manual_override' in normalized && normalized.voter_manual_override === null
        setBanner({
          kind: 'offline',
          text:
            'Elmentettem offline-ban. A szinkron a következő online-menetben küldi fel.' +
            (clearedToAutoOffline
              ? ' A választói jogosultság a következő online újraszámításkor frissül.'
              : ''),
        })
        onSaved?.()
        setTimeout(() => setMode('view'), 1500)
      } else {
        // 2026-07-24 (PR-8 review): ha a felülbírálást AUTOMATIKUSRA állították
        // vissza, a voter_eligible a régi kényszerített értéken ragadna minden
        // felületen — online azonnal újraszámoltatjuk (best effort, a webes
        // setVoterOverride mintája), és delta-pullal frissítjük a lokál cache-t.
        if ('voter_manual_override' in normalized && normalized.voter_manual_override === null && m.congregation_id) {
          try {
            const supabase = getDesktopSupabase()
            await supabase.rpc('recompute_voter_eligibility', { p_congregation_id: m.congregation_id })
            await pullMembersOfOwnCongregation(userId, 'delta')
          } catch {
            /* best effort — a webes „Jogosultság frissítése" pótolja */
          }
        }
        setBanner({ kind: 'success', text: 'A változás mentve.' })
        onSaved?.()
        setTimeout(() => setMode('view'), 800)
      }
    } catch (err: unknown) {
      setBanner({
        kind: 'error',
        text: `Hiba mentéskor: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setForm(extractEditable(m))
    setBanner(null)
    setMode('view')
  }

  // v0.5.4 — webes paritás: avatar inicializálás + gradient
  const initials = `${(m.csaladnev || m.k_nev || '?')[0] ?? '?'}${(m.k_nev || '?')[0] ?? '?'}`.toUpperCase()
  const avatarGradient = m.ferfi
    ? 'from-sky-400 via-blue-500 to-indigo-600'
    : 'from-rose-400 via-pink-500 to-fuchsia-600'

  return (
    <>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="member-detail-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && mode === 'view') onClose()
      }}
    >
      <div className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(247,251,250,0.98)_100%)] shadow-[0_36px_90px_-40px_rgba(14,52,48,0.38)] ring-1 ring-slate-200/70">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-violet-200/35 blur-3xl" />
          <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-teal-200/30 blur-3xl" />
        </div>

        {/* Bezárás gomb */}
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="absolute right-3 top-3 z-20 inline-flex size-9 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-slate-500 shadow-sm transition hover:text-slate-700 disabled:opacity-50 sm:right-4 sm:top-4"
          aria-label="Bezárás"
        >
          <X className="size-4" />
        </button>

        {/* Fejléc — webes paritás: avatar + cím + chipek */}
        <div className="relative border-b border-slate-200/70 px-5 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="min-w-0 pr-12 sm:pr-14">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700/70">
              Tag-portré
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
              {mode === 'view' && m.congregation_id ? (
                <button
                  type="button"
                  onClick={() => setAvatarOpen(true)}
                  title="Fénykép beállítása"
                  className={`group relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br ${avatarGradient} text-base font-bold text-white shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem]`}
                >
                  {initials}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                    <Camera className="size-5" />
                  </span>
                </button>
              ) : (
                <div
                  className={`flex size-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-gradient-to-br ${avatarGradient} text-base font-bold text-white shadow-[0_20px_40px_-26px_rgba(15,74,66,0.55)] sm:size-16 sm:rounded-[1.35rem]`}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2
                  id="member-detail-title"
                  className="font-serif text-[1.8rem] leading-[1.08] text-slate-800 sm:text-[2rem]"
                >
                  {fullName}
                  {m.meghalt === 1 && <span className="ml-2 text-lg text-slate-500">†</span>}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {m.cnp && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">CNP</span>
                      <span className="font-mono">{m.cnp}</span>
                    </span>
                  )}
                  {age !== null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 shadow-sm">
                      {age} éves
                    </span>
                  )}
                  {m.allapot && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 shadow-sm">
                      {m.allapot}
                    </span>
                  )}
                  {m.csaladfo === 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 shadow-sm">
                      👑 Családfő
                    </span>
                  )}
                  {m.voter_eligible === 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 shadow-sm">
                      Választó
                    </span>
                  )}
                  {m.isvisible === 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                      Rejtett
                    </span>
                  )}
                  {m.member_status && m.member_status !== 'aktív' && m.member_status !== 'aktiv' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-800 shadow-sm">
                      {m.member_status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Banner */}
        {banner && <DialogBanner banner={banner} />}

        {/* Tartalom — relatív, hogy a háttér-blur dekoráció szépen látsszon */}
        <div className="relative max-h-[calc(92vh-12rem)] space-y-4 overflow-y-auto p-5 sm:p-6">
          {mode === 'view' ? (
            <ViewBody member={m} />
          ) : (
            <EditBody form={form} setForm={setForm} disabled={saving} />
          )}

          {m.megjegyzes && mode === 'view' && (
            <DetailGroup title="Megjegyzés">
              <p className="whitespace-pre-wrap text-sm text-slate-800">{m.megjegyzes}</p>
            </DetailGroup>
          )}

          <p className="text-[10px] italic text-slate-400">
            Utolsó frissítés a szerverről: {formatHuDateTime(m.updated_at)}
            {' · '}Revision: {currentRevision}
          </p>
        </div>

        {/* Akciók */}
        <div className="relative flex justify-between gap-2 border-t border-slate-200/70 bg-white/60 p-4 backdrop-blur-sm">
          {mode === 'view' ? (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={() => setMode('edit')}
                  disabled={saving}
                  className="gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_16px_30px_-22px_rgba(109,40,217,0.55)] hover:from-violet-600 hover:to-indigo-700"
                >
                  <Pencil className="size-4" />
                  Szerkesztés
                </Button>
                {/* 2026-08-15 (2. szelet): a webes négyutas kivezetés —
                    elhunyt / elköltözött / kitért / végleges törlés, az
                    anyakönyvi lánccal együtt. Online kapcsolat kell hozzá
                    (a dialógus offline hangosan jelzi). */}
                {onRemoveRequest && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onRemoveRequest}
                    disabled={saving}
                    className="border-rose-300 text-rose-800 hover:bg-rose-50"
                    title="Kivezetés: haláleset, elköltözés, kitérés vagy végleges törlés — anyakönyvi bejegyzéssel és a választói névjegyzék frissítésével."
                  >
                    <UserMinus className="mr-2 size-4" />
                    Kivezetés
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleToggleVisibility}
                  disabled={saving}
                  className={
                    m.isvisible === 1
                      ? 'border-amber-300 text-amber-900 hover:bg-amber-50'
                      : 'border-sky-300 text-sky-900 hover:bg-sky-50'
                  }
                  title={
                    m.isvisible === 1
                      ? 'A tag eltűnik a default listából — visszahozható a Rejtett szűrővel.'
                      : 'A tag visszakerül a default listába.'
                  }
                >
                  {m.isvisible === 1 ? (
                    <>
                      <EyeOff className="mr-2 size-4" />
                      Elrejtés
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 size-4" />
                      Visszahozás
                    </>
                  )}
                </Button>
              </div>
              <Button
                type="button"
                onClick={onClose}
                variant="outline"
                className="rounded-xl border-slate-200 bg-white/90"
              >
                Bezárás
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                Mégse
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                <Check className="mr-2 size-4" />
                {saving ? 'Mentés…' : 'Mentés'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>

    {/* Fénykép + közösségi link szerkesztő (online művelet) — web-paritás */}
    {avatarOpen && m.congregation_id && (
      <Dialog open onOpenChange={(o) => { if (!o) setAvatarOpen(false) }}>
        <DialogContent className="z-[70] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fénykép és közösségi kapcsolat</DialogTitle>
          </DialogHeader>
          <AvatarEditorBody
            personName={fullName}
            onFetchFromSocial={(url) => fetchSocialAvatarImageDesktop(url)}
            onSave={(params) => saveMemberAvatarDesktop(m.id, m.congregation_id as string, params)}
            onSaved={() => {
              setAvatarOpen(false)
              onSaved?.()
            }}
          />
        </DialogContent>
      </Dialog>
    )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Read-only body
// ─────────────────────────────────────────────────────────────────────────

function ViewBody({ member: m }: { member: SzemelyListRow }) {
  return (
    <>
      <DetailGroup title="Személyes adatok">
        <DetailRow label="Keresztnév" value={m.k_nev} />
        <DetailRow label="Családnév" value={m.csaladnev} />
        <DetailRow label="Születési családnév" value={m.szcs_nev} />
        {m.ferfi === 0 && <DetailRow label="Férjezett név" value={m.ferjk_nev} />}
        <DetailRow label="Nem" value={m.ferfi === 1 ? 'férfi' : 'nő'} />
        <DetailRow label="Születési dátum" value={formatHuDate(m.sz_datum)} />
        <DetailRow label="Családi állapot" value={m.allapot} />
        <DetailRow label="Member status" value={m.member_status} />
      </DetailGroup>

      <DetailGroup title="Származás">
        <DetailRow label="Apa neve" value={m.apjaneve} />
        <DetailRow label="Anya neve" value={m.anyjaneve} />
      </DetailGroup>

      <DetailGroup title="Cím">
        <DetailRow label="Teljes cím" value={m.c_szcim} />
        <DetailRow label="Házszám" value={m.c_szam} />
        <DetailRow label="Tömbház" value={m.c_tombhaz} />
        <DetailRow label="Lépcsőház" value={m.c_lepcsohaz} />
        <DetailRow label="Emelet" value={m.c_emelet} />
        <DetailRow label="Ajtó" value={m.c_ajto} />
      </DetailGroup>

      <DetailGroup title="Elérhetőség">
        <DetailRow label="Telefon" value={m.telefon} mono />
        <DetailRow label="E-mail" value={m.email} />
      </DetailGroup>

      <DetailGroup title="Identitás">
        <DetailRow label="Vallás" value={m.vallas} />
        <DetailRow label="Foglalkozás" value={m.foglalkozas} />
        <DetailRow label="Nemzetiség" value={m.nemzetiseg} />
      </DetailGroup>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Edit body (inline form)
// ─────────────────────────────────────────────────────────────────────────

type EditableFields = {
  k_nev: string
  csaladnev: string
  szcs_nev: string
  ferjk_nev: string
  allapot: string
  sz_datum: string
  apjaneve: string
  anyjaneve: string
  c_szcim: string
  c_szam: string
  c_tombhaz: string
  c_lepcsohaz: string
  c_emelet: string
  c_ajto: string
  telefon: string
  email: string
  vallas: string
  foglalkozas: string
  nemzetiseg: string
  megjegyzes: string
  // M8.4 admin-jelzők (boolean → string '0'/'1' a form-state-ben; patch-be
  // boolean-ként). 2026-08-15 (2. szelet): a `meghalt` KIKERÜLT — a haláleset
  // a Kivezetés gombbal rögzítendő (anyakönyvi lánccal), nem kézi pipával.
  /** 2026-07-24 (PR-8): választói KÉZI felülbírálás — '' = automatikus,
   *  '1' = kézzel választó, '0' = kézzel nem választó. A voter_eligible-t
   *  közvetlenül többé nem szerkesztjük (a webes recompute felülírná). */
  voter_override: string
  csaladfo: string
  member_status: string
}

/** Lelkészi szempontból releváns `member_status` értékek + "egyéb" biztosítóháló. */
const MEMBER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'aktív', label: 'Aktív' },
  { value: 'kitért', label: 'Kitért' },
  { value: 'törölt', label: 'Törölt' },
  { value: 'mas_vallasu', label: 'Más vallású' },
]

function EditBody({
  form,
  setForm,
  disabled,
}: {
  form: EditableFields
  setForm: (f: EditableFields) => void
  disabled: boolean
}) {
  function upd<K extends keyof EditableFields>(key: K, value: string) {
    setForm({ ...form, [key]: value })
  }

  return (
    <>
      <EditGroup title="Személyes adatok">
        <EditField label="Keresztnév" id="k_nev" value={form.k_nev} onChange={(v) => upd('k_nev', v)} disabled={disabled} />
        <EditField label="Családnév" id="csaladnev" value={form.csaladnev} onChange={(v) => upd('csaladnev', v)} disabled={disabled} />
        <EditField label="Születési családnév" id="szcs_nev" value={form.szcs_nev} onChange={(v) => upd('szcs_nev', v)} disabled={disabled} />
        <EditField label="Férjezett név" id="ferjk_nev" value={form.ferjk_nev} onChange={(v) => upd('ferjk_nev', v)} disabled={disabled} />
        <EditField label="Születési dátum" id="sz_datum" type="date" value={form.sz_datum} onChange={(v) => upd('sz_datum', v)} disabled={disabled} />
        <EditField label="Családi állapot" id="allapot" value={form.allapot} onChange={(v) => upd('allapot', v)} disabled={disabled} placeholder="pl. nőtlen, házas, özvegy…" />
      </EditGroup>

      <EditGroup title="Származás">
        <EditField label="Apa neve" id="apjaneve" value={form.apjaneve} onChange={(v) => upd('apjaneve', v)} disabled={disabled} />
        <EditField label="Anya neve" id="anyjaneve" value={form.anyjaneve} onChange={(v) => upd('anyjaneve', v)} disabled={disabled} />
      </EditGroup>

      <EditGroup title="Cím">
        <EditField label="Teljes cím" id="c_szcim" value={form.c_szcim} onChange={(v) => upd('c_szcim', v)} disabled={disabled} placeholder="utca, helység, irányítószám" />
        <div className="grid grid-cols-2 gap-2">
          <EditField label="Házszám" id="c_szam" value={form.c_szam} onChange={(v) => upd('c_szam', v)} disabled={disabled} compact />
          <EditField label="Tömbház" id="c_tombhaz" value={form.c_tombhaz} onChange={(v) => upd('c_tombhaz', v)} disabled={disabled} compact />
          <EditField label="Lépcsőház" id="c_lepcsohaz" value={form.c_lepcsohaz} onChange={(v) => upd('c_lepcsohaz', v)} disabled={disabled} compact />
          <EditField label="Emelet" id="c_emelet" value={form.c_emelet} onChange={(v) => upd('c_emelet', v)} disabled={disabled} compact />
          <EditField label="Ajtó" id="c_ajto" value={form.c_ajto} onChange={(v) => upd('c_ajto', v)} disabled={disabled} compact />
        </div>
      </EditGroup>

      <EditGroup title="Elérhetőség">
        <EditField label="Telefon" id="telefon" value={form.telefon} onChange={(v) => upd('telefon', v)} disabled={disabled} placeholder="+40 …" />
        <EditField label="E-mail" id="email" type="email" value={form.email} onChange={(v) => upd('email', v)} disabled={disabled} />
      </EditGroup>

      <EditGroup title="Identitás">
        <EditField label="Vallás" id="vallas" value={form.vallas} onChange={(v) => upd('vallas', v)} disabled={disabled} />
        <EditField label="Foglalkozás" id="foglalkozas" value={form.foglalkozas} onChange={(v) => upd('foglalkozas', v)} disabled={disabled} />
        <EditField label="Nemzetiség" id="nemzetiseg" value={form.nemzetiseg} onChange={(v) => upd('nemzetiseg', v)} disabled={disabled} />
      </EditGroup>

      <EditGroup title="Megjegyzés">
        <textarea
          id="megjegyzes"
          value={form.megjegyzes}
          onChange={(e) => upd('megjegyzes', e.currentTarget.value)}
          disabled={disabled}
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </EditGroup>

      <EditGroup title="Tag-jelzők (adminisztratív)">
        <p className="-mt-1 text-[10px] italic text-slate-500">
          Ezek pasztorális jelzők — haláleset, választói státusz, családfő-szerep,
          tagsági kategória. Ha bizonytalan vagy egy beállításban, kérdezd meg
          előbb a gondnokot vagy a presbitériumot.
        </p>

        {/* 2026-08-15 (2. szelet): a kézi „Elhunyt" pipa TÖRÖLVE — az M8.2-es
            út az anyakönyv (temetés-bejegyzés) kihagyásával jelölt halált.
            A haláleset a tag-portré „Kivezetés" gombjával rögzítendő, amely a
            temetés-bejegyzést, a kapcsolat-lezárást és a választói frissítést
            is elvégzi. */}
        <p className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-[11px] leading-tight text-slate-500">
          Haláleset, elköltözés, kitérés vagy törlés rögzítése: zárd be a
          szerkesztést, és használd a <strong>Kivezetés</strong> gombot — az az
          anyakönyvi bejegyzéssel együtt vezeti ki a tagot.
        </p>
        {/* 2026-07-24 (PR-8): a közvetlen voter_eligible-kapcsoló helyett
            felülbírálás-választó — a kézi döntést a webes „Jogosultság
            frissítése" (recompute) is megőrzi. */}
        <div className="grid grid-cols-3 items-center gap-2 pt-1">
          <Label htmlFor="voter_override" className="col-span-1 text-xs text-slate-500">
            Választói jogosultság
          </Label>
          <select
            id="voter_override"
            value={form.voter_override}
            onChange={(e) => upd('voter_override', e.currentTarget.value)}
            disabled={disabled}
            className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Automatikus (a rendszer számítja)</option>
            <option value="1">Kézi felülbírálás: VÁLASZTÓ</option>
            <option value="0">Kézi felülbírálás: nem választó</option>
          </select>
        </div>
        <p className="-mt-1 text-[10px] italic text-slate-500">
          Automatikus módban a jogosultságot a rendszer számítja (18+, aktív tag,
          a webes beállítások szerint). A kézi felülbírálás mindkét irányban
          megmarad a jogosultság-újraszámítás után is.
        </p>
        <CheckboxRow
          id="csaladfo"
          label="Családfő"
          hint="A család hivatalos képviselője — rendszerint egy a család-egységben."
          checked={form.csaladfo === '1'}
          onChange={(v) => upd('csaladfo', v ? '1' : '0')}
          disabled={disabled}
        />

        <div className="grid grid-cols-3 items-center gap-2 pt-1">
          <Label htmlFor="member_status" className="col-span-1 text-xs text-slate-500">
            Tagsági kategória
          </Label>
          <select
            id="member_status"
            value={form.member_status}
            onChange={(e) => upd('member_status', e.currentTarget.value)}
            disabled={disabled}
            className="col-span-2 h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">— nincs beállítva —</option>
            {MEMBER_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </EditGroup>
    </>
  )
}

function CheckboxRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50/40 px-3 py-2 ${
        disabled ? 'opacity-60' : 'hover:bg-slate-50'
      }`}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 accent-violet-600"
      />
      <div className="flex-1">
        <span className="text-sm font-medium text-slate-900">{label}</span>
        {hint && <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{hint}</p>}
      </div>
    </label>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-komponensek
// ─────────────────────────────────────────────────────────────────────────

function DialogBanner({ banner }: { banner: NonNullable<Banner> }) {
  const style: Record<NonNullable<Banner>['kind'], string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    conflict: 'border-amber-200 bg-amber-50 text-amber-900',
    offline: 'border-sky-200 bg-sky-50 text-sky-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  }
  const icon =
    banner.kind === 'conflict' || banner.kind === 'error' ? (
      <AlertCircle className="size-4 shrink-0" />
    ) : (
      <Check className="size-4 shrink-0" />
    )
  return (
    <div
      role="alert"
      className={`mx-5 mt-4 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${style[banner.kind]}`}
    >
      {icon}
      <span>{banner.text}</span>
    </div>
  )
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-100 bg-white/90 p-4 shadow-[0_14px_28px_-22px_rgba(15,74,66,0.18)]">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-600/80">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function EditGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-100 bg-white/90 p-4 shadow-[0_14px_28px_-22px_rgba(15,74,66,0.18)]">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-600/80">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
}) {
  if (!value) return null
  return (
    <div className="grid grid-cols-3 items-start gap-2 text-sm">
      <span className="col-span-1 text-xs text-slate-500">{label}</span>
      <span
        className={`col-span-2 break-words ${
          mono ? 'font-mono text-xs text-slate-700' : 'font-medium text-slate-800'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function EditField({
  label,
  id,
  value,
  onChange,
  type,
  placeholder,
  disabled,
  compact,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'email' | 'date'
  placeholder?: string
  disabled?: boolean
  compact?: boolean
}) {
  return (
    <div className={compact ? 'space-y-1' : 'grid grid-cols-3 items-center gap-2'}>
      <Label htmlFor={id} className={compact ? 'text-[10px] text-slate-500' : 'col-span-1 text-xs text-slate-500'}>
        {label}
      </Label>
      <Input
        id={id}
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={compact ? 'h-8 text-sm' : 'col-span-2 h-8 text-sm'}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Helper-ek (SzemelyListRow ↔ EditableFields + patch + formázás)
// ─────────────────────────────────────────────────────────────────────────

const EDITABLE_TEXT_KEYS: (keyof EditableFields)[] = [
  'k_nev',
  'csaladnev',
  'szcs_nev',
  'ferjk_nev',
  'allapot',
  'sz_datum',
  'apjaneve',
  'anyjaneve',
  'c_szcim',
  'c_szam',
  'c_tombhaz',
  'c_lepcsohaz',
  'c_emelet',
  'c_ajto',
  'telefon',
  'email',
  'vallas',
  'foglalkozas',
  'nemzetiseg',
  'megjegyzes',
  'member_status',
]

/**
 * Integer-boolean mezők a `szemely_local`-on (0/1) — a form-state-ben '0'/'1'
 * stringként tároljuk a kezelés egységessége miatt, a patch-be konvertáljuk
 * valódi `boolean`-ná.
 * 2026-08-15 (2. szelet): a `meghalt` kikerült — lásd az EditableFields
 * kommentjét (Kivezetés-gomb az út, nem kézi pipa).
 */
const EDITABLE_BOOL_KEYS: (keyof EditableFields)[] = [
  'csaladfo',
]

function extractEditable(m: SzemelyListRow): EditableFields {
  const out = {} as EditableFields
  const row = m as unknown as Record<string, unknown>
  for (const key of EDITABLE_TEXT_KEYS) {
    const raw = row[key]
    out[key] = typeof raw === 'string' ? raw : raw == null ? '' : String(raw)
  }
  for (const key of EDITABLE_BOOL_KEYS) {
    const raw = row[key]
    // szemely_local: integer 0/1 → '0'/'1' string
    out[key] = raw === 1 || raw === '1' || raw === true ? '1' : '0'
  }
  // 2026-07-24 (PR-8): felülbírálás-állapot (NULL=auto, 1/0=kézi)
  out.voter_override =
    m.voter_manual_override === 1 ? '1' : m.voter_manual_override === 0 ? '0' : ''
  return out
}

/**
 * A `SzemelyUpdateInput`-kompatibilis patch. Csak azokat a mezőket tartja
 * meg, amelyek ténylegesen változtak — így a Supabase UPDATE csak a delta-t
 * küldi, és a revision-trigger nem fut feleslegesen.
 *
 * A boolean mezőket explicit `boolean`-ná konvertáljuk (a Supabase `boolean`
 * oszlopot vár, nem integer-t); a text-mezőket változatlanul hagyjuk.
 */
function buildPatch(m: SzemelyListRow, form: EditableFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const row = m as unknown as Record<string, unknown>

  for (const key of EDITABLE_TEXT_KEYS) {
    const original = row[key]
    const originalStr = original == null ? '' : String(original)
    if (originalStr !== form[key]) {
      // Az üres string tovább megy, a `normalizeSzemelyPatch` konvertálja null-ra
      patch[key] = form[key]
    }
  }

  for (const key of EDITABLE_BOOL_KEYS) {
    const original = row[key]
    const originalBool = original === 1 || original === '1' || original === true
    const formBool = form[key] === '1'
    if (originalBool !== formBool) {
      patch[key] = formBool
    }
  }

  // 2026-07-24 (PR-8): választói felülbírálás — kézi állításnál a
  // voter_eligible is azonnal követi (a webes recompute az override-ot
  // megőrzi; automatikusra visszaállítva a következő recompute dönt).
  const originalOverride =
    m.voter_manual_override === 1 ? '1' : m.voter_manual_override === 0 ? '0' : ''
  if (originalOverride !== form.voter_override) {
    patch.voter_manual_override =
      form.voter_override === '' ? null : form.voter_override === '1' ? 1 : 0
    if (form.voter_override !== '') {
      patch.voter_eligible = form.voter_override === '1'
    }
  }

  return patch
}

function ageFromIso(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 ? age : null
}

function formatHuDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`
}

function formatHuDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${formatHuDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatFullName(m: SzemelyListRow): string {
  const last = (m.ferfi === 0 && m.ferjk_nev) || m.csaladnev || m.szcs_nev || ''
  const first = m.k_nev || ''
  const combined = [last, first].filter(Boolean).join(' ')
  return combined || '(névtelen)'
}
