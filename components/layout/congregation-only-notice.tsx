import Link from 'next/link'
import { AlertCircle, ArrowRight, Building2, Shield } from 'lucide-react'

/**
 * Informatív üzenet azoknak a gyülekezeti moduloknak (tagnyilvántartás,
 * anyakönyv, iktatás, sírhelyek, leltár, stb.), amelyek CSAK gyülekezeti
 * scope-ban érhetők el.
 *
 * Mikor jelenik meg:
 *   - Az user admin / esperes / kerületi scope-ban van (nincs
 *     effectiveCongregationId), de direkt URL-lel idenavigált.
 *   - A sidebar ezeket a menüpontokat már szűri, de ha valaki könyvjelzőből
 *     vagy linkelt oldalról jön, üres helyett ezt a tájékoztatót látja.
 */
export function CongregationOnlyNotice({
  module = 'Ez a modul',
  currentScope = 'admin',
}: {
  module?: string
  currentScope?: 'admin' | 'diocese' | 'district' | 'other'
}) {
  const scopeLabel =
    currentScope === 'admin'
      ? 'rendszergazda'
      : currentScope === 'diocese'
        ? 'egyházmegyei'
        : currentScope === 'district'
          ? 'egyházkerületi'
          : 'nem-gyülekezeti'

  const redirectHref =
    currentScope === 'diocese'
      ? '/dashboard-egyhazmegye'
      : currentScope === 'district'
        ? '/dashboard-kerulet'
        : currentScope === 'admin'
          ? '/admin'
          : '/'
  const redirectLabel =
    currentScope === 'diocese'
      ? 'Egyházmegyei irányítópult'
      : currentScope === 'district'
        ? 'Egyházkerületi irányítópult'
        : currentScope === 'admin'
          ? 'Admin Panel'
          : 'Kezdőlap'

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="card-raised p-6 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 border-amber-200">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <AlertCircle className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading text-lg text-slate-800">
              {module} csak gyülekezeti módban érhető el
            </h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Jelenleg {scopeLabel} profilban vagy, amely nem tartalmaz közvetlen
              gyülekezeti adatokat. A gyülekezet-specifikus modulok (tagnyilvántartás,
              anyakönyv, iktatás, leltár, stb.) csak gyülekezeti szerepkörrel
              (pl. lelkész) érhetők el.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href={redirectHref}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition"
              >
                {currentScope === 'admin' && <Shield className="size-4" />}
                {(currentScope === 'diocese' || currentScope === 'district') && <Building2 className="size-4" />}
                {redirectLabel}
                <ArrowRight className="size-3.5" />
              </Link>
              <span className="text-xs text-slate-500">
                · Vagy válts gyülekezeti profilra a fejlécben
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
