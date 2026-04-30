'use client'

/**
 * Anyakönyvi import wizard 5. lépés — Special-fields.
 *
 * Profil-specifikus döntések:
 *   - **Konfirmáció**: Endre invariáns "keresztelés nélkül nincs konfirmálás".
 *     Ha a XML-ben van "Keresztelés ideje" oszlop, a wizard ELŐSZÖR keresztseg-
 *     bejegyzést hoz létre minden konfirmandushoz (a "Keresztelés ideje" alapján).
 *     A felhasználó eldöntheti: igen / nem (csak konfirmáció).
 *   - **Esketés**: a "Vegyes" oszlop boolean kezelése — figyelmeztet, ha az
 *     XML-ben nincs ilyen oszlop, és lehet manuálisan beállítani globálisan
 *     (ritka esetre).
 *   - **Mozgás**: nincs különleges döntés (csak átugró-üzenet).
 *
 * Az anyakönyvi profilok (baptism, burial) esetén ez a lépés átugorható.
 */

import { useEffect, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Building2, Heart, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  listCongregationsTree,
  type DioceseTreeNode,
} from '@/lib/notifications/congregations-tree-action'
import { CongregationSearchSelect } from '@/components/notifications/congregation-search-select'

export interface SpecialFieldsConfig {
  /** Konfirmáció: ha igaz, a wizard auto-rögzíti a hiányzó keresztseg-rekordokat */
  autoCreateBaptismForConfirmation: boolean
  /** Esketés: globálisan vegyes-e (ha az XML-ben nincs oszlop) — alapértelmezett false */
  marriageVegyesGlobal: boolean
  /** Elköltözés: globálisan a célgyülekezet (UUID), ha minden tag ugyanoda megy.
   *  Ha NULL → "külföldre vagy ismeretlen", a kulfoldre flag-et a XML adja.
   *  Ha a XML-ben sor-szintű különbség van, a person-link lépésen lehet majd
   *  felülírni (későbbi sub-feature). */
  elkoltozottTargetCongregationId?: string | null
}

interface SpecialFieldsStepProps {
  profileKey: string
  config: SpecialFieldsConfig
  onConfigChange: (next: SpecialFieldsConfig) => void
  /** Hány konfirmandushoz lett megadva "Keresztelés ideje" az XML-ben */
  confirmationsWithBaptismDate?: number
  totalRows?: number
  onBack: () => void
  onContinue: () => void
  /** Elköltözés profil esetén: sor-szintű célgyülekezet-választó (a fájl
   *  + state-vel a wizard-ban kezelt). Csak akkor teszi ki, ha file van. */
  elkoltozottTable?: React.ReactNode
}

