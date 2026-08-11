'use client'

/**
 * MENTÉSI JELSZÓ — WRITE-ONLY KÁRTYA (2026-08-11).
 *
 * A felület a jelszóról KIZÁRÓLAG annyit tud, hogy „be van állítva" és mikor.
 * A rendszer az értékét nem tárolja (csak egy szerver-kulcsos ellenőrző
 * hash-t), nem tudja megmondani, és nem tudja visszaállítani.
 *
 * ─── ŐSZINTE KORLÁT, AMIT A KÁRTYA IS KIMOND ───────────────────────────────
 * „Ez a jelszó az ellopott Drive-fájl és az ellopott, bejelentkezett laptop
 *  ellen véd. Ha valaki magát a kiszolgálót töri fel, az élő adatbázishoz
 *  amúgy is hozzáfér. Ez NEM a bejelentkezési jelszavad — azt a rendszer soha
 *  nem is látja."
 */

import { useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/admin/_shared/status-badge'
import { setBackupPassphraseAction } from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'

const MIN_HOSSZ = 12

interface Props {
  beallitva: boolean
  beallitvaAt: string | null
  master: boolean
  onValtozas: () => void
}

export function BackupPassphraseCard({ beallitva, beallitvaAt, master, onValtozas }: Props) {
  const [regi, setRegi] = useState('')
  const [uj, setUj] = useState('')
  const [ujMegint, setUjMegint] = useState('')
  const [busy, setBusy] = useState(false)
  const [uzenet, setUzenet] = useState<{ ok: boolean; szoveg: string } | null>(null)

  const egyezik = uj.length > 0 && uj === ujMegint
  const hosszOk = uj.trim().length >= MIN_HOSSZ
  const kuldheto = master && !busy && hosszOk && egyezik && (!beallitva || regi.length > 0)

  async function ment() {
    setBusy(true)
    setUzenet(null)
    try {
      const r = await setBackupPassphraseAction(beallitva ? regi : null, uj)
      setUzenet({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Elmentve.') : (r.error ?? 'Nem sikerült.') })
      if (r.success) {
        setRegi('')
        setUj('')
        setUjMegint('')
        onValtozas()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Mentési jelszó" className="card-raised space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <KeyRound className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg text-foreground">Mentési jelszó</h2>
            {beallitva ? (
              <StatusBadge intent="success" icon={ShieldCheck}>
                beállítva
                {beallitvaAt ? ` · ${beallitvaAt.slice(0, 10)}` : ''}
              </StatusBadge>
            ) : (
              <StatusBadge intent="danger" dot>
                nincs beállítva
              </StatusBadge>
            )}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Ez <strong>nem a bejelentkezési jelszavad</strong> — azt a rendszer soha nem is látja. Ez a
            jelszó a mentés <strong>letöltését és visszaállítását</strong> védi, és ezzel tudod a Drive-on
            lévő fájlokat a Kartotéka nélkül is megnyitni.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">A rendszer NEM tárolja és NEM tudja megmondani.</strong> Írd
          le, és tedd oda, ahol a fontos iratokat tartod. Ha elveszik, a régi mentések véglegesen
          megnyithatatlanok maradnak.
        </p>
        <p className="mt-1.5">
          Nem tudsz jót kitalálni? Vegyél négy szót, amit együtt senki más nem mondana:{' '}
          <span className="font-mono">harang-szeker-kolomp-arnyek</span>. Négy szó jobb, mint egy
          bonyolult betűkeverék — mert ezt le tudod írni és fel tudod ismerni. Legalább {MIN_HOSSZ}{' '}
          karakter.
        </p>
        <p className="mt-1.5">
          <strong className="text-foreground">Mi ellen véd?</strong> Az ellopott Drive-fájl és az
          ellopott, bejelentkezett laptop ellen. Ha valaki magát a kiszolgálót töri fel, az élő
          adatbázishoz amúgy is hozzáfér — ezt a jelszó nem tudja megakadályozni, és nem is ígéri.
        </p>
        {beallitva ? (
          <p className="mt-1.5">
            <strong className="text-foreground">Csere esetén:</strong> a KORÁBBI mentéseket a csere NEM
            írja át — azokat továbbra is csak a régi jelszó nyitja. A régi jelszót ezért ne dobd el, amíg
            a régi mentések meg vannak.
          </p>
        ) : null}
      </div>

      {master ? (
        <div className="space-y-3">
          {beallitva ? (
            <div className="space-y-1">
              <Label htmlFor="backup-pass-old">A mostani mentési jelszó</Label>
              <Input
                id="backup-pass-old"
                type="password"
                value={regi}
                onChange={(e) => setRegi(e.currentTarget.value)}
                autoComplete="off"
                disabled={busy}
                className="min-h-11"
                aria-label="A mostani mentési jelszó"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <Label htmlFor="backup-pass-new">{beallitva ? 'Az új mentési jelszó' : 'Mentési jelszó'}</Label>
            <Input
              id="backup-pass-new"
              type="password"
              value={uj}
              onChange={(e) => setUj(e.currentTarget.value)}
              autoComplete="off"
              disabled={busy}
              className="min-h-11"
              aria-label={beallitva ? 'Az új mentési jelszó' : 'Mentési jelszó'}
            />
            {uj.length > 0 && !hosszOk ? (
              <p className="text-[11px] text-destructive">Legalább {MIN_HOSSZ} karakter kell.</p>
            ) : null}
          </div>

          <div className="space-y-1">
            <Label htmlFor="backup-pass-new2">Ugyanaz még egyszer</Label>
            <Input
              id="backup-pass-new2"
              type="password"
              value={ujMegint}
              onChange={(e) => setUjMegint(e.currentTarget.value)}
              autoComplete="off"
              disabled={busy}
              className="min-h-11"
              aria-label="Az új mentési jelszó megerősítése"
            />
            {ujMegint.length > 0 && !egyezik ? (
              <p className="text-[11px] text-destructive">A két jelszó nem egyezik.</p>
            ) : null}
          </div>

          <Button
            type="button"
            onClick={() => void ment()}
            disabled={!kuldheto}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label={beallitva ? 'A mentési jelszó cseréje' : 'A mentési jelszó beállítása'}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {beallitva ? 'Jelszó cseréje' : 'Jelszó beállítása'}
          </Button>
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          A mentési jelszót a fő rendszergazda állítja be.
        </p>
      )}

      {uzenet ? (
        <p
          role="status"
          className={[
            'rounded-xl border p-3 text-sm',
            uzenet.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          ].join(' ')}
        >
          {uzenet.szoveg}
        </p>
      ) : null}
    </section>
  )
}
