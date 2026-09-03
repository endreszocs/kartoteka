import { createYearlySettings, initFinance, listFinanceYears } from './actions'
import { checkOblioDeadline } from './oblio-ellenorzes-actions'
import { FinanceTabs } from '@/components/finance/finance-tabs'
import { getDelegatedImportStatus } from '@/app/(dashboard)/delegated-import/actions'
import { getGodModeStatus } from '@/app/(dashboard)/god-mode/actions-v4'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getFinanceScopeContext, type FinanceScope } from '@/lib/auth/finance-scope'
import { ensureDioceseBealitasForYear } from '@/app/(dashboard)/dashboard-egyhazmegye/diocese-actions'
// 2026-08-17 (kerületi S5): a megyei `ensureDioceseBealitasForYear` KERÜLETI
// PÁRJA. Szándékosan a `dashboard-kerulet/district-actions.ts`-ben él (a
// megyeié is a saját szintje fájljában) — az a fájl fejlécének (3) pontja
// előre ki is mondta, hogy „ha az S5 megjön, ide kerül a párja".
import { ensureDistrictBealitasForYear } from '@/app/(dashboard)/dashboard-kerulet/district-actions'
import { YearlySettingsDialog } from '@/components/modals/yearly-settings-dialog'

export default async function PenzugyPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>
}) {
  const access = await getEffectiveAccessContext()
  if (!access.user) return null

  // ⚠️ 2026-08-11 (számvevő-kör, review-fix) — RÉTEG-DIVERGENCIA MEGSZÜNTETÉSE.
  //
  // MI VOLT A HIBA: ez az oldal SAJÁT szabállyal döntött a hatókörről
  // (`activeProfileRole?.scope === 'diocese' && …`), miközben az összes
  // szerver akció a `getFinanceScopeContext()`-tel. A kettő SZÉTHÚZHAT: az
  // oldal gyülekezeti nézetben renderelt, az action-ök viszont megyeinek
  // hitték magukat (vagy fordítva) — a lelkész ilyenkor kitöltött képernyőt
  // lát, és minden mentés elutasításba fut. Mostantól EGY forrás dönt.
  //
  // Ráadásul innen jön a `readOnly` is: az egyházmegyei SZÁMVEVŐ ugyanezt az
  // oldalt nyitja meg, de nem írhat.
  const financeCtx = await getFinanceScopeContext()
  if ('error' in financeCtx) {
    // HANGOS hiba, nem néma `null`: eddig üres képernyő jött, és a lelkész nem
    // tudta, mit tegyen.
    return (
      <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
        <p className="text-lg">{financeCtx.error}</p>
      </div>
    )
  }
  // 2026-08-17 (kerületi S5): a típus a hatókör-modul HÁROM-értékű uniója. Az
  // eddigi kézzel írt `'congregation' | 'diocese'` annotáció fordítási hibát ad
  // a harmadik szinttől — ez SZÁNDÉKOS és hasznos: a szűkítő annotáció az a
  // hely, ahol egy új szint még HANGOSAN elakad, nem némán a gyülekezeti ágra
  // esik. Mostantól a modul típusa a forrás, nem egy kézi másolat.
  const scope: FinanceScope = financeCtx.scope
  const scopeId = financeCtx.scopeId
  const readOnly = financeCtx.readOnly
  const readOnlyReason = financeCtx.readOnlyReason

  // ANAF SPV 60 napos határidő figyelő — csak congregation scope-ban releváns
  if (scope === 'congregation') {
    // 2026-09-03 (átvilágítás P1): a hibát NEM nyeljük el némán. A csengő
    // 2026-04 óta hallgatott, mert az RPC hibáját itt is, a hívott függvényben
    // is elnyeltük — és így senki nem tudta meg, hogy a bírság-kockázatú
    // 60 napos ANAF-határidőről nem érkezik figyelmeztetés.
    void checkOblioDeadline()
      .then((r) => {
        if (r.status === 'hiba') {
          console.error(
            '[penzugy] Az ANAF 60 napos csengő nem működik — a lelkész nem kap ' +
              'figyelmeztetést a letöltési határidőről. Ok:',
            r.hibaUzenet,
          )
        }
      })
      .catch((e) => {
        console.error('[penzugy] Az ANAF 60 napos csengő hívása elhasalt:', e)
      })
  }

  // A megjelenített év a `?year=` URL-paraméterből (hero-beli év-választó); ha nincs
  // vagy érvénytelen, az aktuális év. Így visszamenőleg is megnézhető bármely év.
  const params = (await searchParams) || {}
  const realYear = new Date().getFullYear()
  const parsedYear = Number(params.year)
  const selectedYear =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= realYear + 1
      ? parsedYear
      : realYear

  // 2026-06-30 (perf): a 4 független szerver-lekérés EGYETLEN párhuzamos hullámban
  // (getGodModeStatus + getDelegatedImportStatus + initFinance + listFinanceYears).
  // Eddig szekvenciálisan futottak; a getEffectiveAccessContext React-cache-elt, így
  // a belső újra-hívások nem okoznak extra DB round-tripet. A `data` mutálható marad
  // a settings-fallback újratöltésekhez (lentebb).
  const [godMode, delegatedImport, data0, availableYears] = await Promise.all([
    access.master ? getGodModeStatus() : Promise.resolve({ active: false }),
    getDelegatedImportStatus('finance'),
    initFinance(selectedYear),
    listFinanceYears(),
  ])
  let data = data0

  if (!data) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
        <p className="text-lg">Nincs elérhető pénzügyi adat. Ellenőrizze a profil beállításokat.</p>
      </div>
    )
  }

  // 2026-04-19: scope-aware settings kezelés
  if (!data.settings) {
    // ⛔ 2026-08-17 (kerületi S5) — NÉMA GYÜLEKEZETI VISSZAESÉS JAVÍTÁSA.
    // Itt eddig `if (scope === 'diocese') { … } else { …gyülekezeti… }` állt.
    // A kerület az `else` ágra esett volna, ahol a kód a `congregations`
    // táblából olvas `scopeId`-vel — csakhogy a `scopeId` ilyenkor egy
    // KERÜLET UUID-je: 0 sor, `yearlyFee = 0`, és a kerületi adminisztrátor a
    // gyülekezeti „éves egyházfenntartói járulék" űrlapot (YearlySettingsDialog)
    // kapta volna a kerületi könyvelés helyett. Hibaüzenet nélkül.
    // A kapu mostantól a GYÜLEKEZETI sajátosságot nevezi meg; a megyei ág
    // viselkedése (és minden szövege) változatlan.
    if (scope !== 'congregation') {
      // A két felső szint UGYANAZT csinálja, csak más táblára és más felirattal.
      // Egy helyen soroljuk fel a különbségeket, hogy a két szint ne húzhasson
      // szét (a projekt visszatérő hibaosztálya: „a második felület a régi
      // implementációt őrzi").
      const felsoSzint =
        scope === 'diocese'
          ? {
              szintNev: 'az egyházmegye',
              illetekes: 'az esperes vagy az egyházmegyei adminisztrátor teszi meg',
              jelzes: 'jelezd nekik',
              ensureBealitas: ensureDioceseBealitasForYear,
            }
          : {
              szintNev: 'az egyházkerület',
              illetekes: 'az egyházkerületi adminisztrátor teszi meg',
              jelzes: 'jelezd neki',
              ensureBealitas: ensureDistrictBealitasForYear,
            }

      // ⚠️ 2026-08-11 (számvevő-kör, review-fix): az `ensureDioceseBealitasForYear`
      // ÍR (`requireDioceseAccess(..., 'write')`, és az adatbázisban a
      // RESTRICTIVE `diocese_bealitas_szamvevo_iras_tilos` policy is blokkolja).
      // A számvevő tehát MINDEN olyan évre, amit az esperes még nem nyitott meg,
      // egy hibakártyát kapott a teljes tartalom helyett („… nem módosíthatod")
      // — pont az a régi tünet, amit ez a kör megszüntet. Ellenőri nézetben
      // ezért NEM hívjuk: magyarázó üres állapotot mutatunk.
      // (2026-08-17: ugyanez érvényes a KERÜLETI számvevőre és a kerületi
      // párra — a `district_bealitas` írását ott is a szerep-szűrt hatókör védi.)
      if (readOnly) {
        return (
          <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
            <p className="text-lg">
              Erre az évre ({selectedYear}) {felsoSzint.szintNev} még nem nyitotta meg a
              könyvelést.
            </p>
            <p className="mt-2 text-sm">
              Ellenőrként (számvevőként) nem tudod létrehozni az éves konfigurációt — ezt{' '}
              {felsoSzint.illetekes}. Válassz olyan évet, amelyikben már van könyvelés,
              vagy {felsoSzint.jelzes}.
            </p>
          </div>
        )
      }
      // Felső szinten NINCS éves egyházfenntartás beállítás!
      // Automatikusan létrehozunk egy üres `diocese_bealitas` / `district_bealitas`
      // sort az évre, és azonnal újratöltünk — a felhasználó nem lát külön dialógust.
      const ensure = await felsoSzint.ensureBealitas(scopeId, selectedYear)
      if (ensure.error) {
        return (
          <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
            <p className="text-lg">Nem sikerült létrehozni az éves konfigurációt: {ensure.error}</p>
          </div>
        )
      }
      // Újratöltjük az adatokat — most már van `settings`
      data = await initFinance(selectedYear)
      if (!data || !data.settings) {
        return (
          <div className="bg-white rounded-xl border p-8 text-center text-muted-foreground">
            <p className="text-lg">A pénzügyi inicializáció nem járt sikerrel. Próbáld újra.</p>
          </div>
        )
      }
    } else {
      // Gyülekezeti módban a wizardban már bekért éves alapadatokból próbáljuk
      // automatikusan létrehozni a hiányzó `bealitas` sort, külön dialóg nélkül.
      const { data: congregationDefaults } = await access.supabase
        .from('congregations')
        .select('eves_jarulek, jarulek_hatarid')
        .eq('id', scopeId)
        .maybeSingle()

      const yearlyFee = Number(congregationDefaults?.eves_jarulek) || 0
      const deadline = congregationDefaults?.jarulek_hatarid || '07-01'

      if (yearlyFee > 0) {
        // Render közben NEM revalidálunk (Next 16); az alábbi initFinance úgyis újratölt.
        const ensure = await createYearlySettings(selectedYear, yearlyFee, deadline, {
          revalidate: false,
        })
        if (!ensure.error) {
          data = await initFinance(selectedYear)
        }
      }

      if (!data?.settings) {
        // A statikus zsákutca helyett INTERAKTÍV űrlap: a lelkész itt megadhatja az éves
        // járulékot + fizetési határidőt, és a rendszer létrehozza a `bealitas` sort, majd
        // frissül az oldal. (Eddig, ha a welcome wizardban nem volt éves járulék, csak egy
        // „ellenőrizze / kérjen segítséget" zsákutca jelent meg.)
        return <YearlySettingsDialog year={selectedYear} />
      }
    }
  }

  // 2026-05-25: a "Rendszergazdai importáló" fül a FinanceTabs belső tab-listájának
  // VÉGÉN jelenik meg (Súgó után, red-prominent színnel), nem külön ModuleAdminWorkspace
  // wrapperrel a tetején. Jogosultság: CSAK aktív god mode vagy delegated import
  // (2026-05-29: admin szerepkör önmagában már nem mutatja).
  const showAdminImport = godMode.active || delegatedImport.active

  return (
    <div className="space-y-4">
      <FinanceTabs
        // Év-váltáskor (hero-beli év-választó → ?year=) a kliens-komponens újratöltése,
        // hogy a tételek (useState-ben tárolt initialIncome/Expense) a kiválasztott
        // ÉV adatára frissüljenek — különben a régi (alapértelmezett évi) sorok ragadnának bent.
        key={selectedYear}
        settings={data.settings}
        szamadasiCellek={data.szamadasiCellek}
        bevCelMap={data.bevCelMap}
        kiaCelMap={data.kiaCelMap}
        bmBevCelIds={data.bmBevCelIds}
        bmKiaCelIds={data.bmKiaCelIds}
        bankAccounts={data.bankAccounts}
        internalTransfers={data.internalTransfers}
        initialIncome={data.initialIncome}
        initialExpense={data.initialExpense}
        carryoverCash={data.carryoverCash}
        carryoverBank={data.carryoverBank}
        bankNyitoMap={data.bankNyitoMap}
        congregationName={data.congregationName}
        congregationNameRo={data.congregationNameRo}
        congregationId={scopeId}
        // 2026-08-15 (egyházmegyei terv, 2.1/3): a megyei nyomtatvány-borító
        // felső blokkja az EGYHÁZKERÜLETÉ. Gyülekezeti hatókörben `null`.
        districtName={data.districtName}
        // 2026-08-22 (6. pont): a felettes kerület HIVATALOS ROMÁN neve —
        // a hardkódolt „EPARHIA REFORMATĂ" helyett.
        districtNameRo={data.districtNameRo}
        debtCalcMode={data.debtCalcMode}
        yearlyFees={data.yearlyFees}
        debtRows={data.debtRows}
        receiptHealth={data.receiptHealth}
        currentYear={data.currentYear}
        availableYears={availableYears}
        isGodMode={godMode.active}
        scope={scope}
        // 2026-08-11 (számvevő-kör): ellenőri nézet — a rögzítő gombok ELŐRE
        // letiltva, magyarázó sávval. A valódi zár a szerver akciókban van
        // (`financeWriteBlock`), ez a felhasználó kímélete.
        readOnly={readOnly}
        readOnlyReason={readOnlyReason}
        showAdminImport={showAdminImport}
      />
    </div>
  )
}
