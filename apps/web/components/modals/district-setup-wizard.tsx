'use client'

/**
 * Egyházkerület setup wizard — a kerületi alapadatok bevitele (3. szint).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT VAN EGYÁLTALÁN SZÜKSÉG RÁ (2026-08-15/16, S2)
 * ════════════════════════════════════════════════════════════════════════════
 * Az élő adatbázisban a `districts` táblának HÁROM oszlopa volt: `id`, `name`,
 * `created_at`. Az egyházmegyei (`dioceses`) párjának 31. Azaz a kerületnek nem
 * volt sem hivatalos román neve, sem CIF-je, sem címe, sem címere, sem
 * püspöki aláírása — miközben a kerület ugyanúgy ad ki hivatalos iratot, mint a
 * megye. Ez a varázsló tölti fel azt a törzsadatot, amit az S2 migráció felvitt
 * a táblára.
 *
 * 5 lépés (a megyei pár tükre):
 *   1. Alapadatok + címer (+ püspöki pecsét/aláírás)
 *   2. Cím
 *   3. Elérhetőségek
 *   4. Bank + vezetés
 *   5. Megerősítés + mentés
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A MEGYEI VARÁZSLÓ HÁROM MAI JAVÍTÁSA — ITT MÁR SZÜLETÉSTŐL BENNE VAN
 * ════════════════════════════════════════════════════════════════════════════
 * (1) „MIÉRT nem léphetsz tovább" sáv — lásd `stepBlockReason()`. Egy letiltott
 *     gomb indoklás nélkül vakvágány: a felhasználó azt látja, mindent
 *     kitöltött, tehát azt hiszi, a program romlott el.
 * (2) NINCS ADATVESZTÉS — lásd `mentsdAmiBeVanIrva()`. A beírt adat mentődik a
 *     „Tovább"-nál, a „Vissza"-nál ÉS a kilépésnél (Később / X / ESC / kívülre
 *     kattintás) is.
 *     ⚠️ 2026-08-16: pont EZ az ígéret fordult a visszájára (lásd a `betoltve`
 *     állapot kommentjét) — a mentés attól lett veszélyes, hogy a betöltés
 *     BEFEJEZŐDÉSÉT nem várta meg. A javítás ott van, ne írd vissza.
 * (3) A BANKSZÁMLA NEM KÖTELEZŐ (Endre: „a banki kontók beállítása később") —
 *     sem a lépés-validációban, sem a feliratokban; a záró összesítő viszont
 *     LÁTHATÓAN jelzi, ha üresen maradt.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * KERÜLETI KÜLÖNBSÉGEK A MEGYEIHEZ KÉPEST
 * ════════════════════════════════════════════════════════════════════════════
 *   · VEZETÉS: a megyei esperes/jegyző/számvevő hármas helyett a kerületnél
 *     PÜSPÖK + ADMINISZTRÁTOR + (nem kötelező) SZÁMVEVŐ áll (Endre szava:
 *     „püspök, adminisztrátorok"). A `puspok_cim` — a megyei `esperes_cim`
 *     tükre — TISZTSÉG-szöveg (pl. „püspök"), nem személynév, ezért az az
 *     egyetlen mező, ami sima szövegmező marad.
 *   · TESZT-KERÜLET: az élesben ott van egy „Teszt Egyházkerület" is. Ha a
 *     szerkesztett kerület teszt-kerület, a felület LÁTHATÓAN megjelöli. A
 *     döntést a SZERVER hozza (`DistrictRecord.teszt`), a varázsló csak
 *     megjeleníti — lásd a `teszt` állapot kommentjét.
 *   · A hivatalos ROMÁN név KÖTELEZŐ, az angol opcionális (a megyei minta).
 *
 * ⚠️ SZÍN: a kerületi szint azonosító színe LILA (`#8b5cf6` — lásd a
 *    profilválasztó `SCOPE_COLOR.district`-jét), ezért a violet skála megy
 *    végig. A FELÜLETEK viszont token-alapúak (`bg-card`, `text-foreground`,
 *    `border-border`), nem hardcode-olt fehér — így a sötét mód is helyes.
 */

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, ArrowRight, Banknote, CheckCircle2, FileText,
  FlaskConical, Image as ImageIcon, Landmark, Loader2, MapPin, Phone, Save,
  Upload, Users, X,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalField } from '@/components/ui/modal-field'
import { Badge } from '@/components/ui/badge'
import { AddressForm, type AddressValue } from '@/components/ui/address-form'
import {
  getDistrict, saveDistrictSetup, saveDistrictSetupStep, uploadDistrictCimer,
  getDistrictIratKepek, uploadDistrictIratKep, clearDistrictIratKep,
  getDistrictVezetoJeloltek,
  type VezetoJeloltek,
} from '@/app/(dashboard)/dashboard-kerulet/district-actions'
// A pecsét/aláírás-feltöltő UI a KÖZÖS komponensből — a gyülekezeti és a megyei
// varázsló ugyanezt használja a saját szerver-akcióival (a „második felület a
// régi implementációt őrzi" hibaosztály ellen).
import { IratKepekSection } from '@/components/shared/irat-kepek-section'
// A vezetők nevét listából lehessen választani, ne kézzel begépelni (Endre).
import { VezetoValaszto } from '@/components/shared/vezeto-valaszto'

type WizardStep = 'basics' | 'address' | 'contact' | 'bank-leadership' | 'confirm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  districtId: string
  onCompleted?: () => void | Promise<void>
}

interface SetupFormState {
  name: string
  /** Hivatalos ROMÁN név — KÖTELEZŐ (a hivatalos iratok fejléce ebből építi a
   *  kétnyelvű alakot, a gyülekezeti/megyei minta szerint). */
  nev_ro: string
  /** Angol név — opcionális. */
  nev_en: string
  cif: string
  adoszam: string
  cimer_url: string
  cim_orszag: string
  cim_megye: string
  cim_telepules: string
  cim_iranyitoszam: string
  cim_utca: string
  email: string
  telefon: string
  weboldal: string
  bank_nev: string
  bank_fo_iban: string
  bank_fo_iban_valuta: string
  /** A püspök NEVE — ez kerül a hivatalos irat aláírás-rovatába. */
  puspok_nev: string
  /** A püspök CÍME = a TISZTSÉG szövege (pl. „püspök", „püspökhelyettes").
   *  A megyei `esperes_cim` tükre: nem személy, ezért nem választható listából. */
  puspok_cim: string
  /** A kerületi adminisztrátor (hivatalvezető) neve. */
  adminisztrator_nev: string
  /** A kerületi számvevő neve — NEM kötelező (nincs minden kerületben kiosztva). */
  szamvevo_nev: string
  // Cím FK-k (a hivatalos romániai cím-adatbázisból)
  adrlocality_id: number | null
  adrstreet_id: number | null
  isForeign: boolean
}

