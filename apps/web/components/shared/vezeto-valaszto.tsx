'use client'

import { useMemo } from 'react'
import { UserCheck, Info } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ModalField } from '@/components/ui/modal-field'

/**
 * VezetoValaszto — egy tisztségviselő nevének KIVÁLASZTÁSA lista alapján,
 * kézi beírás lehetőségével.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EZ (2026-08-15, Endre kérése)
 * ════════════════════════════════════════════════════════════════════════════
 * A beállítás-varázslókban a vezetők nevét eddig KÉZZEL kellett begépelni.
 * A kézzel írt név elszakad a rendszerben nyilvántartott személytől — ugyanaz
 * a hibaosztály, mint a `congregations.district` szöveges oszlopé: ugyanaz az
 * adat két helyen él, és némán széthúzhat (elgépelés, névváltozás, „dr." elé
 * vagy mögé, ékezet-hiány). A hivatalos iraton pedig más név szerepelne, mint
 * a rendszerben.
 *
 * Endre kérése: „az esperes személyét lehessen kiválasztani a … lelkészeinek a
 * listájából ha benne van, az egyházmegyei főjegyzőt és számvevőt ha nincs
 * hozzárendelve már az egyházmegyéhez a rendszergazdai adminisztrátori
 * felületről."
 *
 * ⚠️ A KÉZI BEÍRÁS SZÁNDÉKOSAN MEGMARAD. Nem minden tisztségviselőnek van
 *    fiókja a rendszerben (a főgondnok például jellemzően nem lelkész), és a
 *    beállítás nem akadhat el azon, hogy valaki még nincs regisztrálva.
 *    A lista tehát SEGÍTSÉG, nem korlát — de a gyakori esetet egy kattintásra
 *    hozza, elgépelés nélkül.
 */

export interface VezetoJeloltNezet {
  profileId: string
  nev: string
  email: string | null
  /** Honnan ismerjük — a név mellett jelenik meg magyarázatként. */
  honnan: string
}

interface Props {
  label: string
  /** A TÁROLT érték: a tisztségviselő neve (ez kerül a hivatalos iratra). */
  value: string
  onChange: (nev: string) => void
  jeloltek: VezetoJeloltNezet[]
  /**
   * Aki MÁR hozzá van rendelve ehhez a tisztséghez a rendszergazdai felületen.
   * Ha van ilyen és a mező még üres, ezt kínáljuk fel egy kattintásra.
   */
  hozzarendelt?: VezetoJeloltNezet | null
  /** Mit írjunk ki, ha egyetlen jelölt sincs (hova menjen hozzárendelni). */
  uresSegitseg?: string
  placeholder?: string
}

const KEZI = '__kezi__'

export function VezetoValaszto({
  label,
  value,
  onChange,
  jeloltek,
  hozzarendelt = null,
  uresSegitseg,
  placeholder,
}: Props) {
  // A legördülő akkor mutatja a nevet kiválasztottként, ha a beírt érték
  // PONTOSAN egyezik egy jelölt nevével. Minden más esetben („kézi") a szabad
  // szöveges mező az aktív — így a korábban kézzel beírt nevek NEM vesznek el.
  const kivalasztott = useMemo(() => {
    const talalat = jeloltek.find((j) => j.nev === value.trim())
    return talalat ? talalat.profileId : KEZI
  }, [jeloltek, value])

  const kezi = kivalasztott === KEZI

  return (
    <ModalField label={label}>
      {jeloltek.length > 0 ? (
        <div className="space-y-1.5">
          <select
            value={kivalasztott}
            onChange={(e) => {
              const v = e.target.value
              if (v === KEZI) {
                // Kézi módra váltás: a mezőt ÜRESEN hagyjuk, hogy a felhasználó
                // lássa, most ő ír — de nem töröljük, ha épp kézzel írt nevet
                // szerkesztett (az `value` már úgyis kézi).
                if (!kezi) onChange('')
                return
              }
              const j = jeloltek.find((x) => x.profileId === v)
              if (j) onChange(j.nev)
            }}
            className="h-9 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
          >
            <option value={KEZI}>— Kézzel adom meg —</option>
            {jeloltek.map((j) => (
              <option key={j.profileId} value={j.profileId}>
                {j.nev} · {j.honnan}
              </option>
            ))}
          </select>

          {kezi && (
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
            />
          )}

          {!kezi && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <UserCheck className="size-3" />
              A rendszerben nyilvántartott személy — a neve így biztosan egyezik.
            </p>
          )}
        </div>
      ) : (
        // Nincs egyetlen jelölt sem: marad a kézi beírás, de megmondjuk, hol
        // lehet hozzárendelni — hogy legközelebb már listából válaszható legyen.
        <div className="space-y-1.5">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
          {uresSegitseg && (
            <p className="text-[11px] text-slate-500 flex items-start gap-1">
              <Info className="size-3 mt-0.5 shrink-0" />
              <span>{uresSegitseg}</span>
            </p>
          )}
        </div>
      )}

      {/* Aki már hozzá van rendelve ehhez a tisztséghez, de a mező üres vagy mást
          tartalmaz — egy kattintásra átvehető. */}
      {hozzarendelt && hozzarendelt.nev !== value.trim() && (
        <button
          type="button"
          onClick={() => onChange(hozzarendelt.nev)}
          className="mt-1.5 text-[11px] text-violet-700 dark:text-violet-300 underline underline-offset-2 hover:opacity-80 text-left"
        >
          A rendszer szerint ő tölti be ezt a tisztséget: <strong>{hozzarendelt.nev}</strong> — átveszem
        </button>
      )}
    </ModalField>
  )
}
