'use client'

/**
 * ISMERETLEN FÁJLOK A MENTÉSI MAPPÁBAN (2026-08-11).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT SZÜLETETT
 * ════════════════════════════════════════════════════════════════════════════
 * A felület eddig ennyit mondott: „Ezen felül 1 ISMERETLEN fájl van a mappában
 * — ezeket a rendszer soha nem törli automatikusan." A tulajdonos ebből nem
 * tudta megállapítani, MI az, MIKOR keletkezett, és mit kezdjen vele. A nevek
 * léteztek a kódban (a nyesés összegyűjtötte őket), de a szerver-akció határán
 * elvesztek: a válasz-típus nem tudta átvinni.
 *
 * Egy néma emlegetés ugyanolyan rossz, mint az automatikus törlés — csak nem
 * visszafordíthatatlan. Ez a doboz megnevezi a fájlt, elmondja, honnan
 * származhat, és kínál egy KÉZI, kétlépcsős törlést.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⛔ AZ AUTOMATIKUS TÖRLÉS TOVÁBBRA IS TILOS
 * ════════════════════════════════════════════════════════════════════════════
 * A `lib/google-drive/retention.ts` 2. szabálya változatlan: amit a rendszer
 * nem tud besorolni, azt SOHA nem törli magától — csak jelenti. Itt A TULAJDONOS
 * dönt, a fájl nevének BEGÉPELÉSÉVEL, és a szerver a törlés előtt még egyszer,
 * FRISS napló-lekérdezéssel bizonyítja, hogy tényleg nem hivatkozik rá semmi.
 */

import { useState } from 'react'
import { FileQuestion, Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteUnknownBackupFileAction } from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import { formatBajt } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'
import { BUKARESTI_ZONA_FELIRAT, huIdopontBukarest } from '@/lib/utils/idopont-bukarest'

export interface IsmeretlenFajl {
  fileId: string
  fileName: string
  bytes: number
  letrehozva: string | null
}

/**
 * MI EZ A FÁJL — a NÉV alapján, találgatás nélkül.
 *
 * A mentés-motor két előtagot használ (`export.ts`): `kb-` a mentés-konténer,
 * `km-` a média (fénykép) fájl. Az ilyen árva fájl szinte biztosan a mentés
 * SAJÁT terméke: vagy két párhuzamos futás írt fel két fájlt ugyanarra a napra
 * (a napló csak az utolsó azonosítót őrzi), vagy egy feltöltés az IGAZOLÁS
 * előtt szakadt meg, és a takarítása sem sikerült.
 */
function eredetMagyarazat(nev: string): string {
  const kisbetus = nev.toLowerCase()
  if (kisbetus.startsWith('kb-')) {
    return (
      'Ez egy ÁRVA MENTÉS-FÁJL: a Kartotéka töltötte fel, de a napló egyetlen sora sem ' +
      'hivatkozik rá. Tipikus oka, hogy két futás dolgozott ugyanazon a gyülekezeten (a napló ' +
      'csak az utolsó fájlt jegyzi meg), vagy egy feltöltés a visszaolvasás (igazolás) előtt ' +
      'megszakadt. Adat nem veszett el tőle — csak helyet foglal.'
    )
  }
  if (kisbetus.startsWith('km-')) {
    return (
      'Ez egy ÁRVA FÉNYKÉP-FÁJL (média): a Kartotéka töltötte fel, de már egyetlen megtartott ' +
      'mentés sem hivatkozik rá. Törlése nem érint működő mentést.'
    )
  }
  if (kisbetus.startsWith('proba-')) {
    return 'Ez egy PRÓBAFÁJL a Drive-kapcsolat tesztjéből, amit a takarítás nem tudott eltávolítani.'
  }
  return (
    'Ezt a fájlt NEM a Kartotéka tette ide (nem ismerjük fel a nevét). Lehet, hogy kézzel ' +
    'másolta be valaki a mappába. A rendszer hozzá sem nyúl.'
  )
}