type SetForm = (f: SetupFormState) => void

const STEP_ORDER: WizardStep[] = ['basics', 'address', 'contact', 'bank-leadership', 'confirm']

/** A lépések magyar neve — a „miért nem léphetsz tovább" üzenethez. */
const STEP_LABELS: Record<WizardStep, string> = {
  basics: 'Alapadatok',
  address: 'Cím',
  contact: 'Elérhetőségek',
  'bank-leadership': 'Bank és vezetés',
  confirm: 'Ellenőrzés',
}

/**
 * ⚠️ ITT VOLT EGY `tesztKerulet(nev)` FELISMERŐ — SZÁNDÉKOSAN TÖRÖLVE
 * (2026-08-16). NE ÉPÍTSD VISSZA.
 *
 * TÜNET VOLT: a felület felületenként MÁST mondott ugyanarról a kerületről. A
 * szerver `keruletTesztE()`-je RÉSZSZTRINGET néz (`.includes('teszt')`), a
 * varázsló viszont SZÓ-szintűt nézett, ráadásul a „próba"/„proba" szót is
 * teszt-jelölésnek vette. Így pl. a „Próbaegyházkerület" a varázslóban teszt
 * volt, a kerületi bannerben nem — Endre kérése pedig épp az volt, hogy a
 * teszt-kerület MINDENHOL láthatóan meg legyen jelölve.
 *
 * KÉT DEFINÍCIÓ UGYANARRA = garantált széthúzás. Egyetlen igazság-forrás van:
 * a szerver `DistrictRecord.teszt` mezője, amit a betöltő effect úgyis megkap.
 */

// Pure step-validáció — a wizard kliens ÉS a betöltés ugyanazt használja
// (így a betöltés után meg tudja mondani, melyik az első hiányos lépés).
function isStepValidOn(s: WizardStep, form: SetupFormState): boolean {
  if (s === 'basics')
    // A ROMÁN név is kötelező — enélkül a hivatalos irat fejléce csak magyarul
    // tudna megjelenni (a román hatóság felé ez nem elég).
    return form.name.trim().length >= 2 && form.nev_ro.trim().length >= 2
      && form.cif.trim().length > 0 && form.cimer_url.trim().length > 0
  if (s === 'address')
    return (
      form.cim_orszag.trim().length > 0 &&
      form.cim_megye.trim().length > 0 &&
      form.cim_telepules.trim().length > 0 &&
      form.cim_iranyitoszam.trim().length > 0 &&
      form.cim_utca.trim().length > 0
    )
  if (s === 'contact')
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && form.telefon.trim().length > 0
  if (s === 'bank-leadership')
    // A BANKSZÁMLA SZÁNDÉKOSAN NEM SZEREPEL ITT (Endre, 2026-08-15): „a banki
    // kontók beállítása később". A bankszámla nem a hivatalos irat fejlécéhez
    // kell (az a név, a cím és a CIF), hanem a pénzforgalomhoz; azt viszont
    // ritkán tudja fejből az, aki a törzsadatot rögzíti. A varázsló záró
    // összesítője KIÍRJA, ha üresen maradt.
    return (
      form.puspok_nev.trim().length >= 2 &&
      form.puspok_cim.trim().length >= 2 &&
      form.adminisztrator_nev.trim().length >= 2
    )
  if (s === 'confirm')
    return STEP_ORDER.slice(0, -1).every((st) => isStepValidOn(st, form))
  return false
}

/**
 * MIÉRT nem léphet tovább a felhasználó — magyarul, mezőnév szerint.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MIÉRT KELL EZ (2026-08-15, Endre észrevétele a megyei varázslóra)
 * ════════════════════════════════════════════════════════════════════════════
 * TÜNET VOLT: „kitöltöttem a kötelező részeket, de mégsem tudok tovább lépni".
 * A 3. lépésen az e-mail `kezdiorbaigmail.com` volt — hiányzott belőle a `@`.
 * Az `isStepValidOn` helyesen elutasította, a „Tovább" gomb letiltódott — DE
 * SEMMI nem mondta meg, MELYIK mező és MIÉRT. A `fieldErrors` csak a szerver
 * válaszából töltődik, oda viszont el sem jutunk: a gomb tiltva van.
 *
 * Ugyanaz a hibaosztály, mint a néma 0-soros mentés: a program TUD valamit,
 * amit nem mond el. Ezért a tiltás indoka UGYANABBÓL a tiszta függvényből
 * származik, ami a tiltást is eldönti — a kettő SOHA nem mondhat mást.
 *
 * `null` = a lépés érvényes, nincs mit kiírni.
 */
function stepBlockReason(s: WizardStep, form: SetupFormState): string | null {
  if (isStepValidOn(s, form)) return null

  const hianyzo: string[] = []

  if (s === 'basics') {
    if (form.name.trim().length < 2) hianyzo.push('Hivatalos magyar név')
    if (form.nev_ro.trim().length < 2) hianyzo.push('Hivatalos román név')
    if (form.cif.trim().length === 0) hianyzo.push('CIF (adószám)')
    if (form.cimer_url.trim().length === 0) hianyzo.push('Címer')
  } else if (s === 'address') {
    if (form.cim_orszag.trim().length === 0) hianyzo.push('Ország')
    if (form.cim_megye.trim().length === 0) hianyzo.push('Megye')
    if (form.cim_telepules.trim().length === 0) hianyzo.push('Település')
    if (form.cim_iranyitoszam.trim().length === 0) hianyzo.push('Irányítószám')
    if (form.cim_utca.trim().length === 0) hianyzo.push('Utca, házszám')
  } else if (s === 'contact') {
    // ⚠️ Az e-mailnél KÜLÖN üzenet kell: nem „hiányzik", hanem „nem jó alakú".
    // Épp ezt nem lehetett kitalálni a néma letiltásból.
    const email = form.email.trim()
    if (email.length === 0) {
      hianyzo.push('E-mail cím')
    } else if (!email.includes('@')) {
      return (
        `Az e-mail címből hiányzik a „@” jel: „${email}”. ` +
        'Helyes alak például: hivatal@egyhazkerulet.ro'
      )
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return (
        `Ez az e-mail cím nem érvényes: „${email}”. ` +
        'Ellenőrizd a @ utáni részt — kell bele egy pont is, például: hivatal@egyhazkerulet.ro'
      )
    }
    if (form.telefon.trim().length === 0) hianyzo.push('Telefonszám')
  } else if (s === 'bank-leadership') {
    // A bank SZÁNDÉKOSAN nincs itt — 2026-08-15 óta később is pótolható.
    if (form.puspok_nev.trim().length < 2) hianyzo.push('Püspök neve')
    if (form.puspok_cim.trim().length < 2) hianyzo.push('Püspök címe (tisztsége)')
    if (form.adminisztrator_nev.trim().length < 2) hianyzo.push('Kerületi adminisztrátor neve')
  } else if (s === 'confirm') {
    const hianyosLepesek = STEP_ORDER.slice(0, -1)
      .filter((st) => !isStepValidOn(st, form))
      .map((st) => STEP_LABELS[st])
    if (hianyosLepesek.length > 0) {
      return `Még hiányos lépés: ${hianyosLepesek.join(', ')}. Lépj vissza és pótold.`
    }
  }

  if (hianyzo.length === 0) return null
  return hianyzo.length === 1
    ? `Ez a mező még hiányzik: ${hianyzo[0]}`
    : `Ezek a mezők még hiányoznak: ${hianyzo.join(', ')}`
}

