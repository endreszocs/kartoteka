import { z } from 'zod'
import { ENTRY_REASONS } from '@/lib/constants/members'

// ── Tag felvétel / szerkesztés ───────────────────────────────

const bucharestDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Bucharest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function getCurrentBucharestDate() {
  const parts = Object.fromEntries(
    bucharestDateFormatter
      .formatToParts(new Date())
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, part.value]),
  )

  return `${parts.year}-${parts.month}-${parts.day}`
}

export const memberSchema = z.object({
  id: z.number().optional(),
  csaladnev: z.string().trim().min(1, 'A családnév kötelező'),
  k_nev: z.string().trim().min(1, 'A keresztnév kötelező'),
  szcs_nev: z.string().optional().or(z.literal('')),
  /** 2026-08-01 (PR-19): név-előtag (id./ifj./özv./Dr.) — a szemely.namepattern */
  namepattern: z.string().trim().max(15).optional().or(z.literal('')),
  /** 2026-08-25: az EGYHÁZI AZONOSÍTÓ (a rendszer belső kódja).
   *  Üres/undefined = „nem nyúlunk hozzá": új tagnál a rendszer generál,
   *  meglévőnél a tárolt érték változatlan marad (a saveMember szabálya).
   *
   *  ⚠️ 2026-09-05: a plafon 40-ről 20-ra ment. Az ÉLŐ oszlop `varchar(20)`
   *  (mérve), tehát 21-40 karakternél a mentés nyers 22001-gyel bukott a
   *  lelkész arcába — a séma-dump ezt a hosszt sem tartalmazza.
   *
   *  ⚠️ Valódi romániai CNP-t ez a mező NEM fogad el (`valodiCnpGyanus` kapu a
   *  saveMember-ben): a hivatalos szám a `szemely_szemelyi_szam` táblába megy. */
  cnp: z.string().trim().max(20, 'Az egyházi azonosító legfeljebb 20 karakter.').optional().or(z.literal('')),
  ferfi: z.boolean({ message: 'A nem megadása kötelező' }),
  sz_datum: z
    .string()
    .trim()
    .min(1, 'A születési dátum kötelező')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A születési dátum formátuma ÉÉÉÉ-HH-NN legyen')
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, 'A születési dátum nem létező naptári nap')
    .refine(
      (value) => value <= getCurrentBucharestDate(),
      'A születési dátum nem lehet jövőbeli',
    ),
  sz_hely_text: z.string().trim().min(1, 'A születési hely kötelező').max(120),
  foglalkozas: z.string().optional().or(z.literal('')),
  vallas: z.string().trim().min(1, 'A vallás kötelező').max(80),
  c_helyseg_text: z.string().trim().min(1, 'A település kötelező'),
  c_utca_text: z.string().trim().min(1, 'Az utca kötelező'),
  c_szam: z.string().default('1'),
  c_tombhaz: z.string().optional().or(z.literal('')),
  c_lepcsohaz: z.string().optional().or(z.literal('')),
  c_emelet: z.string().optional().or(z.literal('')),
  c_ajto: z.string().optional().or(z.literal('')),
  telefon: z.string().optional().or(z.literal('')),
  email: z.string().email('Érvénytelen e-mail cím').optional().or(z.literal('')),
  megjegyzes: z.string().optional().or(z.literal('')),
  belepes_oka: z.enum(ENTRY_REASONS).default('alap'),
  // Beköltözött extra
  bek_datum: z.string().optional().or(z.literal('')),
  bek_honnan: z.string().optional().or(z.literal('')),
  bek_igazolas: z.string().optional().or(z.literal('')),
  // Áttért extra
  att_datum: z.string().optional().or(z.literal('')),
  att_felekezet: z.string().optional().or(z.literal('')),
  att_honnan: z.string().optional().or(z.literal('')),
  // Szülők
  apjaneve: z.string().optional().or(z.literal('')),
  anyjaneve: z.string().optional().or(z.literal('')),
  id_apja_cnp: z.string().optional().or(z.literal('')),
  id_anyja_cnp: z.string().optional().or(z.literal('')),
  // Anyakönyv
  kereszteles_datum: z.string().optional().or(z.literal('')),
  kereszteles_hely: z.string().optional().or(z.literal('')),
  kereszteles_lelkesz: z.string().optional().or(z.literal('')),
  konfirmacio_datum: z.string().optional().or(z.literal('')),
  konfirmacio_hely: z.string().optional().or(z.literal('')),
  konfirmacio_lelkesz: z.string().optional().or(z.literal('')),
  // 2026-07-24 (PR-4, D4 döntés): az esketes_* mezők TÖRÖLVE — a saveMember soha
  // nem mentette őket (néma adatvesztés); az esketés az Anyakönyv modul hatásköre.
  // Pénzügyi ('nem_fizet' kivezetve — sehol nem volt hatása)
  fizeto_status: z.enum(['fizet', 'felmentett', 'nem_fizet']).optional(),
  // #1 (Endre): GDPR-hozzájárulások + közösségi profil-link — a személyi kartonról (űrlap)
  // is menthető legyen (eddig csak a részletező dialógus külön ConsentEditor-jéből ment).
  gdpr_consent: z.boolean().optional(),
  photo_consent: z.boolean().optional(),
  mailing_consent: z.boolean().optional(),
  social_profil_url: z.string().optional().or(z.literal('')),
  /** 2026-08-25 (gyülekezeti egységek): a tag egység-címkéje —
   *  null = anyaközpont (a szemely.egyseg_id oszlop, nullable FK). */
  egyseg_id: z.string().uuid().nullable().optional(),
})