export function BackupUnknownFiles({
  fajlok,
  osszesen,
  master,
  onValtozas,
}: {
  fajlok: IsmeretlenFajl[]
  osszesen: number
  master: boolean
  onValtozas?: () => void
}) {
  const [nyitott, setNyitott] = useState<string | null>(null)
  const [begepelt, setBegepelt] = useState('')
  const [fut, setFut] = useState(false)
  const [uzenet, setUzenet] = useState<{ ok: boolean; szoveg: string } | null>(null)

  async function torol(f: IsmeretlenFajl) {
    setFut(true)
    setUzenet(null)
    try {
      const r = await deleteUnknownBackupFileAction(f.fileId, begepelt.trim())
      setUzenet({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Törölve.') : (r.error ?? 'Nem sikerült.') })
      if (r.success) {
        setNyitott(null)
        setBegepelt('')
        onValtozas?.()
      }
    } catch (e: unknown) {
      setUzenet({
        ok: false,
        szoveg: `A kérés nem ért célba: ${e instanceof Error ? e.message : 'hálózati hiba'}.`,
      })
    } finally {
      setFut(false)
    }
  }

  return (
    <details className="mt-3 rounded-xl border border-border bg-card px-3 py-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 text-sm font-semibold text-foreground">
        <FileQuestion className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Mi az a(z) {osszesen} ismeretlen fájl a mappában?
      </summary>

      <p className="pb-2 text-xs leading-relaxed text-muted-foreground">
        A rendszer ezeket <strong className="text-foreground">SOHA nem törli automatikusan</strong>:
        egy be nem sorolható fájl lehet egy következő verzió mentése is, a törlés pedig
        visszafordíthatatlan. Itt viszont te magad eltávolíthatod őket — a fájl nevének
        begépelésével.
      </p>

      <ul className="space-y-2 pb-2">
        {fajlok.map((f) => {
          const nyit = nyitott === f.fileId
          return (
            <li key={f.fileId} className="rounded-lg border border-border bg-background p-2.5">
              <p className="break-all font-mono text-xs font-semibold text-foreground">{f.fileName}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatBajt(f.bytes)}
                {f.letrehozva ? (
                  <>
                    {' · keletkezett: '}
                    {huIdopontBukarest(f.letrehozva, 'short')}{' '}
                    <span className="whitespace-nowrap">({BUKARESTI_ZONA_FELIRAT})</span>
                  </>
                ) : (
                  ' · a keletkezés idejét a tároló nem adja meg'
                )}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {eredetMagyarazat(f.fileName)}
              </p>

              {master ? (
                nyit ? (
                  <div className="mt-2 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
                    <p className="text-xs leading-relaxed text-foreground">
                      A <strong>végleges</strong> törléshez gépeld be a fájl nevét. Ez nem kerül
                      kukába, és nem vonható vissza.
                    </p>
                    <Input
                      value={begepelt}
                      onChange={(e) => setBegepelt(e.currentTarget.value)}
                      placeholder={f.fileName}
                      aria-label={`A törlendő fájl nevének megerősítése: ${f.fileName}`}
                      className="h-11 font-mono text-xs"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={fut || begepelt.trim() !== f.fileName}
                        onClick={() => void torol(f)}
                        className="min-h-11 gap-2"
                        aria-label={`A(z) ${f.fileName} fájl végleges törlése`}
                      >
                        {fut ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="size-4" aria-hidden />
                        )}
                        Végleges törlés
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={fut}
                        onClick={() => {
                          setNyitott(null)
                          setBegepelt('')
                        }}
                        className="min-h-11"
                        aria-label="A törlés megszakítása"
                      >
                        Mégsem
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setNyitott(f.fileId)
                      setBegepelt('')
                      setUzenet(null)
                    }}
                    className="mt-2 min-h-11 gap-2"
                    aria-label={`A(z) ${f.fileName} fájl törlésének előkészítése`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Törlöm ezt a fájlt
                  </Button>
                )
              ) : (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  A törléshez fő rendszergazdai jogosultság kell.
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {osszesen > fajlok.length && (
        <p className="pb-2 text-[11px] text-muted-foreground">
          …és még {osszesen - fajlok.length} fájl. (Egyszerre legfeljebb {fajlok.length} nevet
          sorolunk fel.)
        </p>
      )}

      {uzenet && (
        <p
          role="status"
          className={[
            'mb-2 rounded-lg px-3 py-2 text-xs leading-relaxed',
            uzenet.ok
              ? 'border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border border-destructive/40 bg-destructive/10 text-foreground',
          ].join(' ')}
        >
          {uzenet.szoveg}
        </p>
      )}
    </details>
  )
}