/**
 * Melyik mezőket menti a részleges (lépésenkénti) mentés az adott lépésen.
 *
 * A `saveDistrictSetupStep` szerver-akció CSAK a ténylegesen átadott mezőket
 * írja — ezért hiányos lépést is nyugodtan elmenthetünk, nem ront el semmit.
 */
function stepFields(s: WizardStep, form: SetupFormState): Record<string, unknown> {
  switch (s) {
    case 'basics':
      return {
        name: form.name,
        cif: form.cif,
        adoszam: form.adoszam,
        nev_ro: form.nev_ro,
        nev_en: form.nev_en,
        cimer_url: form.cimer_url,
      }
    case 'address':
      return {
        cim_orszag: form.cim_orszag,
        cim_megye: form.cim_megye,
        cim_telepules: form.cim_telepules,
        cim_iranyitoszam: form.cim_iranyitoszam,
        cim_utca: form.cim_utca,
        adrlocality_id: form.adrlocality_id,
        adrstreet_id: form.adrstreet_id,
      }
    case 'contact':
      return {
        email: form.email,
        telefon: form.telefon,
        weboldal: form.weboldal,
      }
    case 'bank-leadership':
      return {
        bank_nev: form.bank_nev,
        bank_fo_iban: form.bank_fo_iban,
        bank_fo_iban_valuta: form.bank_fo_iban_valuta,
        puspok_nev: form.puspok_nev,
        puspok_cim: form.puspok_cim,
        adminisztrator_nev: form.adminisztrator_nev,
        szamvevo_nev: form.szamvevo_nev,
      }
    default:
      return {}
  }
}

// ────────────────────────────────────────────────────────────────────
// AddressValue ↔ SetupFormState átalakítás
// (a districts-nek — a dioceses-hez hasonlóan — nincs külön `hazszam`
//  oszlopa, ezért a házszám a `cim_utca`-ba kombinálódik)
// ────────────────────────────────────────────────────────────────────

function formToAddressValue(form: SetupFormState): AddressValue {
  return {
    countyId: null,
    localityId: form.adrlocality_id,
    streetId: form.adrstreet_id,
    country: form.cim_orszag || 'Románia',
    county: form.cim_megye || '',
    locality: form.cim_telepules || '',
    street: form.cim_utca || '',
    houseNumber: '', // nincs külön oszlop — a cim_utca tartalmazhatja
    postalcode: form.cim_iranyitoszam || '',
    isForeign: form.isForeign || false,
  }
}

function applyAddressToForm(form: SetupFormState, v: AddressValue): SetupFormState {
  const combinedStreet = v.houseNumber
    ? `${v.street} ${v.houseNumber}`.trim()
    : v.street
  return {
    ...form,
    cim_orszag: v.country,
    cim_megye: v.county,
    cim_telepules: v.locality,
    cim_utca: combinedStreet,
    cim_iranyitoszam: v.postalcode,
    adrlocality_id: v.localityId,
    adrstreet_id: v.streetId,
    isForeign: v.isForeign,
  }
}

