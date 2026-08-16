'use client'

/**
 * NYOMTATÁS GOMB — egyetlen dolga: elindítani a böngésző nyomtatását.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EGYÁLTALÁN SZÜKSÉG RÁ (a tünet, amit orvosol)
 * ════════════════════════════════════════════════════════════════════════════
 * A kerületi összesítő lapja MAGA az A4-es nyomtatvány (`@media print` CSS-sel),
 * de a felületen sokáig CSAK egy FELIRAT állt: „Nyomtatás: Ctrl+P, Mac-en ⌘+P".
 * Egy hivatalos, aláírandó ívnél ez kevés: a billentyűparancsot ismerni kell,
 * érintőképernyőn (tableten, telefonon) pedig egyszerűen nincs is Ctrl+P — a
 * nyomtatvány tehát elérhetetlen maradt annak, aki nem billentyűzet mellől
 * dolgozik. Ezért van itt gomb; a felirat mellette maradhat, de már nem az
 * EGYETLEN út.
 *
 * MIÉRT KÜLÖN, PICI `use client` FÁJL: a lap szándékosan tiszta SZERVER-
 * komponens (megosztható `?ev=` URL, nincs kliens-állapot). A `window.print()`
 * viszont böngésző-API, tehát kliens kell hozzá. Ez a fájl a lehető legkisebb
 * kliens-sziget: egyetlen gomb, semmilyen állapot — a lap többi része szerveren
 * marad.
 *
 * ⚠️ A gomb maga NEM kerülhet papírra: `nyomtatasban-rejtve` osztályt visel, amit
 *    a lap nyomtatási CSS-e elrejt. Enélkül a kinyomtatott hivatalos íven ott
 *    virítana egy „Nyomtatás" feliratú doboz.
 */

import { Printer } from 'lucide-react'

interface NyomtatasGombProps {
  /** A gomb felirata — alapból „Nyomtatás". */
  felirat?: string
  className?: string
}

export function NyomtatasGomb({ felirat = 'Nyomtatás', className = '' }: NyomtatasGombProps) {
  return (
    <button
      type="button"
      // A `window.print()` a JELENLEG látható lapot nyomtatja — épp ezt akarjuk:
      // a képernyőn látott és a papírra kerülő szám így ugyanabból az EGY
      // forrásból jön, nem egy külön HTML-építőből, ami idővel széthúzhatna.
      onClick={() => window.print()}
      className={
        'nyomtatasban-rejtve inline-flex items-center gap-1.5 rounded-full border border-border ' +
        'px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted/60 ' +
        // Mobil-first: a 36 px-es minimum érintő-magasság a repó követelménye.
        'max-sm:min-h-9 ' +
        className
      }
    >
      <Printer className="size-3.5" />
      {felirat}
    </button>
  )
}