export function SpecialFieldsStep({
  profileKey,
  config,
  onConfigChange,
  confirmationsWithBaptismDate = 0,
  totalRows = 0,
  onBack,
  onContinue,
  elkoltozottTable,
}: SpecialFieldsStepProps) {
  const showConfirmationOptions = profileKey === 'confirmation'
  const showMarriageOptions = profileKey === 'marriage'
  const showElkoltozottOptions = profileKey === 'movement_elkoltozott'
  const isMovement = profileKey.startsWith('movement_')

  // Egyházmegye-fa lekérése (csak az elkoltozott profil esetén)
  const [tree, setTree] = useState<DioceseTreeNode[]>([])
  const [unassigned, setUnassigned] = useState<Array<{ id: string; name: string }>>([])
  const [isLoadingTree, startLoadingTree] = useTransition()
  useEffect(() => {
    if (!showElkoltozottOptions) return
    startLoadingTree(async () => {
      const res = await listCongregationsTree()
      if (res.data) setTree(res.data)
      if (res.unassigned) setUnassigned(res.unassigned.map(c => ({ id: c.id, name: c.name })))
    })
  }, [showElkoltozottOptions])

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] bg-white/85 p-5 ring-1 ring-violet-100 shadow-[0_18px_40px_-30px_rgba(124,58,237,0.25)]">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Info className="size-5" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-800">Speciális beállítások</p>
            <p className="mt-0.5 text-sm text-slate-500">
              Az anyakönyv-típushoz tartozó egyedi döntések, mielőtt indul az import.
            </p>
          </div>
        </div>

        {/* Konfirmáció — keresztelés-link */}
        {showConfirmationOptions && (
          <div className="mt-4 rounded-2xl bg-emerald-50/60 p-4 ring-1 ring-emerald-100">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 size-5 shrink-0 text-emerald-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-700">
                  Keresztelés-rekord létrehozása konfirmációhoz
                </p>
                <p className="mt-1 text-xs text-emerald-900/80">
                  „Keresztelés nélkül nincs konfirmálás.” Ha a konfirmáció-XML-ben
                  szerepel a „Keresztelés ideje” oszlop, a wizard automatikusan
                  létrehozza a hiányzó keresztelési bejegyzéseket is.
                </p>
                {totalRows > 0 && (
                  <p className="mt-2 text-xs text-emerald-700">
                    <span className="font-semibold">{confirmationsWithBaptismDate}</span> /{' '}
                    {totalRows} konfirmandushoz van megadva keresztelés ideje a fájlban.
                  </p>
                )}
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-emerald-100 transition hover:bg-emerald-50/30">
              <input
                type="checkbox"
                checked={config.autoCreateBaptismForConfirmation}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    autoCreateBaptismForConfirmation: e.target.checked,
                  })
                }
                className="size-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-700">
                Igen, hozza létre automatikusan a hiányzó keresztelési bejegyzéseket
                (a „Keresztelés ideje” oszlop alapján).
              </span>
            </label>
            <p className="mt-2 text-xs text-slate-500">
              Ha kikapcsolod, csak a `konfirmalas.keresztelesideje` mezőbe kerül
              a dátum, a `keresztseg` táblába nem hozunk létre rekordot. (Akkor
              érdemes, ha a keresztelés más gyülekezetben volt.)
            </p>
          </div>
        )}

        {/* Esketés — vegyes flag */}
        {showMarriageOptions && (
          <div className="mt-4 rounded-2xl bg-rose-50/60 p-4 ring-1 ring-rose-100">
            <div className="flex items-start gap-3">
              <Heart className="mt-0.5 size-5 shrink-0 text-rose-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-rose-700">
                  Vegyes házasság jelzése
                </p>
                <p className="mt-1 text-xs text-rose-900/80">
                  Ha a XML-ben szerepel „Vegyes” oszlop, automatikusan azt használjuk.
                  Ha nincs ilyen oszlop, itt globálisan beállíthatod a vegyes flaget
                  (ritka eset).
                </p>
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-rose-100 transition hover:bg-rose-50/30">
              <input
                type="checkbox"
                checked={config.marriageVegyesGlobal}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    marriageVegyesGlobal: e.target.checked,
                  })
                }
                className="size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="text-sm text-slate-700">
                Az összes esketést jelöld vegyesnek (ha a fájlban nincs külön
                „Vegyes” oszlop).
              </span>
            </label>
          </div>
        )}

        {/* Elköltözöttek — célgyülekezet választó */}
        {showElkoltozottOptions && (
          <div className="mt-4 rounded-2xl bg-cyan-50/60 p-4 ring-1 ring-cyan-100">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 size-5 shrink-0 text-cyan-600" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-cyan-700">
                  Hova költöznek az elhagyó tagok?
                </p>
                <p className="mt-1 text-xs text-cyan-900/80">
                  Válaszd ki a célgyülekezetet — az ottani lelkész{' '}
                  <strong>rendszerüzenetet kap</strong> az átjelentkezési kérelemről,
                  és el- vagy elutasíthatja. Ha külföldre / ismeretlen helyre mennek,
                  hagyd ezt üresen (akkor csak az új helység tárolódik).
                </p>
                <p className="mt-2 text-[11px] text-cyan-700/80">
                  Tipp: ha különböző tagok különböző gyülekezetekbe mennek, a most
                  választott gyülekezet az <strong>alapértelmezett</strong> lesz —
                  ezt később sor-szintenként felülírhatod (még nem támogatott, jelenleg
                  globális).
                </p>
              </div>
            </div>
            <div className="mt-3">
              {isLoadingTree ? (
                <div className="flex items-center gap-2 text-sm text-cyan-700">
                  <Loader2 className="size-4 animate-spin" />
                  Egyházmegyék betöltése…
                </div>
              ) : (
                <CongregationSearchSelect
                  value={config.elkoltozottTargetCongregationId || null}
                  onChange={(id) =>
                    onConfigChange({
                      ...config,
                      elkoltozottTargetCongregationId: id,
                    })
                  }
                  tree={tree}
                  unassigned={unassigned}
                  placeholder="— Külföldre / ismeretlen (nincs notifikáció) —"
                  tone="cyan"
                />
              )}
            </div>
            {config.elkoltozottTargetCongregationId && (
              <p className="mt-2 text-[11px] text-cyan-700">
                ✓ Az itt választott gyülekezet az ALAPÉRTELMEZETT — ha a sor-szintű
                táblában (lent) felülírod, az élvez prioritást.
              </p>
            )}
          </div>
        )}

        {/* Elköltözés sor-szintű célgyülekezet-tábla (override a globális dropdown felett) */}
        {showElkoltozottOptions && elkoltozottTable && (
          <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-cyan-100">
            <p className="text-sm font-semibold text-slate-800">
              Sor-szintű célgyülekezet (felülírás)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ha a XML-ben különböző tagok különböző gyülekezetekbe mennek,
              itt sor-szinten választhatsz célgyülekezetet. A rendszer
              auto-javaslatot készít a Hova-helység és a Megjegyzés alapján.
            </p>
            <div className="mt-3">{elkoltozottTable}</div>
          </div>
        )}

        {/* Egyéb mozgás (bekoltozott / attert / kitert) / baptism / burial — nincs különleges döntés */}
        {!showConfirmationOptions && !showMarriageOptions && !showElkoltozottOptions && (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
            <p className="text-sm text-slate-600">
              Erre az anyakönyv-típusra (
              <span className="font-semibold">{profileKey}</span>) nincs
              különleges beállítás — mehetünk az előnézetre.
              {isMovement && (
                <span className="mt-1 block text-xs text-slate-500">
                  Tagmozgásnál a férfi/családfő/gyerek jelölést a tagnyilvántartásból
                  vesszük át, az XML „i” oszlopát figyelmen kívül hagyjuk.
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="rounded-full">
          <ArrowLeft className="mr-1.5 size-4" />
          Vissza
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          className="rounded-full bg-violet-600 hover:bg-violet-700"
        >
          Tovább az előnézetre
          <ArrowRight className="ml-1.5 size-4" />
        </Button>
      </div>
    </div>
  )
}
