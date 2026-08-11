'use client'

/**
 * MEGŐRZÉS + RIASZTÁS-BEÁLLÍTÁS (2026-08-11).
 *
 * ⚠️ A TÖRLÉS VÉGLEGES. A rendszer a Drive `files.delete` hívását használja,
 * NEM a Kukát: a Drive Kukája 30 napig őrizne, és a „14 nap" ígéret némán
 * 44 nappá válna. Amit a felület mond, annak igaznak kell lennie.
 *
 * ⚠️ AMIT A NYESŐ NEM TUD BESOROLNI, AZT SOHA NEM TÖRLI — csak jelenti.
 * ⚠️ 7-nél kevesebb igazolt mentés alá SOHA nem megy.
 */

import { useState } from 'react'
import { Archive, Loader2, MailWarning, Save, ScissorsLineDashed, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AdminConfirmDialog } from '@/components/admin/admin-confirm-dialog'
import {
  pruneBackupsAction,
  sendAlertTestAction,
  setAlertEmailAction,
  setRetentionAction,
} from '@/app/(dashboard)/admin/biztonsagi-mentes/actions'
import type { RetentionConfig } from '@/app/(dashboard)/admin/biztonsagi-mentes/shared'

interface Props {
  retention: RetentionConfig
  riasztasEmail: string | null
  master: boolean
  onValtozas: () => void
}

interface Uzenet {
  ok: boolean
  szoveg: string
}