/** A böngészőűrlap nyers értékei; a Zod-defaultok alkalmazása előtt. */
export type MemberFormValues = z.input<typeof memberSchema>
/** A szervernek átadott, Zod által validált és defaultolt értékek. */
export type MemberInput = z.output<typeof memberSchema>

// ── Tag kivezetés ────────────────────────────────────────────
// 2026-08-15 (desktop-paritás 2. szelet): a séma a közös @kartoteka/validations
// csomagba került (members/szemely-remove.ts) — a desktop kivezetés-tükre is
// UGYANEZZEL validál. Innen re-export a meglévő webes importok kedvéért.

export { szemelyRemoveSchema as removeSchema } from '@kartoteka/validations'
export type { SzemelyRemoveInput as RemoveInput } from '@kartoteka/validations'

// ── Család ───────────────────────────────────────────────────

export const familySchema = z.object({
  id: z.number().optional(),
  id_ferfi: z.number().nullable(),
  id_no: z.number().nullable(),
  gyerekIds: z.array(z.number()).default([]),
  c_utcaid: z.number().optional(),
  c_szam: z.string().optional().or(z.literal('')),
  id_csoport: z.number().nullable().optional(),
  /** 2026-08-01 (PR-18): a máshol gyermekként nyilvántartott tagok explicit áthelyezése */
  allowMoves: z.boolean().optional(),
  /** 2026-08-04 (PR-27): a felnőtt pár kapcsolatának jellege */
  parkapcsolat: z.enum(['hazastars', 'elettars']).nullable().optional(),
  /** A kapcsolat kezdete: házasságnál az esküvő, élettársnál az együttélés dátuma */
  parkapcsolat_datum: z.string().nullable().optional(),
}).refine(
  (data) => data.id_ferfi !== null || data.id_no !== null,
  { message: 'Legalább egy felet (férj vagy feleség) meg kell adni', path: ['id_ferfi'] }
)

export type FamilyInput = z.infer<typeof familySchema>

// ── Válás / kapcsolat felbontása (2026-08-04, PR-44) ─────────

export const divorceSchema = z.object({
  /** A családi karton, amelyen a pár jelenleg szerepel */
  familyId: z.number(),
  /** A válás (jogerő) dátuma — ÉÉÉÉ-HH-NN. Ez lesz a kapcsolat és a
   *  háztartás-tagság lezárásának napja (nem a mai nap). */
  datum: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'A válás dátumának formátuma ÉÉÉÉ-HH-NN legyen')
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`)
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    }, 'A válás dátuma nem létező naptári nap')
    .refine(
      (value) => value <= getCurrentBucharestDate(),
      'A válás dátuma nem lehet jövőbeli',
    ),
  /** Ki marad a jelenlegi kartonon (a gyermekekkel) */
  marad: z.enum(['ferfi', 'no']),
  /** Kapjon-e a távozó fél saját, egyszemélyes családi kartont */
  ujKartonATavozonak: z.boolean().default(false),
  ujKarton: z
    .object({
      c_utcaid: z.number().nullable().optional(),
      c_szam: z.string().optional().or(z.literal('')),
    })
    .optional(),
  /** Mindkét fél megkapja-e az „elvált" családi állapotot (csak házasságnál) */
  elvaltJelzo: z.boolean().default(true),
  /** Csak az audit-naplóba kerül */
  megjegyzes: z.string().max(500).optional().or(z.literal('')),
})

export type DivorceInput = z.infer<typeof divorceSchema>

// ── Körzet ───────────────────────────────────────────────────

export const districtSchema = z.object({
  id: z.number().optional(),
  nev: z.string().min(1, 'A körzet neve kötelező'),
  isaktiv: z.boolean().default(true),
})

export type DistrictInput = z.infer<typeof districtSchema>

// ── Presbiter ────────────────────────────────────────────────

// 2026-08-26 (5. kör): a szabadszöveges tisztseg helyett kódolt fokozat
// (teljes/pot/tiszteletbeli) + funkció (fogondnok/gondnok) + mandátum.
// A tisztseg mező megmarad kijelzési címkének (a szerver generálja).
export const presbyterSchema = z.object({
  id: z.number().optional(),
  id_szemely: z.number({ message: 'Válasszon egyháztagot' }),
  fokozat: z.enum(['teljes', 'pot', 'tiszteletbeli']).default('teljes'),
  funkcio: z.enum(['fogondnok', 'gondnok']).nullable().optional(),
  kezdete: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  vege: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  id_csoport: z.number().nullable().optional(),
  egyseg_id: z.string().uuid().nullable().optional(),
  publikus: z.boolean().default(false),
  megjegyzes: z.string().max(500).nullable().optional(),
})

export type PresbyterInput = z.infer<typeof presbyterSchema>

// ── Nem-presbiteri tisztségek (tisztsegek tábla) ─────────────

export const tisztsegSchema = z.object({
  id: z.string().uuid().optional(),
  id_szemely: z.number({ message: 'Válasszon egyháztagot' }),
  tipus: z.enum([
    'kantor', 'diakonus', 'noszovetsegi_elnok', 'ike_elnok', 'onkentes',
    'bizottsagi_tag', 'egyhazmegyei_kuldott', 'egyeb',
  ]),
  bizottsag: z.string().max(40).nullable().optional(),
  bizottsagi_szerep: z.enum(['elnok', 'tag']).nullable().optional(),
  jelleg: z.enum(['hivatasos', 'onkentes']).nullable().optional(),
  egyeb_megnevezes: z.string().max(120).nullable().optional(),
  kezdete: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  vege: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  publikus: z.boolean().default(false),
  megjegyzes: z.string().max(500).nullable().optional(),
})

export type TisztsegInput = z.infer<typeof tisztsegSchema>
