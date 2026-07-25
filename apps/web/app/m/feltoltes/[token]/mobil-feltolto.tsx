'use client'

/**
 * Iktató F8d — MOBIL FELTÖLTŐ (publikus, bejelentkezés nélküli oldal).
 *
 * A desktopon megjelenített QR-kód ide vezet. Az egyetlen belépő a rövid
 * életű token (az URL utolsó szegmense) — a lap SEMMILYEN személyes adatot
 * nem kér és nem tárol, bejelentkezés nélkül működik.
 *
 * Menete:
 *   1. betöltéskor  → qr_session_lookup RPC (anon kliens) — érvénytelen/lejárt
 *                     tokenre barátságos hibaoldal, a szerver magyar üzenetével;
 *   2. „Fotó készítése" → a telefon hátsó kamerája (capture='environment');
 *   3. a kép kliens-oldalon tömörödik (2500 px, JPEG q0,8) és megkapja a
 *      digitális iktató-pecsétet (footer-strip — sosem takar tartalmat);
 *   4. feltöltés az anon klienssel a 'qr-staging/{session_id}/{uuid}.jpg' útra
 *      (a storage-policy CSAK ezt engedi), majd qr_register_upload RPC, amely
 *      a csatolmány-sort a MUNKAMENET gyülekezetével/iratával írja;
 *   5. több kép egymás után, a munkamenet darab-limitjéig.
 *
 * ⚠️ A tokent sehol nem naplózzuk és nem jelenítjük meg.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Stamp,
} from 'lucide-react'

import {
  compressDocumentImage,
  PecsetHiba,
  stampImageFooterStrip,
  type PecsetAdat,
} from '@/lib/iktato/pecset'

// ─────────────────────────────────────────────────────────────────
// Konstansok — a DB/bucket kontraktussal egyezően
// ─────────────────────────────────────────────────────────────────

const BUCKET = 'iktato-csatolmanyok'
const MAX_BYTES = 10 * 1024 * 1024
const ENGEDETT_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const

/**
 * A pecsét „gyülekezet" sora. A bejelentkezés nélküli qr_session_lookup
 * szándékosan nem ad ki gyülekezet-nevet, ezért a telefonon az alkalmazás
 * neve szerepel — az azonosító adat (iktatószám + dátum) így is a képen van.
 */
const PECSET_FORRAS = 'Kartotéka iktató'

interface MunkamenetAdat {
  sessionId: string
  iktatoszam: string
  maxFiles: number
  uploadedCount: number
  expiresAt: string
}

interface FeltoltottOldal {
  id: string
  nev: string
  elonezetUrl: string
  oldalSorszam: number | null
}