export function DistrictSetupWizard({ open, onOpenChange, districtId, onCompleted }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<WizardStep>('basics')
  const [loading, setLoading] = useState(true)
  /**
   * ⛔ NÉMA ADATVESZTÉS ELLENI ZÁR — a varázsló CSAK akkor írhat, ha az élő
   * adatot SIKERESEN betöltöttük. `false` = a `form` még a gyári üres kezdőérték
   * (vagy egy korábbi megnyitás maradéka), tehát a mentése TÖRÖLNÉ az élő sort.
   *
   * ════════════════════════════════════════════════════════════════════════
   * MIÉRT KELL (2026-08-16, adverzariális ellenőrzés — BLOKKOLÓ)
   * ════════════════════════════════════════════════════════════════════════
   * A fenti docblock azt ígéri, hogy „nincs adatvesztés" — és pont ez az ígéret
   * fordult a visszájára. A `mentsdAmiBeVanIrva()` a KILÉPÉS útjába van kötve,
   * a `stepFields()` üres sztringjeit pedig a szerver NULL-ra fordítja. Két út
   * vezetett a törléshez:
   *   (a) VERSENYHELYZET: a „Később" gomb csak az `isPending`/`stepSaving`-re
   *       volt letiltva, az ESC / X / kívülre kattintás pedig MINDIG aktív. Aki
   *       lassú hálón a betöltés BEFEJEZŐDÉSE ELŐTT kilépett, a MÉG ÜRES kezdő
   *       űrlapot mentette rá az élő sorra.
   *   (b) HIBÁS BETÖLTÉS: ha a `getDistrict` hibázott, a régi kód csak
   *       `setStep` + `setLoading(false)`-t futtatott — se toast, se hibaállapot.
   *       A felhasználó ÜRES űrlapot látott az ÉLŐ adat fölött, és a legelső
   *       Vissza / Később / X letörölte a CIF-et, a román és angol nevet, az
   *       adószámot ÉS a címer_url-t.
   * Ezért: `loading || !betoltve` esetén a varázsló NEM ír. Egy „egyszerűsítés",
   * ami ezt a két őrszemet kiveszi, visszahozza a néma adatvesztést.
   */
  const [betoltve, setBetoltve] = useState(false)
  /**
   * Teszt-kerület-e — a SZERVER döntése (`DistrictRecord.teszt`), nem helyi
   * találgatás. Lásd a törölt `tesztKerulet()` helyén álló kommentet: két
   * felismerő két különböző választ adott ugyanarra a névre.
   */
  const [teszt, setTeszt] = useState(false)

  const [form, setForm] = useState<SetupFormState>({
    name: '',
    nev_ro: '',
    nev_en: '',
    cif: '',
    adoszam: '',
    cimer_url: '',
    cim_orszag: 'Románia',
    cim_megye: '',
    cim_telepules: '',
    cim_iranyitoszam: '',
    cim_utca: '',
    email: '',
    telefon: '',
    weboldal: '',
    bank_nev: '',
    bank_fo_iban: '',
    bank_fo_iban_valuta: 'RON',
    puspok_nev: '',
    // A megyei `esperes_cim` alapértéke „esperes" — a kerületi párja „püspök".
    puspok_cim: 'püspök',
    adminisztrator_nev: '',
    szamvevo_nev: '',
    adrlocality_id: null,
    adrstreet_id: null,
    isForeign: false,
  })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [stepSaving, setStepSaving] = useState(false)
  // A vezetők listából választhatók — a jelöltek betöltése a megnyitáskor, a
  // többi adattal együtt. `null` = még tölt / nem oldható fel; ilyenkor a
  // VezetoValaszto a kézi beírásra esik vissza (fail-soft).
  const [vezetoJeloltek, setVezetoJeloltek] = useState<VezetoJeloltek | null>(null)

  // Betöltés: meglévő adatok előtöltése + folytatás-logika.
  // ⚠️ A setState-ek SZÁNDÉKOSAN a queueMicrotask törzsében futnak, nem az
  //    effect törzsében — a react-hooks/set-state-in-effect lint-szabály
  //    ERROR szintű ebben a repóban.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoading(true)
      // ⛔ Nyitáskor a zár BECSUKÓDIK: amíg az élő adat meg nem érkezett, a
      //    varázsló nem írhat. (Nem az effect törzsében, hanem itt — a
      //    react-hooks/set-state-in-effect ERROR szintű ebben a repóban; a
      //    microtask az első felhasználói interakció ELŐTT lefut.)
      setBetoltve(false)
      // A vezető-jelöltek betöltése párhuzamosan — ha hibázik, csendben üresen
      // marad, és a mezők kézi beírásra esnek vissza (fail-soft: a beállítás
      // NEM akadhat el azon, hogy a jelölt-listát nem tudtuk lekérni).
      void getDistrictVezetoJeloltek(districtId).then((j) => {
        if (!cancelled) setVezetoJeloltek(j)
      })
      void getDistrict(districtId).then((res) => {
        if (cancelled) return
        if (res.data) {
          const d = res.data
          const loadedForm: SetupFormState = {
            name: d.name || '',
            nev_ro: d.nev_ro || '',
            nev_en: d.nev_en || '',
            cif: d.cif || '',
            adoszam: d.adoszam || '',
            cimer_url: d.cimer_url || '',
            cim_orszag: d.cim_orszag || 'Románia',
            cim_megye: d.cim_megye || '',
            cim_telepules: d.cim_telepules || '',
            cim_iranyitoszam: d.cim_iranyitoszam || '',
            cim_utca: d.cim_utca || '',
            email: d.email || '',
            telefon: d.telefon || '',
            weboldal: d.weboldal || '',
            bank_nev: d.bank_nev || '',
            bank_fo_iban: d.bank_fo_iban || '',
            bank_fo_iban_valuta: d.bank_fo_iban_valuta || 'RON',
            puspok_nev: d.puspok_nev || '',
            puspok_cim: d.puspok_cim || 'püspök',
            adminisztrator_nev: d.adminisztrator_nev || '',
            szamvevo_nev: d.szamvevo_nev || '',
            adrlocality_id: d.adrlocality_id,
            adrstreet_id: d.adrstreet_id,
            isForeign: (d.cim_orszag && d.cim_orszag !== 'Románia') || false,
          }
          setForm(loadedForm)
          // Egyetlen igazság-forrás a teszt-jelöléshez: a szerver döntése.
          setTeszt(d.teszt === true)

          // Folytatás-logika: az első hiányos lépésre ugrunk — aki félbehagyta,
          // ne a már kitöltött 1. lépésen kezdje újra.
          const firstInvalid =
            STEP_ORDER.slice(0, -1).find((s) => !isStepValidOn(s, loadedForm)) ||
            'confirm'
          setStep(firstInvalid)
          // ⛔ A zár CSAK ITT nyílik ki: van élő adatunk, mostantól szabad írni.
          setBetoltve(true)
        } else {
          // ⛔ HIBÁS BETÖLTÉS — a régi kód itt NÉMÁN továbbengedte a
          //    felhasználót egy üres űrlapra az élő adat fölött, és a legelső
          //    kilépés letörölte a törzsadatot. Most: hangos hiba, és a
          //    `betoltve` FALSE marad, tehát a varázsló nem írhat semmit.
          toast.error(
            res.error ||
              'Az egyházkerület adatai nem tölthetők be. Zárd be az ablakot, és próbáld újra — ' +
                'amíg nincs meg az élő adat, a varázsló nem ír az adatbázisba.',
          )
          setTeszt(false)
          setStep('basics')
        }
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [open, districtId])

  function isStepValid(s: WizardStep): boolean {
    return isStepValidOn(s, form)
  }

  // MIÉRT van letiltva a gomb — ugyanabból a tiszta függvényből, ami a tiltást
  // is eldönti, tehát a kettő SOHA nem mondhat mást.
  const blockReason = stepBlockReason(step, form)

  async function handleNext() {
    // ⛔ Ugyanaz a zár, mint a mentsdAmiBeVanIrva()-ban: betöltetlen (vagy
    //    sikertelenül betöltött) állapotban a „Tovább" sem írhat üres mezőket
    //    az élő sorra.
    if (loading || !betoltve) return
    if (stepSaving) return
    const idx = STEP_ORDER.indexOf(step)
    if (idx >= STEP_ORDER.length - 1) return

    // Részleges mentés — a felhasználó kilépéskor nem veszít adatot.
    setStepSaving(true)
    try {
      const res = await saveDistrictSetupStep({
        id: districtId,
        ...stepFields(step, form),
      })
      if (res.error) {
        toast.error(`Mentés sikertelen: ${res.error}`)
        return
      }
      setStep(STEP_ORDER[idx + 1])
    } finally {
      setStepSaving(false)
    }
  }

  /**
   * A JELENLEGI LÉPÉS BEÍRT ADATAINAK MENTÉSE — akkor is, ha a lépés HIÁNYOS.
   *
   * ════════════════════════════════════════════════════════════════════════
   * MIÉRT KELL (2026-08-15, Endre kérése a megyei varázslóra)
   * ════════════════════════════════════════════════════════════════════════
   * „minden beírt adatot a Tovább gomb megnyomásával mentsen el, hogy ne
   *  kelljen újra kitölteni elölről, ha kilépek valamelyik pontnál"
   *
   * HÁROM lyuk volt, és mindhárom ugyanoda vezetett — elveszett a begépelt adat:
   *   (1) a „Tovább" MENT ugyan, de a gomb LE VAN TILTVA, amíg a lépés hiányos
   *       → épp akkor NEM mentett, amikor a legnagyobb szükség lett volna rá
   *       (pl. egy elgépelt e-mail miatt);
   *   (2) a „Vissza" EGYÁLTALÁN nem mentett — aki visszalépett javítani,
   *       elvesztette az aktuális lépésen beírtakat;
   *   (3) a „Később" / X / ESC sem mentett.
   *
   * A `saveDistrictSetupStep` szerver-akció ERRE ALKALMAS: csak a ténylegesen
   * átadott mezőket írja, az üres értéket NULL-ra teszi, a NOT NULL `name`-et
   * pedig csak nem üres értékkel frissíti.
   *
   * `csendes = true`: kilépéskor/visszalépéskor nem villantunk hibát a
   * felhasználó arcába; a mentés legrosszabb esetben nem történik meg, de a
   * navigáció nem akad el.
   */
  async function mentsdAmiBeVanIrva(csendes = true): Promise<boolean> {
    // ⛔ A LEGELSŐ SOR — lásd a `betoltve` állapot docblockját. Amíg az élő adat
    //    nincs a `form`-ban, a mentés nem „megőrzi", hanem TÖRLI a törzsadatot
    //    (az üres sztringek NULL-ra fordulnak). A `false` visszatérés itt
    //    helyes: nem mentettünk — a hívó (kilépés / visszalépés) mehet tovább.
    if (loading || !betoltve) return false
    setStepSaving(true)
    try {
      const res = await saveDistrictSetupStep({ id: districtId, ...stepFields(step, form) })
      if (res.error) {
        if (!csendes) toast.error(`Mentés sikertelen: ${res.error}`)
        return false
      }
      return true
    } catch {
      return false
    } finally {
      setStepSaving(false)
    }
  }

  async function handleBack() {
    const idx = STEP_ORDER.indexOf(step)
    if (idx <= 0) return
    // Előbb mentünk, csak utána lépünk vissza — különben az ezen a lépésen
    // beírt (esetleg még hiányos) adat elveszne.
    await mentsdAmiBeVanIrva()
    setStep(STEP_ORDER[idx - 1])
  }

  /**
   * Kilépés — de CSAK a beírt adat mentése UTÁN.
   * Ez fogja el a „Később" gombot, az X-et, az ESC-et és a dialóguson kívüli
   * kattintást is (mind az `onOpenChange(false)`-on megy keresztül).
   */
  async function handleClose() {
    await mentsdAmiBeVanIrva()
    onOpenChange(false)
  }

  async function handleCimerUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    // Az input értékét ürítjük, hogy UGYANAZ a fájl újra kiválasztható legyen
    // (pl. sikertelen feltöltés után) — a change-esemény különben nem sülne el.
    ev.target.value = ''
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadDistrictCimer(districtId, fd)
    setUploading(false)
    if (res.error) {
      toast.error(res.error)
      return
    }
    const ujUrl = res.url
    if (ujUrl) {
      // ⚠️ FUNKCIONÁLIS frissítés, NE `{ ...form, … }`. A `form` a hívás
      //    pillanatában befagyott closure-érték, a feltöltés viszont
      //    másodpercekig tart. TÜNET VOLT: aki a feltöltés alatt beírta a
      //    CIF-et vagy a román nevet, annak a gépelése NÉMÁN visszaállt a
      //    feltöltés végén. Minden `await` UTÁNI setForm legyen funkcionális.
      setForm((f) => ({ ...f, cimer_url: ujUrl }))
      toast.success('Címer feltöltve.')
    }
  }

  function handleSave() {
    setFieldErrors({})
    startTransition(async () => {
      const res = await saveDistrictSetup({ id: districtId, ...form })
      if (res.error) {
        toast.error(res.error)
        if (res.fieldErrors) setFieldErrors(res.fieldErrors)
        return
      }
      toast.success('Egyházkerület beállítva! 🎉', { duration: 4000 })
      if (onCompleted) await onCompleted()
      onOpenChange(false)
      router.refresh()
    })
  }

  const progressPercent = ((STEP_ORDER.indexOf(step) + 1) / STEP_ORDER.length) * 100

  return (
    // A bezárás MINDEN útja (X, ESC, kívülre kattintás, „Később") átmegy a
    // handleClose-on, ami előbb elmenti a beírt adatot.
    <Dialog
      open={open}
      onOpenChange={(nyitva) => {
        if (nyitva) onOpenChange(true)
        else void handleClose()
      }}
    >
      <DialogContent
        className="
          !w-[96vw] !max-w-[96vw] sm:!max-w-[min(900px,96vw)]
          !h-[92dvh] !max-h-[92dvh]
          overflow-hidden p-0 gap-0
          border border-violet-200 dark:border-violet-900/60 bg-card
          rounded-2xl flex flex-col
        "
      >
        <DialogHeader className="shrink-0 border-b border-border bg-card px-4 py-4 sm:px-6 rounded-t-2xl">
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="font-heading text-lg sm:text-xl text-foreground flex items-center gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                <Landmark className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  Egyházkerület beállítása
                  {teszt && <TesztJeloles />}
                </span>
                <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                  Az alapadatok kitöltése — a hivatalos dokumentumokhoz szükséges
                </span>
              </span>
            </DialogTitle>
          </div>

          {/* Progressz */}
          <div className="flex items-center gap-2 mt-3 text-xs">
            {STEP_ORDER.map((s, idx) => {
              const isActive = s === step
              const isDone = STEP_ORDER.indexOf(step) > idx
              return (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div
                    className={`size-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold transition ${
                      isActive
                        ? 'bg-violet-600 text-white ring-4 ring-violet-200 dark:ring-violet-900/70'
                        : isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}
                    aria-label={`${idx + 1}. lépés: ${STEP_LABELS[s]}`}
                  >
                    {isDone ? <CheckCircle2 className="size-3" /> : idx + 1}
                  </div>
                  {idx < STEP_ORDER.length - 1 && (
                    <div className={`h-px flex-1 ${isDone ? 'bg-emerald-400' : 'bg-border'}`} />
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="inline-block size-6 animate-spin mb-2" />
              <p>Betöltés…</p>
            </div>
          ) : (
            <>
              {step === 'basics' && (
                <StepBasics
                  form={form}
                  setForm={setForm}
                  onCimerUpload={handleCimerUpload}
                  uploading={uploading}
                  fieldErrors={fieldErrors}
                  districtId={districtId}
                  teszt={teszt}
                />
              )}
              {step === 'address' && <StepAddress form={form} setForm={setForm} fieldErrors={fieldErrors} />}
              {step === 'contact' && <StepContact form={form} setForm={setForm} fieldErrors={fieldErrors} />}
              {step === 'bank-leadership' && (
                <StepBankLeadership
                  form={form}
                  setForm={setForm}
                  fieldErrors={fieldErrors}
                  jeloltek={vezetoJeloltek}
                />
              )}
              {step === 'confirm' && <StepConfirm form={form} teszt={teszt} />}
            </>
          )}
        </div>

        {/* MIÉRT nem léphetsz tovább (2026-08-15, Endre észrevétele).
            Egy letiltott gomb indoklás nélkül vakvágány — a felhasználó azt
            látja, hogy mindent kitöltött, és azt hiszi, a program romlott el.
            Lásd a stepBlockReason() docblockját. Az üzenet a gombok FÖLÖTT áll,
            hogy telefonon is látszódjon (a gombsor egy sorba szorul). */}
        {blockReason && (
          <div
            role="status"
            aria-live="polite"
            className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 sm:px-6 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <span className="font-medium">Még nem léphetsz tovább — </span>
            {blockReason}
            {/* Megnyugtatás: a begépelt adat NEM vész el, akkor sem, ha most
                kilépsz. Épp ez volt a panasz (2026-08-15). */}
            <span className="block mt-0.5 opacity-80">
              A már beírt adatokat elmentjük — ha most kilépsz, nem kell újra kitöltened.
            </span>
          </div>
        )}

        {/* Léptető gombok */}
        <div className="shrink-0 border-t border-border bg-muted/40 px-4 py-3 sm:px-6 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={step === 'basics' ? () => void handleClose() : () => void handleBack()}
            // ⛔ `loading` is tiltja: betöltés közben a „Később" a MÉG ÜRES
            //    űrlapot mentené rá az élő sorra (az ESC/X ellen a
            //    mentsdAmiBeVanIrva() zárja véd — azt nem lehet letiltani).
            disabled={isPending || stepSaving || loading}
            className="rounded-xl"
          >
            {step === 'basics' ? (
              <>
                <X className="mr-1 size-4" />
                Később
              </>
            ) : (
              <>
                <ArrowLeft className="mr-1 size-4" />
                Vissza
              </>
            )}
          </Button>

          {step !== 'confirm' ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!isStepValid(step) || isPending || stepSaving}
              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
            >
              {stepSaving ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  Mentés…
                </>
              ) : (
                <>
                  Tovább
                  <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isStepValid('confirm')}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
            >
              {isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Save className="mr-1 size-4" />
              )}
              Mentés és befejezés
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Teszt-jelölés — Endre kérése: a „Teszt Egyházkerület" LÁTHATÓAN legyen
// megkülönböztetve a két valódi kerülettől.
// ─────────────────────────────────────────────────────────────────────────

function TesztJeloles() {
  return (
    <Badge
      className="border-0 bg-amber-100 text-amber-900 text-[10px] font-semibold dark:bg-amber-900/50 dark:text-amber-200"
      title="Ez egy teszt-egyházkerület — a benne rögzített adatok nem hivatalosak."
    >
      <FlaskConical className="mr-1 size-3" />
      teszt
    </Badge>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Lépések
// ─────────────────────────────────────────────────────────────────────────

function StepBasics({
  form, setForm, onCimerUpload, uploading, fieldErrors, districtId, teszt,
}: {
  form: SetupFormState
  setForm: SetForm
  onCimerUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void
  uploading: boolean
  fieldErrors: Record<string, string>
  districtId: string
  teszt: boolean
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 border-violet-200/70 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20">
        <div className="flex items-start gap-2">
          <FileText className="size-5 text-violet-600 dark:text-violet-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-foreground">Alapadatok + címer</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Az egyházkerület hivatalos neve, adóazonosítója (CIF) és címere.
              Ezek kerülnek a kerület hivatalos nyomtatványainak fejlécére.
            </p>
          </div>
        </div>
      </div>

      {teszt && (
        <div className="card-raised p-3 border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <FlaskConical className="size-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 dark:text-amber-200">
              <strong>Ez egy teszt-egyházkerület.</strong> A benne rögzített adatok
              próbaadatok — a felület mindenhol megjelöli, hogy össze ne keveredjen
              a két valódi egyházkerülettel.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <ModalField label="Egyházkerület neve *">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Pl. Erdélyi Református Egyházkerület"
          />
          {fieldErrors.name && <p className="text-xs text-rose-600 mt-1">{fieldErrors.name}</p>}
        </ModalField>
        <ModalField label="CIF (adóazonosító) *">
          <Input
            value={form.cif}
            onChange={(e) => setForm({ ...form, cif: e.target.value })}
            placeholder="Pl. 12345678"
          />
          {fieldErrors.cif && <p className="text-xs text-rose-600 mt-1">{fieldErrors.cif}</p>}
        </ModalField>
      </div>

      {/* A hivatalos ROMÁN név kötelező, az angol opcionális — a gyülekezeti és
          a megyei beállítás mintájára (nev_ro / nev_en). */}
      <div className="grid gap-3 md:grid-cols-2">
        <ModalField label="Román név (hivatalos) *">
          <Input
            value={form.nev_ro}
            onChange={(e) => setForm({ ...form, nev_ro: e.target.value })}
            placeholder="Pl. Eparhia Reformată din Ardeal"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Ez kerül a hivatalos iratok fejlécére a magyar név mellé.
          </p>
          {fieldErrors.nev_ro && <p className="text-xs text-rose-600 mt-1">{fieldErrors.nev_ro}</p>}
        </ModalField>
        <ModalField label="Angol név (opcionális)">
          <Input
            value={form.nev_en}
            onChange={(e) => setForm({ ...form, nev_en: e.target.value })}
            placeholder="Pl. Reformed Church District of Transylvania"
          />
        </ModalField>
      </div>

      <ModalField label="Magyar adószám (opcionális)">
        <Input
          value={form.adoszam}
          onChange={(e) => setForm({ ...form, adoszam: e.target.value })}
          placeholder="Ha van magyar adószám is"
        />
      </ModalField>

      {/* Címer feltöltés */}
      <div className="card-raised p-4 border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-950/20">
        <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <ImageIcon className="size-4 text-indigo-600 dark:text-indigo-400" />
          Egyházkerületi címer *
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Tölts fel egy képet (JPG, PNG vagy WEBP, max 2 MB). A címer a hivatalos
          kerületi dokumentumokon (összesítők, iktatott levelek, nyomtatványok)
          jelenik meg.
        </p>
        {form.cimer_url ? (
          <div className="flex items-start gap-3">
            <img
              src={form.cimer_url}
              alt="Egyházkerületi címer"
              className="size-24 rounded-xl border border-border object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">✅ Címer feltöltve</p>
              <p className="text-[10px] text-muted-foreground truncate">{form.cimer_url}</p>
              <label className="mt-2 inline-flex items-center gap-1.5 cursor-pointer text-xs text-indigo-700 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-100">
                <Upload className="size-3.5" />
                Másik feltöltése
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onCimerUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
        ) : (
          <label className="flex flex-wrap items-center justify-center gap-2 rounded-xl border-2 border-dashed border-indigo-300 bg-card/50 p-6 cursor-pointer hover:bg-indigo-50/40 dark:border-indigo-800 dark:hover:bg-indigo-950/30 transition">
            <Upload className="size-5 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300 text-center">
              {uploading ? 'Feltöltés…' : 'Kattints ide a címer feltöltéséhez'}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={onCimerUpload}
              disabled={uploading}
            />
          </label>
        )}
        {fieldErrors.cimer_url && <p className="text-xs text-rose-600 mt-2">{fieldErrors.cimer_url}</p>}
      </div>

      {/* Püspöki hivatali pecsét + aláírás — a KÖZÖS IratKepekSection a
          gyülekezeti 24. pont és a megyei S4 párjaként, a KERÜLETI
          szerver-akciókkal. A képek a kerületi iktató nyomtatványaira
          kerülnek (Legea 489/2006 Art. 15: a pecséten a hivatalos elnevezés
          kötelező). */}
      <IratKepekSection
        feliratok={{ pecset: 'Püspöki hivatali pecsét', alairas: 'Püspöki aláírás' }}
        leiras={
          'PNG vagy WEBP kép, átlátszó háttérrel, max 1 MB. A pecsét és az aláírás az ' +
          'egyházkerületi iktató nyomtatványaira kerül (iktatópecsét, iktatókönyv, kiadott ' +
          'levelek). Amíg nincs kép feltöltve, minden nyomtatvány üres aláírás-vonallal készül.'
        }
        load={() => getDistrictIratKepek(districtId)}
        upload={(fajta, fd) => uploadDistrictIratKep(districtId, fajta, fd)}
        remove={(fajta) => clearDistrictIratKep(districtId, fajta)}
      />
    </div>
  )
}

function StepAddress({
  form, setForm, fieldErrors,
}: { form: SetupFormState; setForm: SetForm; fieldErrors: Record<string, string> }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 border-sky-200/70 bg-sky-50/40 dark:border-sky-900/40 dark:bg-sky-950/20">
        <div className="flex items-start gap-2">
          <MapPin className="size-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-foreground">Cím</h3>
            <p className="text-xs text-muted-foreground mt-1">
              A püspöki hivatal hivatalos postacíme — a megye és a helység a
              hivatalos romániai adatbázisból választható; az irányítószám
              automatikusan kitöltődik az utca alapján.
            </p>
          </div>
        </div>
      </div>

      <AddressForm
        value={formToAddressValue(form)}
        onChange={(v) => setForm(applyAddressToForm(form, v))}
        lang="hu"
        showCountryAlways
        errors={{
          country: fieldErrors.cim_orszag,
          county: fieldErrors.cim_megye,
          locality: fieldErrors.cim_telepules,
          street: fieldErrors.cim_utca,
        }}
      />
    </div>
  )
}

function StepContact({
  form, setForm, fieldErrors,
}: { form: SetupFormState; setForm: SetForm; fieldErrors: Record<string, string> }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex items-start gap-2">
          <Phone className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-foreground">Elérhetőségek</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Az egyházkerület hivatalos kontakt adatai.
            </p>
          </div>
        </div>
      </div>

      <ModalField label="E-mail *">
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="pl. hivatal@egyhazkerulet.ro"
        />
        {/* A @-hiányra a gombok fölötti sáv külön, beszédes üzenetet ad. */}
        {fieldErrors.email && <p className="text-xs text-rose-600 mt-1">{fieldErrors.email}</p>}
      </ModalField>

      <ModalField label="Telefon *">
        <Input
          value={form.telefon}
          onChange={(e) => setForm({ ...form, telefon: e.target.value })}
          placeholder="pl. +40 264 123 456"
        />
        {fieldErrors.telefon && <p className="text-xs text-rose-600 mt-1">{fieldErrors.telefon}</p>}
      </ModalField>

      <ModalField label="Weboldal (opcionális)">
        <Input
          value={form.weboldal}
          onChange={(e) => setForm({ ...form, weboldal: e.target.value })}
          placeholder="https://..."
        />
      </ModalField>
    </div>
  )
}

function StepBankLeadership({
  form, setForm, fieldErrors, jeloltek,
}: {
  form: SetupFormState
  setForm: SetForm
  fieldErrors: Record<string, string>
  jeloltek: VezetoJeloltek | null
}) {
  const lista = jeloltek?.jeloltek ?? []
  const hozzarendelt = jeloltek?.hozzarendelt
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="card-raised p-4 border-teal-200/70 bg-teal-50/40 dark:border-teal-900/40 dark:bg-teal-950/20">
        <div className="flex items-start gap-2">
          <Banknote className="size-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-foreground">Bank + vezetés</h3>
            <p className="text-xs text-muted-foreground mt-1">
              A jelenlegi püspök és a kerületi adminisztrátor neve — ezek a
              hivatalos dokumentumok aláírás-rovatában jelennek meg.
            </p>
            {/* Endre (2026-08-15): a bankszámla később is pótolható. */}
            <p className="text-xs text-muted-foreground mt-1">
              A <strong className="font-medium">bankszámla megadása nem kötelező most</strong> —
              később, az „Egyházkerület beállításai” ablakban is pótolható.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.2fr_2fr_0.8fr]">
        <ModalField label="Bank neve (később is megadható)">
          <Input
            value={form.bank_nev}
            onChange={(e) => setForm({ ...form, bank_nev: e.target.value })}
            placeholder="Pl. BCR"
          />
        </ModalField>
        <ModalField label="IBAN (később is megadható)">
          <Input
            value={form.bank_fo_iban}
            onChange={(e) => setForm({ ...form, bank_fo_iban: e.target.value })}
            placeholder="RO..."
            className="font-mono text-xs"
          />
        </ModalField>
        <ModalField label="Valuta">
          <select
            value={form.bank_fo_iban_valuta}
            onChange={(e) => setForm({ ...form, bank_fo_iban_valuta: e.target.value })}
            className="h-9 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
            aria-label="A bankszámla valutája"
          >
            <option value="RON">RON</option>
            <option value="EUR">EUR</option>
            <option value="HUF">HUF</option>
            <option value="USD">USD</option>
          </select>
        </ModalField>
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-center gap-2 mb-3">
          <Users className="size-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-semibold text-foreground">Vezetés</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <VezetoValaszto
            label="Püspök neve *"
            value={form.puspok_nev}
            onChange={(nev) => setForm({ ...form, puspok_nev: nev })}
            jeloltek={lista}
            hozzarendelt={hozzarendelt?.puspok ?? null}
            uresSegitseg={
              'Az egyházkerülethez még nincs nevesített püspöki szerepkör kiosztva. ' +
              'A Felhasználók felületen rendelhető hozzá — addig írd be kézzel.'
            }
            placeholder="Teljes név"
          />
          {/* A püspök CÍME = TISZTSÉG-szöveg, nem személy — ezért marad sima
              szövegmező (a megyei esperes_cim pontos tükre). */}
          <ModalField label="Püspök címe (tisztsége) *">
            <Input
              value={form.puspok_cim}
              onChange={(e) => setForm({ ...form, puspok_cim: e.target.value })}
              placeholder="püspök / püspökhelyettes"
            />
            {fieldErrors.puspok_cim && (
              <p className="text-xs text-rose-600 mt-1">{fieldErrors.puspok_cim}</p>
            )}
          </ModalField>
          <VezetoValaszto
            label="Kerületi adminisztrátor *"
            value={form.adminisztrator_nev}
            onChange={(nev) => setForm({ ...form, adminisztrator_nev: nev })}
            jeloltek={lista}
            hozzarendelt={hozzarendelt?.adminisztrator ?? null}
            uresSegitseg={
              'Nincs egyházkerületi adminisztrátor hozzárendelve ehhez a kerülethez. ' +
              'A Felhasználók felületen rendelhető hozzá — addig írd be kézzel.'
            }
            placeholder="Teljes név"
          />
        </div>

        {/* A SZÁMVEVŐ is választható — az új `egyhazkeruleti_szamvevo`
            szerepkör (Endre K1 döntése) párjaként. NEM kötelező. */}
        <div className="grid gap-3 md:grid-cols-3 mt-3">
          <VezetoValaszto
            label="Egyházkerületi számvevő (nem kötelező)"
            value={form.szamvevo_nev}
            onChange={(nev) => setForm({ ...form, szamvevo_nev: nev })}
            jeloltek={lista}
            hozzarendelt={hozzarendelt?.szamvevo ?? null}
            uresSegitseg={
              'Nincs egyházkerületi számvevő hozzárendelve. A Felhasználók felületen ' +
              'osztható ki az „Egyházkerületi számvevő” szerepkör — addig írd be kézzel.'
            }
            placeholder="Teljes név"
          />
        </div>
      </div>
    </div>
  )
}

function StepConfirm({ form, teszt }: { form: SetupFormState; teszt: boolean }) {
  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="card-raised p-4 border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading text-base text-foreground">Összefoglaló</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Ellenőrizd az adatokat, majd kattints a &bdquo;Mentés és befejezés&rdquo; gombra.
            </p>
          </div>
        </div>
      </div>

      <div className="card-raised p-3 flex items-center gap-3">
        {form.cimer_url && (
          <img
            src={form.cimer_url}
            alt="Címer"
            className="size-16 shrink-0 rounded-xl border border-border object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="font-heading text-lg text-foreground break-words flex flex-wrap items-center gap-2">
            {form.name}
            {teszt && <TesztJeloles />}
          </p>
          {form.nev_ro && <p className="text-xs text-muted-foreground break-words">{form.nev_ro}</p>}
          <p className="text-xs text-muted-foreground">
            CIF: <strong>{form.cif}</strong>
            {form.adoszam && <> · Adószám: <strong>{form.adoszam}</strong></>}
          </p>
        </div>
      </div>

      <SummaryRow icon={<MapPin className="size-4 text-sky-600 dark:text-sky-400" />} label="Cím">
        {form.cim_iranyitoszam} {form.cim_telepules}, {form.cim_utca} ({form.cim_megye}, {form.cim_orszag})
      </SummaryRow>
      <SummaryRow icon={<Phone className="size-4 text-emerald-600 dark:text-emerald-400" />} label="Elérhetőségek">
        {form.email} · {form.telefon}
        {form.weboldal && (
          <> · <a href={form.weboldal} target="_blank" rel="noopener" className="underline">{form.weboldal}</a></>
        )}
      </SummaryRow>
      <SummaryRow icon={<Banknote className="size-4 text-teal-600 dark:text-teal-400" />} label="Bank">
        {/* A bank már nem kötelező — ha üres, LÁTHATÓAN jelezzük, hogy pótolandó,
            ne csak egy üres sor maradjon a helyén. */}
        {form.bank_nev.trim() || form.bank_fo_iban.trim() ? (
          <>
            {form.bank_nev} · <span className="font-mono text-xs">{form.bank_fo_iban}</span>{' '}
            <Badge className="bg-muted text-foreground border-0 ml-1 text-[10px]">
              {form.bank_fo_iban_valuta}
            </Badge>
          </>
        ) : (
          <span className="text-amber-700 dark:text-amber-300">
            Még nincs megadva — később pótolható az „Egyházkerület beállításai” ablakban.
          </span>
        )}
      </SummaryRow>
      <SummaryRow icon={<Users className="size-4 text-amber-600 dark:text-amber-400" />} label="Vezetés">
        {form.puspok_nev} ({form.puspok_cim}) · Adminisztrátor: {form.adminisztrator_nev}
        {form.szamvevo_nev ? <> · Számvevő: {form.szamvevo_nev}</> : null}
      </SummaryRow>

      {teszt && (
        <div className="card-raised p-3 border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <FlaskConical className="size-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-900 dark:text-amber-200">
              <strong>Teszt-egyházkerület.</strong> Az itt mentett adatok próbaadatok —
              a valódi egyházkerületek beállítását ez nem érinti.
            </p>
          </div>
        </div>
      )}

      <div className="card-raised p-3 border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/25">
        <div className="flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 dark:text-amber-200">
            <strong>Mi történik a mentés után?</strong> Az egyházkerületi alapadatok
            elmentődnek, és onnantól ezek jelennek meg a kerület hivatalos
            nyomtatványainak fejlécén és aláírás-rovatában (összesítők, iktatott
            levelek). A hiányzó bankszámla később is pótolható.
          </p>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="card-raised p-3 flex items-start gap-2 text-sm">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
        <p className="text-foreground break-words mt-0.5">{children}</p>
      </div>
    </div>
  )
}