export function BackupRetentionCard({ retention, riasztasEmail, master, onValtozas }: Props) {
  const [napi, setNapi] = useState(String(retention.napi))
  const [heti, setHeti] = useState(String(retention.heti))
  const [havi, setHavi] = useState(String(retention.havi))
  const [email, setEmail] = useState(riasztasEmail ?? '')
  const [busy, setBusy] = useState<'megorzes' | 'email' | 'nyeses' | 'szaraz' | 'riasztas' | null>(null)
  const [uzenet, setUzenet] = useState<Uzenet | null>(null)
  const [nyesesNyitva, setNyesesNyitva] = useState(false)

  async function mentMegorzes() {
    setBusy('megorzes')
    setUzenet(null)
    try {
      const r = await setRetentionAction(Number(napi), Number(heti), Number(havi))
      setUzenet({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Elmentve.') : (r.error ?? 'Nem sikerült.') })
      if (r.success) onValtozas()
    } finally {
      setBusy(null)
    }
  }

  async function mentEmail() {
    setBusy('email')
    setUzenet(null)
    try {
      const r = await setAlertEmailAction(email)
      setUzenet({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Elmentve.') : (r.error ?? 'Nem sikerült.') })
      if (r.success) onValtozas()
    } finally {
      setBusy(null)
    }
  }

  async function nyes(szaraz: boolean) {
    setBusy(szaraz ? 'szaraz' : 'nyeses')
    setUzenet(null)
    try {
      const r = await pruneBackupsAction(szaraz)
      setUzenet({ ok: r.success, szoveg: r.success ? (r.uzenet ?? 'Kész.') : (r.error ?? 'Nem sikerült.') })
      if (r.success) onValtozas()
    } finally {
      setBusy(null)
      setNyesesNyitva(false)
    }
  }

  async function riasztasProba() {
    setBusy('riasztas')
    setUzenet(null)
    try {
      const r = await sendAlertTestAction()
      setUzenet({
        ok: r.success,
        szoveg: r.success ? (r.uzenet ?? 'Elküldve.') : (r.error ?? 'A próba elhasalt.'),
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-label="Megőrzés és hibajelzés" className="card-raised space-y-4 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Archive className="size-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg text-foreground">Megőrzés és hibajelzés</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Meddig őrizzük a régi mentéseket, és hová menjen a hibajelző levél.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">A törlés végleges.</strong> A rendszer nem a Drive Kukájába
          teszi a régi fájlokat — mert onnan 30 nap múlva úgyis eltűnnének, és a „14 nap” ígéret némán
          44 nappá válna.
        </p>
        <p className="mt-1.5">
          <strong className="text-foreground">Amit a rendszer nem tud besorolni, azt soha nem törli</strong>{' '}
          — csak jelenti. És soha nem megy 7 igazolt mentés alá, akkor sem, ha a szabály azt engedné.
        </p>
        <p className="mt-1.5">
          A <strong className="text-foreground">visszaállítás előtti</strong> mentések 90 napig, a kézi
          mentések 30 napig maradnak — ezekhez a nyesés nem nyúl.
        </p>
        <p className="mt-1.5">
          <strong className="text-foreground">A mentés nem archívum.</strong> A számviteli iratmegőrzést
          (5–10 év) az élő rendszer és a papír teljesíti; a kettő összemosása semmisítené meg a
          megőrzési korlátot.
        </p>
      </div>

      {master ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { id: 'ret-napi', cimke: 'Napi (db)', ertek: napi, allit: setNapi, sug: '7–60' },
              { id: 'ret-heti', cimke: 'Heti (db)', ertek: heti, allit: setHeti, sug: '4–52' },
              { id: 'ret-havi', cimke: 'Havi (db)', ertek: havi, allit: setHavi, sug: '3–36' },
            ].map((m) => (
              <div key={m.id} className="space-y-1">
                <Label htmlFor={m.id}>{m.cimke}</Label>
                <Input
                  id={m.id}
                  type="number"
                  inputMode="numeric"
                  value={m.ertek}
                  onChange={(e) => m.allit(e.currentTarget.value)}
                  disabled={busy !== null}
                  className="min-h-11 tabular-nums"
                  aria-label={m.cimke}
                />
                <p className="text-[11px] text-muted-foreground">Megengedett: {m.sug}</p>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void mentMegorzes()}
            disabled={busy !== null}
            className="min-h-11 w-full gap-2 sm:w-auto"
            aria-label="A megőrzési szabály mentése"
          >
            {busy === 'megorzes' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Megőrzés mentése
          </Button>

          <div className="space-y-1 border-t border-border pt-4">
            <Label htmlFor="ret-email">Hibajelző e-mail címe</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="ret-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                placeholder="Üresen hagyva a fő rendszergazda címére megy"
                disabled={busy !== null}
                className="min-h-11"
                aria-label="Hibajelző e-mail címe"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void mentEmail()}
                disabled={busy !== null}
                className="min-h-11 shrink-0 gap-2"
                aria-label="A hibajelző e-mail cím mentése"
              >
                {busy === 'email' ? <Loader2 className="size-4 animate-spin" /> : <MailWarning className="size-4" />}
                Mentés
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A hibajelző levél SEMMILYEN mentett adatot és letöltési linket nem tartalmaz — csak azt,
              hogy mi, mikor és milyen hibával nem sikerült.
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => void riasztasProba()}
              disabled={busy !== null}
              className="min-h-11 w-full gap-2 sm:w-auto"
              aria-label="Próba-riasztás küldése e-mailben és a harangba"
            >
              {busy === 'riasztas' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Riasztás kipróbálása
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void nyes(true)}
              disabled={busy !== null}
              className="min-h-11 w-full gap-2 sm:w-auto"
              aria-label="Száraz futás: megmutatja, mit törölne a nyesés"
            >
              {busy === 'szaraz' ? <Loader2 className="size-4 animate-spin" /> : <ScissorsLineDashed className="size-4" />}
              Mit törölne? (száraz futás)
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setNyesesNyitva(true)}
              disabled={busy !== null}
              className="min-h-11 w-full gap-2 sm:w-auto"
              aria-label="A régi mentések végleges törlése a Google Drive-ról"
            >
              <ScissorsLineDashed className="size-4" aria-hidden />
              Régi mentések nyesése
            </Button>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A „Riasztás kipróbálása” gomb egy PRÓBA-levelet küld és egy harang-értesítést ír. Egy
            riasztási csatorna, amit sosem próbáltak ki, nem csatorna.
          </p>
        </>
      ) : (
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Jelenlegi szabály: {retention.napi} napi, {retention.heti} heti, {retention.havi} havi mentés
          megőrzése. Módosítani a fő rendszergazda tud.
        </p>
      )}

      {uzenet ? (
        <p
          role="status"
          className={[
            'rounded-xl border p-3 text-sm leading-relaxed',
            uzenet.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          ].join(' ')}
        >
          {uzenet.szoveg}
        </p>
      ) : null}

      <AdminConfirmDialog
        open={nyesesNyitva}
        onOpenChange={(o) => (busy ? undefined : setNyesesNyitva(o))}
        title="Biztosan törlöd a régi mentéseket?"
        tone="danger"
        description={
          <>
            A megőrzési szabályon kívül eső mentések <strong>VÉGLEGESEN</strong> törlődnek a Google
            Drive-ról — nem a Kukába kerülnek, nem hozhatók vissza.
            <br />
            <br />
            Megmaradnak: az utolsó {napi} nap, {heti} hét és {havi} hónap mentései, a visszaállítás
            előtti mentések (90 nap), és minden hibás vagy nem igazolt futás nyoma. A rendszer soha nem
            megy 7 igazolt mentés alá.
            <br />
            <br />
            Ha nem vagy biztos benne, előbb futtasd a <strong>„Mit törölne?”</strong> gombot.
          </>
        }
        confirmLabel="Igen, végleges törlés"
        loading={busy === 'nyeses'}
        onConfirm={() => void nyes(false)}
      />
    </section>
  )
}