export function MobilFeltolto({ token }: { token: string }) {
  // Anon (cookie- és session-mentes) kliens — a telefonon senki sincs
  // bejelentkezve, és ha mégis, akkor sem az ő jogaival dolgozunk.
  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
      ),
    [],
  )

  const [allapot, setAllapot] = useState<'betolt' | 'hiba' | 'kesz'>('betolt')
  const [hiba, setHiba] = useState<string | null>(null)
  const [munkamenet, setMunkamenet] = useState<MunkamenetAdat | null>(null)
  const [darab, setDarab] = useState(0)
  const [oldalak, setOldalak] = useState<FeltoltottOldal[]>([])
  const [folyamatban, setFolyamatban] = useState<{ kesz: number; osszes: number } | null>(null)
  const [sorHibak, setSorHibak] = useState<string[]>([])
  const [figyelmeztetesek, setFigyelmeztetesek] = useState<string[]>([])
  const [hatralevoMp, setHatralevoMp] = useState<number | null>(null)

  const kameraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)
  // Az előnézet-URL-eket kilépéskor felszabadítjuk (memória-szivárgás ellen).
  const elonezetUrlRef = useRef<string[]>([])

  // ── 1) Munkamenet felderítése ────────────────────────────────
  useEffect(() => {
    let megszakitva = false
    async function betolt() {
      const { data, error } = await supabase.rpc('qr_session_lookup', { p_token: token })
      if (megszakitva) return
      if (error) {
        setHiba(error.message || 'A feltöltési munkamenet nem érhető el.')
        setAllapot('hiba')
        return
      }
      const adat = (data || {}) as {
        session_id?: string
        iratszam?: string
        max_files?: number
        uploaded_count?: number
        expires_at?: string
      }
      if (!adat.session_id) {
        setHiba('A feltöltési munkamenet nem érvényes — kérj új QR-kódot az asztali gépen.')
        setAllapot('hiba')
        return
      }
      setMunkamenet({
        sessionId: adat.session_id,
        iktatoszam: adat.iratszam || '—',
        maxFiles: adat.max_files ?? 20,
        uploadedCount: adat.uploaded_count ?? 0,
        expiresAt: adat.expires_at || '',
      })
      setDarab(adat.uploaded_count ?? 0)
      setAllapot('kesz')
    }
    void betolt()
    return () => {
      megszakitva = true
    }
  }, [supabase, token])

  // ── 2) Visszaszámláló ────────────────────────────────────────
  useEffect(() => {
    if (!munkamenet?.expiresAt) return
    const lejar = Date.parse(munkamenet.expiresAt)
    if (!Number.isFinite(lejar)) return
    const frissit = () => setHatralevoMp(Math.max(0, Math.round((lejar - Date.now()) / 1000)))
    frissit()
    const id = window.setInterval(frissit, 1000)
    return () => window.clearInterval(id)
  }, [munkamenet?.expiresAt])

  // Előnézet-URL-ek felszabadítása kilépéskor
  useEffect(() => {
    const urlLista = elonezetUrlRef.current
    return () => {
      for (const url of urlLista) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* best-effort */
        }
      }
    }
  }, [])

  const lejart = hatralevoMp !== null && hatralevoMp <= 0
  const betelt = munkamenet !== null && darab >= munkamenet.maxFiles
  const dolgozik = folyamatban !== null

  // ── 3) Fájlok feldolgozása: tömörítés → pecsét → feltöltés → regisztrálás ──
  const feldolgoz = useCallback(
    async (fajlok: File[]) => {
      if (!munkamenet || fajlok.length === 0) return
      setSorHibak([])
      setFigyelmeztetesek([])
      const hibak: string[] = []
      const intesek: string[] = []
      let kesz = 0
      setFolyamatban({ kesz: 0, osszes: fajlok.length })

      // A pecsét dátuma a telefon helyi napja (a képre kerülő adat).
      const maiDatum = new Intl.DateTimeFormat('hu-HU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date())

      let helyiDarab = darab

      for (const eredeti of fajlok) {
        if (helyiDarab >= munkamenet.maxFiles) {
          hibak.push(
            `${eredeti.name}: elérted a munkamenet korlátját (${munkamenet.maxFiles} kép) — az asztali gépen indíts új munkamenetet.`,
          )
          continue
        }

        // a) Tömörítés (EXIF-orientáció + iOS canvas-plafon: a könyvtár kezeli)
        let fajl = eredeti
        try {
          fajl = await compressDocumentImage(eredeti)
        } catch (err) {
          if (err instanceof PecsetHiba) {
            intesek.push(`${eredeti.name}: a tömörítés nem sikerült — az eredeti kép megy fel.`)
          } else {
            hibak.push(`${eredeti.name}: a kép feldolgozása nem sikerült.`)
            continue
          }
        }

        // b) Digitális iktató-pecsét (footer-strip — tartalmat sosem takar)
        const pecset: PecsetAdat = {
          iktatoszam: munkamenet.iktatoszam,
          datum: maiDatum,
          iratcsomo: null,
          gyulekezet: PECSET_FORRAS,
        }
        try {
          fajl = await stampImageFooterStrip(fajl, pecset)
        } catch (err) {
          intesek.push(
            `${eredeti.name}: a pecsételés nem sikerült${
              err instanceof PecsetHiba ? ` (${err.message})` : ''
            } — a kép pecsét nélkül megy fel.`,
          )
        }

        // c) Utólagos ellenőrzés (a bucket 10 MB / 4 MIME korlátja)
        if (!(ENGEDETT_MIME as readonly string[]).includes(fajl.type)) {
          hibak.push(
            `${eredeti.name}: nem támogatott fájltípus (${fajl.type || 'ismeretlen'}) — JPEG, PNG vagy WebP kép tölthető fel.`,
          )
          continue
        }
        if (fajl.size === 0) {
          hibak.push(`${eredeti.name}: a fájl üres (0 bájt).`)
          continue
        }
        if (fajl.size > MAX_BYTES) {
          hibak.push(`${eredeti.name}: túl nagy (${(fajl.size / 1024 / 1024).toFixed(1)} MB) — a limit 10 MB.`)
          continue
        }

        // d) Feltöltés a kötelező 'qr-staging/{session_id}/…' útra
        const ut = `qr-staging/${munkamenet.sessionId}/${ujAzonosito()}.${kiterjesztes(fajl.type)}`
        const { error: feltoltesHiba } = await supabase.storage
          .from(BUCKET)
          .upload(ut, fajl, { contentType: fajl.type, upsert: false })
        if (feltoltesHiba) {
          hibak.push(`${eredeti.name}: a feltöltés sikertelen — ${feltoltesHiba.message}`)
          continue
        }

        // e) Regisztrálás (a gyülekezet/irat a munkamenet-sorból jön)
        const { data: reg, error: regHiba } = await supabase.rpc('qr_register_upload', {
          p_token: token,
          p_storage_path: ut,
          p_file_name: fajl.name,
          p_mime: fajl.type,
          p_meret: fajl.size,
        })
        if (regHiba) {
          hibak.push(`${eredeti.name}: a rögzítés sikertelen — ${regHiba.message}`)
          continue
        }

        const eredmeny = (reg || {}) as {
          csatolmany_id?: string
          oldal_sorszam?: number
          uploaded_count?: number
          ismetelt?: boolean
        }
        helyiDarab = eredmeny.uploaded_count ?? helyiDarab + 1
        setDarab(helyiDarab)

        const elonezet = URL.createObjectURL(fajl)
        elonezetUrlRef.current.push(elonezet)
        setOldalak((elozo) => [
          ...elozo,
          {
            id: eredmeny.csatolmany_id || ut,
            nev: fajl.name,
            elonezetUrl: elonezet,
            oldalSorszam: eredmeny.oldal_sorszam ?? null,
          },
        ])

        kesz += 1
        setFolyamatban({ kesz, osszes: fajlok.length })
      }

      setFolyamatban(null)
      setSorHibak(hibak)
      setFigyelmeztetesek(intesek)
    },
    [darab, munkamenet, supabase, token],
  )

  function kivalasztas(e: React.ChangeEvent<HTMLInputElement>) {
    const fajlok = Array.from(e.target.files || [])
    e.target.value = '' // ugyanaz a fájl újra kiválasztható legyen
    if (fajlok.length > 0) void feldolgoz(fajlok)
  }

  // ── Betöltés ─────────────────────────────────────────────────
  if (allapot === 'betolt') {
    return (
      <Kerete>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Feltöltési munkamenet ellenőrzése…</p>
        </div>
      </Kerete>
    )
  }

  // ── Hibaoldal (érvénytelen / lejárt / lezárt token) ──────────
  if (allapot === 'hiba' || !munkamenet) {
    return (
      <Kerete>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-7" aria-hidden />
          </div>
          <h1 className="font-heading text-xl font-semibold text-foreground">
            A feltöltés nem indítható
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {hiba || 'A QR-kód nem érvényes.'}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Kérj új QR-kódot az asztali gépen: Iktató → az irat gemkapocs ikonja →{' '}
            {'„Fotózás telefonnal (QR)"'}.
          </p>
        </div>
      </Kerete>
    )
  }

  // ── Feltöltő felület ─────────────────────────────────────────
  return (
    <Kerete>
      {/* Fejléc — mit fotózunk */}
      <header className="space-y-2 pb-4 pt-2">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Stamp className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Kartotéka — iktató
            </p>
            <h1 className="font-heading text-lg font-semibold leading-tight text-foreground">
              {munkamenet.iktatoszam} iktatószámú irat
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden />
            {lejart ? 'A munkamenet lejárt' : `Hátralévő idő: ${idoSzoveg(hatralevoMp)}`}
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Beérkezett: {darab} / {munkamenet.maxFiles} kép
          </span>
        </div>
      </header>

      {/* Lejárt / betelt jelzés */}
      {lejart ? (
        <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          A feltöltési munkamenet lejárt. Az asztali gépen kérj új QR-kódot, és olvasd be újra.
        </div>
      ) : betelt ? (
        <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Elérted a munkamenet korlátját ({munkamenet.maxFiles} kép). Az asztali gépen indíts új
          munkamenetet, ha még van fotóznivaló oldal.
        </div>
      ) : null}

      {/* Rejtett fájl-inputok */}
      <input
        ref={kameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={kivalasztas}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={kivalasztas}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {/* Fő gomb — hüvelykujjal elérhető, nagy felület */}
      <button
        type="button"
        disabled={dolgozik || lejart || betelt}
        onClick={() => kameraRef.current?.click()}
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-6 text-lg font-semibold text-primary-foreground shadow-lg transition active:scale-[0.99] disabled:opacity-50"
      >
        {dolgozik ? (
          <>
            <Loader2 className="size-6 animate-spin" aria-hidden />
            Feldolgozás… {folyamatban?.kesz} / {folyamatban?.osszes}
          </>
        ) : (
          <>
            <Camera className="size-6" aria-hidden />
            Fotó készítése
          </>
        )}
      </button>

      <button
        type="button"
        disabled={dolgozik || lejart || betelt}
        onClick={() => galeriaRef.current?.click()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-4 text-base font-medium text-foreground transition active:scale-[0.99] disabled:opacity-50"
      >
        <ImagePlus className="size-5" aria-hidden />
        Kép választása a galériából
      </button>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          A kép a telefonon tömörödik, majd digitális iktató-pecsétet kap (iktatószám és dátum egy
          fehér sávban a kép alatt — a tartalmat sosem takarja). A lap nem kér és nem tárol
          személyes adatot; a link rövid idő után magától érvénytelenné válik.
        </span>
      </p>

      {/* Figyelmeztetések (nem végzetes) */}
      {figyelmeztetesek.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 rounded-2xl border border-amber-500/30 bg-amber-500/5 py-3 pl-8 pr-4 text-xs text-amber-800 dark:text-amber-300">
          {figyelmeztetesek.map((uzenet, i) => (
            <li key={i}>{uzenet}</li>
          ))}
        </ul>
      ) : null}

      {/* Hibák */}
      {sorHibak.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 rounded-2xl border border-destructive/30 bg-destructive/5 py-3 pl-8 pr-4 text-xs text-destructive">
          {sorHibak.map((uzenet, i) => (
            <li key={i}>{uzenet}</li>
          ))}
        </ul>
      ) : null}

      {/* Feltöltött oldalak */}
      {oldalak.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">
            Feltöltött oldalak ({oldalak.length})
          </h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {oldalak.map((oldal) => (
              <li key={oldal.id} className="overflow-hidden rounded-xl border border-border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- helyi blob-előnézet, nincs távoli forrás */}
                <img
                  src={oldal.elonezetUrl}
                  alt={`${oldal.oldalSorszam ?? '?'}. oldal előnézete`}
                  className="aspect-[3/4] w-full object-cover"
                />
                <p className="px-1.5 py-1 text-center text-[10px] text-muted-foreground">
                  {oldal.oldalSorszam ? `${oldal.oldalSorszam}. oldal` : 'feltöltve'}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            A képek azonnal megjelennek az asztali gépen az irat csatolmányai között. Ha végeztél,
            egyszerűen zárd be ezt a lapot.
          </p>
        </section>
      ) : null}
    </Kerete>
  )
}

// ─────────────────────────────────────────────────────────────────
// Segédek
// ─────────────────────────────────────────────────────────────────

/** Mobil-first oldalkeret — egy kézzel is kényelmes szélesség és térköz. */
function Kerete({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-md bg-background px-4 pb-16 pt-4 text-foreground">
      {children}
    </main>
  )
}

/** mm:ss alakú hátralévő idő. */
function idoSzoveg(mp: number | null): string {
  if (mp === null) return '—'
  const perc = Math.floor(mp / 60)
  const masodperc = mp % 60
  return `${perc}:${String(masodperc).padStart(2, '0')}`
}

/** MIME → fájlkiterjesztés a storage-úthoz. */
function kiterjesztes(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'application/pdf') return 'pdf'
  return 'jpg'
}

/**
 * Egyedi azonosító az objektum-úthoz. A crypto.randomUUID csak biztonságos
 * kontextusban (https/localhost) érhető el — máshol véletlen-alapú tartalék.
 */
function ujAzonosito(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const veletlen = Math.random().toString(36).slice(2)
  return `${Date.now().toString(36)}-${veletlen}${Math.random().toString(36).slice(2)}`
}
