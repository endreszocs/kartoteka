-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.access (
  id character varying,
  username character varying,
  computername character varying,
  lastacces timestamp without time zone,
  allowedusername character varying
);
CREATE TABLE public.admin_access_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  congregation_id uuid NOT NULL,
  pastor_user_id uuid,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text])),
  approved_at timestamp with time zone,
  denied_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT admin_access_requests_pkey PRIMARY KEY (id),
  CONSTRAINT admin_access_requests_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id),
  CONSTRAINT admin_access_requests_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT admin_access_requests_pastor_user_id_fkey FOREIGN KEY (pastor_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.adrcountry (
  id integer NOT NULL DEFAULT nextval('adrcountry_id_seq'::regclass),
  name character varying NOT NULL,
  sname character varying,
  usagecnt integer,
  CONSTRAINT adrcountry_pkey PRIMARY KEY (id)
);
CREATE TABLE public.adrcounty (
  id integer NOT NULL DEFAULT nextval('adrcounty_id_seq'::regclass),
  name character varying NOT NULL,
  sname character varying,
  countryid integer NOT NULL,
  usagecnt integer,
  CONSTRAINT adrcounty_pkey PRIMARY KEY (id),
  CONSTRAINT adrcounty_countryid_fk FOREIGN KEY (countryid) REFERENCES public.adrcountry(id)
);
CREATE TABLE public.adrlocality (
  id integer NOT NULL DEFAULT nextval('adrlocality_id_seq'::regclass),
  name character varying NOT NULL,
  code character varying,
  countyid integer NOT NULL,
  usagecnt integer,
  CONSTRAINT adrlocality_pkey PRIMARY KEY (id),
  CONSTRAINT adrlocality_countyid_fk FOREIGN KEY (countyid) REFERENCES public.adrcounty(id)
);
CREATE TABLE public.adrstreet (
  id integer NOT NULL DEFAULT nextval('adrstreet_id_seq'::regclass),
  name character varying NOT NULL,
  postalcode character varying,
  localityid integer NOT NULL,
  usagecnt integer,
  CONSTRAINT adrstreet_pkey PRIMARY KEY (id),
  CONSTRAINT adrstreet_localityid_fk FOREIGN KEY (localityid) REFERENCES public.adrlocality(id)
);
CREATE TABLE public.annual_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid,
  year integer NOT NULL,
  members_count integer DEFAULT 0,
  services_count integer DEFAULT 0,
  total_income numeric DEFAULT 0,
  pastor_note text,
  status text DEFAULT 'submitted'::text,
  submitted_at timestamp with time zone DEFAULT now(),
  CONSTRAINT annual_reports_pkey PRIMARY KEY (id),
  CONSTRAINT annual_reports_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.attert (
  id integer NOT NULL DEFAULT nextval('attert_id_seq'::regclass),
  id_szemely integer NOT NULL,
  felekezet character varying,
  mikor timestamp without time zone,
  igazolas character varying,
  megjegyzes character varying,
  honnanid integer,
  congregation_id uuid,
  CONSTRAINT attert_pkey PRIMARY KEY (id),
  CONSTRAINT attert_honnanid_fk FOREIGN KEY (honnanid) REFERENCES public.adrlocality(id),
  CONSTRAINT attert_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT attert_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.bankszamlak (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  congregation_id uuid NOT NULL,
  bank_neve character varying NOT NULL,
  iban character varying,
  valuta character varying DEFAULT 'RON'::character varying,
  aktiv boolean DEFAULT true,
  nyito_egyenleg numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  szin character varying DEFAULT '#206bc4'::character varying,
  CONSTRAINT bankszamlak_pkey PRIMARY KEY (id),
  CONSTRAINT bankszamlak_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.bealitas (
  id character varying NOT NULL,
  intezmenyneve character varying,
  utcaid integer NOT NULL,
  szam character varying,
  telefon character varying,
  lelkesz character varying,
  logo character varying,
  isszemelyibefizetes boolean NOT NULL,
  isszulokkulon boolean NOT NULL,
  szemelyibefizetesfilter character varying,
  felmentes70felul boolean NOT NULL,
  felmenteskorhatar character varying,
  felmentesideneskudtek boolean NOT NULL,
  kedvezmenyxevenfelul boolean NOT NULL,
  kedvezmenykorhatar integer,
  kedvezmeny integer,
  egyhazkerulet character varying,
  egyhazmegye character varying,
  adoazonosito character varying,
  bejegyzesiszam character varying,
  aktiv boolean NOT NULL,
  ervenyessegiev timestamp without time zone,
  version character varying,
  created timestamp without time zone,
  congregation_id uuid NOT NULL,
  intezmenyneve_ro character varying,
  helysegid integer,
  diak_felmentes boolean DEFAULT false,
  eves_jarulek numeric DEFAULT 0,
  budget_finalized boolean DEFAULT false,
  presbiteriumi_hatarozat_datum date,
  presbiteriumi_hatarozat_szam character varying,
  egyhazkozsegi_iktatoszam character varying,
  egyhazmegyei_iktatoszam character varying,
  unlock_requested boolean DEFAULT false,
  unlock_reason text,
  szamadas_zaro_adatok jsonb DEFAULT '{}'::jsonb,
  accounting_finalized boolean DEFAULT false,
  accounting_unlock_requested boolean DEFAULT false,
  accounting_unlock_reason text,
  leltar_finalized boolean DEFAULT false,
  leltar_unlock_requested boolean DEFAULT false,
  leltar_unlock_reason text,
  nyito_keszpenz numeric DEFAULT 0,
  nyito_bank numeric DEFAULT 0,
  jarulek_kedvezmenyes numeric DEFAULT 0,
  jarulek_hatarid text DEFAULT '07-01'::text,
  szamadas_iktatoszam character varying,
  szamadas_hatarozat_datum date,
  szamadas_hatarozat_szam character varying,
  leltar_iktatoszam character varying,
  leltar_hatarozat_datum date,
  leltar_hatarozat_szam character varying,
  CONSTRAINT bealitas_pkey PRIMARY KEY (id, congregation_id),
  CONSTRAINT bealitas_utcaid_fk FOREIGN KEY (utcaid) REFERENCES public.adrstreet(id),
  CONSTRAINT bealitas_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT bealitas_helysegid_fkey FOREIGN KEY (helysegid) REFERENCES public.adrlocality(id)
);
CREATE TABLE public.befizetes (
  id integer NOT NULL DEFAULT nextval('befizetes_id_seq'::regclass),
  xkey character varying NOT NULL,
  id_csalad integer,
  id_szemely integer,
  forrasa text NOT NULL,
  id_befizetescel integer NOT NULL,
  datum date NOT NULL,
  osszeg numeric NOT NULL,
  nyugta text NOT NULL,
  iratszam text NOT NULL,
  irattipus text NOT NULL,
  csalad boolean NOT NULL,
  megjegyzes text,
  deleted boolean NOT NULL,
  created timestamp without time zone,
  fizetettev integer NOT NULL,
  userid uuid NOT NULL,
  melleklet integer,
  synced boolean DEFAULT false,
  congregation_id uuid,
  is_potlas boolean DEFAULT false,
  bankszamla_id integer,
  belso_mozgas_xkey character varying,
  CONSTRAINT befizetes_pkey PRIMARY KEY (id),
  CONSTRAINT befizetes_id_befizetescel_fk FOREIGN KEY (id_befizetescel) REFERENCES public.befizetescel(id),
  CONSTRAINT befizetes_bankszamla_id_fkey FOREIGN KEY (bankszamla_id) REFERENCES public.bankszamlak(id),
  CONSTRAINT befizetes_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT befizetes_userid_fk FOREIGN KEY (userid) REFERENCES auth.users(id),
  CONSTRAINT befizetes_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.befizetesbealitas (
  id_bealitas character varying NOT NULL,
  id_befizetescel integer NOT NULL,
  osszeg integer NOT NULL,
  iscsaladi boolean NOT NULL,
  CONSTRAINT befizetesbealitas_pkey PRIMARY KEY (id_bealitas, id_befizetescel),
  CONSTRAINT befizetesbealitas_id_befizetescel_fk FOREIGN KEY (id_befizetescel) REFERENCES public.befizetescel(id)
);
CREATE TABLE public.befizetescel (
  id integer NOT NULL DEFAULT nextval('befizetescel_id_seq'::regclass),
  nevro character varying NOT NULL,
  nev character varying NOT NULL,
  id_szamadasicel character varying NOT NULL UNIQUE,
  aktiv boolean NOT NULL,
  belsotetel character varying,
  parentid integer,
  CONSTRAINT befizetescel_pkey PRIMARY KEY (id),
  CONSTRAINT befizetescel_parentid_fk FOREIGN KEY (parentid) REFERENCES public.befizetescel(id),
  CONSTRAINT befizetescel_id_szamadasicel_fk FOREIGN KEY (id_szamadasicel) REFERENCES public.szamadasicel(id)
);
CREATE TABLE public.befizetocelcfg (
  id integer NOT NULL DEFAULT nextval('befizetocelcfg_id_seq'::regclass),
  srctype character varying NOT NULL,
  srcid integer NOT NULL,
  celid integer NOT NULL,
  fromyear integer NOT NULL,
  toyear integer,
  CONSTRAINT befizetocelcfg_pkey PRIMARY KEY (id),
  CONSTRAINT befizetocelcfg_celid_fk FOREIGN KEY (celid) REFERENCES public.befizetescel(id)
);
CREATE TABLE public.bekoltozott (
  id integer NOT NULL DEFAULT nextval('bekoltozott_id_seq'::regclass),
  id_szemely integer NOT NULL,
  mikor timestamp without time zone NOT NULL,
  megjegyzes character varying,
  igazolas character varying,
  honnanid integer,
  congregation_id uuid,
  CONSTRAINT bekoltozott_pkey PRIMARY KEY (id),
  CONSTRAINT bekoltozott_honnanid_fk FOREIGN KEY (honnanid) REFERENCES public.adrlocality(id),
  CONSTRAINT bekoltozott_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT bekoltozott_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.belsomozgas (
  id bigint NOT NULL DEFAULT nextval('belsomozgas_id_seq'::regclass),
  congregation_id uuid NOT NULL,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  tipus text NOT NULL CHECK (tipus = ANY (ARRAY['kassza_bank'::text, 'bank_kassza'::text, 'bank_bank'::text, 'valutacsere'::text])),
  forras text NOT NULL,
  cel text NOT NULL,
  osszeg numeric NOT NULL,
  cel_osszeg numeric,
  arfolyam numeric,
  megjegyzes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  deleted boolean DEFAULT false,
  CONSTRAINT belsomozgas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.berleti_szerzodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  berlo_nev text NOT NULL,
  id_szemely integer,
  targy text,
  leiras text NOT NULL,
  tipus text DEFAULT 'terulet'::text CHECK (tipus = ANY (ARRAY['terulet'::text, 'epulet'::text])),
  osszeg numeric NOT NULL,
  fizetesi_ciklus text DEFAULT 'eves'::text CHECK (fizetesi_ciklus = ANY (ARRAY['havi'::text, 'eves'::text])),
  kezdet date NOT NULL,
  vege date,
  id_szamadasicel text DEFAULT '104.05'::text,
  leltari_szam text,
  telekkonyvi_szam text,
  ceg_nev text,
  ceg_adoszam text,
  aktiv boolean DEFAULT true,
  megjegyzes text,
  created_at timestamp with time zone DEFAULT now(),
  userid uuid,
  deleted boolean DEFAULT false,
  CONSTRAINT berleti_szerzodes_pkey PRIMARY KEY (id),
  CONSTRAINT berleti_szerzodes_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT berleti_szerzodes_id_szemely_fkey FOREIGN KEY (id_szemely) REFERENCES public.szemely(id)
);
CREATE TABLE public.cfg_report (
  id integer NOT NULL DEFAULT nextval('cfg_report_id_seq'::regclass),
  type character varying NOT NULL,
  name character varying NOT NULL,
  val text NOT NULL,
  CONSTRAINT cfg_report_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cfgparam (
  id integer NOT NULL DEFAULT nextval('cfgparam_id_seq'::regclass),
  name character varying NOT NULL,
  subkey character varying,
  val text,
  CONSTRAINT cfgparam_pkey PRIMARY KEY (id)
);
CREATE TABLE public.congregations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  diocese text,
  district text DEFAULT 'Erdélyi Református Egyházkerület'::text,
  created_at timestamp with time zone DEFAULT now(),
  nev_hu character varying,
  nev_ro character varying,
  nev_en character varying,
  egyhazmegye character varying,
  adoszam character varying,
  cim character varying,
  email character varying,
  telefon character varying,
  web character varying,
  eves_jarulek numeric DEFAULT 100,
  iban character varying,
  bank character varying,
  cimer_url character varying,
  diocese_id uuid,
  jarulek_kedvezmenyes numeric DEFAULT 0,
  jarulek_hatarid text DEFAULT '07-01'::text,
  CONSTRAINT congregations_pkey PRIMARY KEY (id),
  CONSTRAINT congregations_diocese_id_fkey FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id)
);
CREATE TABLE public.csalad (
  id integer NOT NULL DEFAULT nextval('csalad_id_seq'::regclass),
  id_ferfi integer,
  id_no integer,
  c_utcaid integer NOT NULL,
  c_szam character varying NOT NULL,
  c_tombhaz character varying,
  c_lepcsohaz character varying,
  c_ajto character varying,
  c_emelet character varying,
  id_csoport integer,
  isaktiv boolean NOT NULL,
  CONSTRAINT csalad_pkey PRIMARY KEY (id),
  CONSTRAINT csalad_c_utcaid_fk FOREIGN KEY (c_utcaid) REFERENCES public.adrstreet(id),
  CONSTRAINT csalad_id_csoport_fk FOREIGN KEY (id_csoport) REFERENCES public.csoport(id),
  CONSTRAINT csalad_id_ferfi_fk FOREIGN KEY (id_ferfi) REFERENCES public.szemely(id),
  CONSTRAINT csalad_id_no_fk FOREIGN KEY (id_no) REFERENCES public.szemely(id)
);
CREATE TABLE public.csaladlatogatas (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  id_csalad integer NOT NULL,
  datum date NOT NULL,
  lelkesz character varying NOT NULL,
  alapige character varying,
  megjegyzes text,
  munkanaplo_id integer,
  congregation_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT csaladlatogatas_pkey PRIMARY KEY (id),
  CONSTRAINT csaladlatogatas_id_csalad_fkey FOREIGN KEY (id_csalad) REFERENCES public.csalad(id),
  CONSTRAINT csaladlatogatas_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.csoport (
  id integer NOT NULL DEFAULT nextval('csoport_id_seq'::regclass),
  nev character varying NOT NULL,
  kep character varying,
  isaktiv boolean NOT NULL,
  iskorzet boolean NOT NULL,
  created timestamp without time zone,
  CONSTRAINT csoport_pkey PRIMARY KEY (id)
);
CREATE TABLE public.csoporttagok (
  id integer NOT NULL DEFAULT nextval('csoporttagok_id_seq'::regclass),
  id_csoport integer NOT NULL,
  id_szemely integer NOT NULL,
  created timestamp without time zone,
  megjegyzes character varying,
  CONSTRAINT csoporttagok_pkey PRIMARY KEY (id),
  CONSTRAINT csoporttagok_id_csoport_fk FOREIGN KEY (id_csoport) REFERENCES public.csoport(id),
  CONSTRAINT csoporttagok_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id)
);
CREATE TABLE public.dioceses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  district_id uuid,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT dioceses_pkey PRIMARY KEY (id),
  CONSTRAINT dioceses_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id)
);
CREATE TABLE public.districts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT districts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.elkoltozott (
  id integer NOT NULL DEFAULT nextval('elkoltozott_id_seq'::regclass),
  id_szemely integer NOT NULL,
  kulfoldre boolean NOT NULL,
  mikor timestamp without time zone,
  megjegyzes character varying,
  hovaid integer,
  congregation_id uuid,
  CONSTRAINT elkoltozott_pkey PRIMARY KEY (id),
  CONSTRAINT elkoltozott_hovaid_fk FOREIGN KEY (hovaid) REFERENCES public.adrlocality(id),
  CONSTRAINT elkoltozott_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT elkoltozott_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.ertesitesek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid,
  cim character varying NOT NULL,
  uzenet text,
  tipus character varying DEFAULT 'info'::character varying,
  olvasva boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  hivatkozas text,
  CONSTRAINT ertesitesek_pkey PRIMARY KEY (id),
  CONSTRAINT ertesitesek_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.event (
  type character varying NOT NULL,
  val character varying NOT NULL,
  created timestamp without time zone NOT NULL
);
CREATE TABLE public.felmentes (
  id integer NOT NULL DEFAULT nextval('felmentes_id_seq'::regclass),
  id_csalad integer,
  felmento character varying NOT NULL,
  datum timestamp without time zone NOT NULL,
  oka character varying NOT NULL,
  kezdete integer,
  vege integer,
  created timestamp without time zone,
  id_szemely integer,
  CONSTRAINT felmentes_pkey PRIMARY KEY (id),
  CONSTRAINT felmentes_id_csalad_fk FOREIGN KEY (id_csalad) REFERENCES public.csalad(id),
  CONSTRAINT felmentes_id_szemely_fkey FOREIGN KEY (id_szemely) REFERENCES public.szemely(id)
);
CREATE TABLE public.felmentesx (
  id integer NOT NULL DEFAULT nextval('felmentesx_id_seq'::regclass),
  srctype character varying NOT NULL,
  srcid integer NOT NULL,
  issuer character varying NOT NULL,
  reason character varying NOT NULL,
  start timestamp without time zone NOT NULL,
  stop timestamp without time zone,
  created timestamp without time zone NOT NULL,
  CONSTRAINT felmentesx_pkey PRIMARY KEY (id)
);
CREATE TABLE public.gyerek (
  id integer NOT NULL DEFAULT nextval('gyerek_id_seq'::regclass),
  id_csalad integer NOT NULL,
  id_szemely integer NOT NULL,
  CONSTRAINT gyerek_pkey PRIMARY KEY (id),
  CONSTRAINT gyerek_id_csalad_fk FOREIGN KEY (id_csalad) REFERENCES public.csalad(id),
  CONSTRAINT gyerek_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id)
);
CREATE TABLE public.gyulekezetek (
  id integer NOT NULL DEFAULT nextval('gyulekezetek_id_seq'::regclass),
  id_csoport integer NOT NULL,
  created timestamp without time zone,
  CONSTRAINT gyulekezetek_pkey PRIMARY KEY (id),
  CONSTRAINT gyulekezetek_id_csoport_fk FOREIGN KEY (id_csoport) REFERENCES public.csoport(id)
);
CREATE TABLE public.gyulekezeti_programok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  cim text NOT NULL,
  leiras text,
  datum date NOT NULL,
  ido_kezdes time without time zone,
  ido_befejezes time without time zone,
  helyszin text,
  tipus text DEFAULT 'istentisztelet'::text CHECK (tipus = ANY (ARRAY['istentisztelet'::text, 'bibliaora'::text, 'imaora'::text, 'ifjusagi'::text, 'gyerekprogram'::text, 'konferencia'::text, 'hangverseny'::text, 'kozossegi'::text, 'presbiteri'::text, 'latogatas'::text, 'unnep'::text, 'tabor'::text, 'evangelizacio'::text, 'diakoniai'::text, 'noszovetseg'::text, 'egyeb'::text])),
  szin text DEFAULT '#206bc4'::text,
  ismétlődő boolean DEFAULT false,
  ismetlodes_tipus text CHECK (ismetlodes_tipus = ANY (ARRAY['heti'::text, 'ketheti'::text, 'havi'::text, NULL::text])),
  prioritas text DEFAULT 'normal'::text CHECK (prioritas = ANY (ARRAY['alacsony'::text, 'normal'::text, 'fontos'::text, 'kiemelt'::text])),
  teljesitett boolean DEFAULT false,
  teljesites_datum timestamp with time zone,
  megjegyzes text,
  letrehozta_id uuid NOT NULL,
  letrehozta_nev text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  datum_vege date,
  egyedi_tipus_nev text,
  egyedi_emoji text,
  CONSTRAINT gyulekezeti_programok_pkey PRIMARY KEY (id),
  CONSTRAINT gyulekezeti_programok_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT gyulekezeti_programok_letrehozta_id_fkey FOREIGN KEY (letrehozta_id) REFERENCES auth.users(id)
);
CREATE TABLE public.hazassag (
  id integer NOT NULL DEFAULT nextval('hazassag_id_seq'::regclass),
  id_ferfi integer NOT NULL,
  id_no integer NOT NULL,
  datum timestamp without time zone NOT NULL,
  lelkeszneve character varying,
  hlevel character varying,
  tanuk character varying,
  megjegyzes character varying,
  munkanaploba boolean NOT NULL,
  helyid integer,
  congregation_id uuid,
  munkanaplo_id integer,
  CONSTRAINT hazassag_pkey PRIMARY KEY (id),
  CONSTRAINT hazassag_helyid_fk FOREIGN KEY (helyid) REFERENCES public.adrlocality(id),
  CONSTRAINT hazassag_id_ferfi_fk FOREIGN KEY (id_ferfi) REFERENCES public.szemely(id),
  CONSTRAINT hazassag_id_no_fk FOREIGN KEY (id_no) REFERENCES public.szemely(id),
  CONSTRAINT hazassag_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.iktato (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  year integer NOT NULL,
  sequence_number integer NOT NULL DEFAULT nextval('iktato_sequence_number_seq'::regclass),
  direction text CHECK (direction = ANY (ARRAY['incoming'::text, 'outgoing'::text])),
  subject text NOT NULL,
  sender_or_recipient text,
  file_folder text,
  created_at timestamp with time zone DEFAULT now(),
  kelt date,
  targykivonat text,
  elintezes_ideje date,
  elintezes_modja text,
  irattarijel text,
  oldalszam integer,
  megjegyzes text,
  deleted boolean DEFAULT false,
  userid uuid,
  CONSTRAINT iktato_pkey PRIMARY KEY (id),
  CONSTRAINT iktato_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.iktatokonyv (
  id integer NOT NULL DEFAULT nextval('iktatokonyv_id_seq'::regclass),
  beadvany_szama character varying,
  beadvany_kelte timestamp without time zone,
  oldalszam integer,
  cim character varying,
  targykivonat character varying,
  elintezes_ideje date,
  elintezes_modja character varying,
  irattarijel character varying,
  megjegyzes character varying,
  congregation_id uuid,
  CONSTRAINT iktatokonyv_pkey PRIMARY KEY (id),
  CONSTRAINT iktatokonyv_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.jarulek_kedvezmeny (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  ev integer NOT NULL,
  tipus text NOT NULL CHECK (tipus = ANY (ARRAY['idoszak'::text, 'kor'::text, 'jovedelem'::text])),
  sorrend integer DEFAULT 0,
  aktiv boolean DEFAULT true,
  hatarid text,
  kedv_osszeg numeric,
  kor_tol integer,
  szazalek numeric,
  fix_osszeg numeric,
  jov_leiras text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT jarulek_kedvezmeny_pkey PRIMARY KEY (id),
  CONSTRAINT jarulek_kedvezmeny_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.keresztseg (
  id integer NOT NULL DEFAULT nextval('keresztseg_id_seq'::regclass),
  id_szemely integer NOT NULL,
  datum timestamp without time zone NOT NULL,
  lelkeszneve character varying,
  okirat character varying,
  keresztszulok character varying,
  megjegyzes character varying,
  munkanaploba boolean NOT NULL,
  helyid integer,
  congregation_id uuid,
  munkanaplo_id integer,
  CONSTRAINT keresztseg_pkey PRIMARY KEY (id),
  CONSTRAINT keresztseg_helyid_fk FOREIGN KEY (helyid) REFERENCES public.adrlocality(id),
  CONSTRAINT keresztseg_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT keresztseg_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.kiadas (
  id integer NOT NULL DEFAULT nextval('kiadas_id_seq'::regclass),
  xkey character varying NOT NULL,
  id_kiadascel integer NOT NULL,
  datum timestamp without time zone NOT NULL,
  osszeg numeric NOT NULL,
  nyugta text NOT NULL,
  iratszam text NOT NULL,
  irattipus text NOT NULL,
  megjegyzes text,
  created timestamp without time zone,
  deleted boolean NOT NULL,
  atvevo text,
  atvevoid integer,
  userid uuid NOT NULL,
  melleklet integer,
  congregation_id uuid,
  is_potlas boolean DEFAULT false,
  bankszamla_id integer,
  vonatkozo_idoszak character varying,
  belso_mozgas_xkey character varying,
  CONSTRAINT kiadas_pkey PRIMARY KEY (id),
  CONSTRAINT kiadas_atvevoid_fk FOREIGN KEY (atvevoid) REFERENCES public.szemely(id),
  CONSTRAINT kiadas_id_kiadascel_fk FOREIGN KEY (id_kiadascel) REFERENCES public.kiadascel(id),
  CONSTRAINT kiadas_bankszamla_id_fkey FOREIGN KEY (bankszamla_id) REFERENCES public.bankszamlak(id),
  CONSTRAINT kiadas_userid_fk FOREIGN KEY (userid) REFERENCES auth.users(id),
  CONSTRAINT kiadas_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.kiadascel (
  id integer NOT NULL DEFAULT nextval('kiadascel_id_seq'::regclass),
  nevro character varying NOT NULL,
  nev character varying NOT NULL,
  id_szamadasicel character varying NOT NULL UNIQUE,
  aktiv boolean NOT NULL,
  belsotetel character varying,
  parentid integer,
  CONSTRAINT kiadascel_pkey PRIMARY KEY (id),
  CONSTRAINT kiadascel_parentid_fk FOREIGN KEY (parentid) REFERENCES public.kiadascel(id),
  CONSTRAINT kiadascel_id_szamadasicel_fk FOREIGN KEY (id_szamadasicel) REFERENCES public.szamadasicel(id)
);
CREATE TABLE public.kiadasikiseroiv (
  id integer NOT NULL DEFAULT nextval('kiadasikiseroiv_id_seq'::regclass),
  id_kiadas integer NOT NULL,
  iratszam integer NOT NULL,
  datum timestamp without time zone NOT NULL,
  megjegyzes character varying,
  created timestamp without time zone,
  CONSTRAINT kiadasikiseroiv_pkey PRIMARY KEY (id),
  CONSTRAINT kiadasikiseroiv_id_kiadas_fk FOREIGN KEY (id_kiadas) REFERENCES public.kiadas(id)
);
CREATE TABLE public.kitert (
  id integer NOT NULL DEFAULT nextval('kitert_id_seq'::regclass),
  id_szemely integer NOT NULL,
  felekezet character varying,
  mikor timestamp without time zone,
  megjegyzes character varying,
  hovaid integer,
  congregation_id uuid,
  CONSTRAINT kitert_pkey PRIMARY KEY (id),
  CONSTRAINT kitert_hovaid_fk FOREIGN KEY (hovaid) REFERENCES public.adrlocality(id),
  CONSTRAINT kitert_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT kitert_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.koltsegvetes (
  bealitasid character varying NOT NULL,
  szamadasicelid character varying NOT NULL,
  osszeg integer,
  congregation_id uuid NOT NULL,
  osszeg_modositott integer,
  osszeg_mod_2 numeric DEFAULT 0,
  osszeg_mod_3 numeric DEFAULT 0,
  osszeg_teny numeric DEFAULT 0,
  CONSTRAINT koltsegvetes_pkey PRIMARY KEY (bealitasid, szamadasicelid, congregation_id),
  CONSTRAINT koltsegvetes_szamadasicelid_fk FOREIGN KEY (szamadasicelid) REFERENCES public.szamadasicel(id),
  CONSTRAINT koltsegvetes_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.konfirmalas (
  id integer NOT NULL DEFAULT nextval('konfirmalas_id_seq'::regclass),
  id_szemely integer NOT NULL,
  datum date NOT NULL,
  lelkeszneve character varying,
  keresztelesideje date,
  megjegyzes character varying,
  helyid integer,
  congregation_id uuid,
  munkanaplo_id integer,
  CONSTRAINT konfirmalas_pkey PRIMARY KEY (id),
  CONSTRAINT konfirmalas_helyid_fk FOREIGN KEY (helyid) REFERENCES public.adrlocality(id),
  CONSTRAINT konfirmalas_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT konfirmalas_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.korzetfilter (
  id integer NOT NULL DEFAULT nextval('korzetfilter_id_seq'::regclass),
  korzetid integer NOT NULL,
  kezdoszam integer,
  vegsoszam integer,
  szamfilter integer,
  utcaid integer NOT NULL,
  tombhaz character varying,
  CONSTRAINT korzetfilter_pkey PRIMARY KEY (id),
  CONSTRAINT korzetfilter_korzetid_fk FOREIGN KEY (korzetid) REFERENCES public.csoport(id),
  CONSTRAINT korzetfilter_utcaid_fk FOREIGN KEY (utcaid) REFERENCES public.adrstreet(id)
);
CREATE TABLE public.leltar_tetelek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  kategoria character varying NOT NULL,
  megnevezes character varying NOT NULL,
  leltari_szam character varying NOT NULL,
  helyszin character varying,
  felelos_szemely_id integer,
  felelos_neve character varying,
  beszerzes_datuma date,
  beszerzes_bizonylat character varying,
  beszerzesi_ertek numeric DEFAULT 0,
  mennyiseg numeric DEFAULT 1,
  mertekegyseg character varying DEFAULT 'db'::character varying,
  katalogus_kod character varying,
  hasznalati_ido_ev integer,
  torles_datuma date,
  torles_bizonylat character varying,
  torles_indoklasa character varying,
  is_deleted boolean DEFAULT false,
  megjegyzes text,
  created_at timestamp with time zone DEFAULT now(),
  userid uuid,
  szerzo character varying,
  regi_leltari_szam character varying,
  penzugy_xkey character varying,
  konyv_isbn character varying,
  konyv_kiado character varying,
  konyv_kiadas_helye character varying,
  konyv_kiadas_eve integer,
  konyv_terjedelem character varying,
  konyv_sorozatcim character varying,
  CONSTRAINT leltar_tetelek_pkey PRIMARY KEY (id),
  CONSTRAINT leltar_tetelek_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT leltar_tetelek_felelos_fkey FOREIGN KEY (felelos_szemely_id) REFERENCES public.szemely(id),
  CONSTRAINT leltar_tetelek_userid_fkey FOREIGN KEY (userid) REFERENCES auth.users(id)
);
CREATE TABLE public.logger (
  id integer NOT NULL DEFAULT nextval('logger_id_seq'::regclass),
  name character varying NOT NULL,
  operation character varying NOT NULL,
  changes text NOT NULL,
  tblname character varying,
  tblid character varying,
  username character varying NOT NULL,
  computer character varying NOT NULL,
  created timestamp without time zone NOT NULL,
  CONSTRAINT logger_pkey PRIMARY KEY (id)
);
CREATE TABLE public.mm_dokumentumok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  otlet_id uuid NOT NULL,
  nev text NOT NULL,
  url text NOT NULL,
  meret integer DEFAULT 0,
  tipus text,
  feltolto_id uuid NOT NULL,
  feltolto_nev text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_dokumentumok_pkey PRIMARY KEY (id),
  CONSTRAINT mm_dokumentumok_otlet_id_fkey FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id),
  CONSTRAINT mm_dokumentumok_feltolto_id_fkey FOREIGN KEY (feltolto_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mm_feladatok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  otlet_id uuid NOT NULL,
  cim text NOT NULL,
  leiras text,
  felelos_id uuid,
  felelos_nev text,
  hatarido date,
  statusz text DEFAULT 'fuggeben'::text CHECK (statusz = ANY (ARRAY['fuggeben'::text, 'folyamatban'::text, 'kesz'::text])),
  sorrend integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_feladatok_pkey PRIMARY KEY (id),
  CONSTRAINT mm_feladatok_otlet_id_fkey FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id),
  CONSTRAINT mm_feladatok_felelos_id_fkey FOREIGN KEY (felelos_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mm_felhasznalo_jelveny (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  jelveny_id integer NOT NULL,
  elnyerve timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_felhasznalo_jelveny_pkey PRIMARY KEY (id),
  CONSTRAINT mm_felhasznalo_jelveny_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT mm_felhasznalo_jelveny_jelveny_id_fkey FOREIGN KEY (jelveny_id) REFERENCES public.mm_jelveny_tipusok(id)
);
CREATE TABLE public.mm_felhasznalo_statisztika (
  user_id uuid NOT NULL,
  otletek_szama integer DEFAULT 0,
  elfogadott_otletek integer DEFAULT 0,
  megvalosult_otletek integer DEFAULT 0,
  tamogatasok_adva integer DEFAULT 0,
  hozzaszolasok_szama integer DEFAULT 0,
  segedanyagok_feltoltve integer DEFAULT 0,
  feladatok_teljesitve integer DEFAULT 0,
  ertekelesek_adva integer DEFAULT 0,
  osszpontszam integer DEFAULT 0,
  szint text DEFAULT 'Újonc'::text,
  frissitve timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_felhasznalo_statisztika_pkey PRIMARY KEY (user_id),
  CONSTRAINT mm_felhasznalo_statisztika_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mm_hozzaszolasok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  otlet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_nev text,
  user_gyulekezet text,
  szoveg text NOT NULL,
  szulo_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_hozzaszolasok_pkey PRIMARY KEY (id),
  CONSTRAINT mm_hozzaszolasok_otlet_id_fkey FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id),
  CONSTRAINT mm_hozzaszolasok_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT mm_hozzaszolasok_szulo_id_fkey FOREIGN KEY (szulo_id) REFERENCES public.mm_hozzaszolasok(id)
);
CREATE TABLE public.mm_jelveny_tipusok (
  id integer NOT NULL DEFAULT nextval('mm_jelveny_tipusok_id_seq'::regclass),
  kod text NOT NULL UNIQUE,
  nev text NOT NULL,
  leiras text NOT NULL,
  feltetel text NOT NULL,
  ikon text NOT NULL,
  szin text DEFAULT '#f59f00'::text,
  sorrend integer DEFAULT 0,
  CONSTRAINT mm_jelveny_tipusok_pkey PRIMARY KEY (id)
);
CREATE TABLE public.mm_kategoriak (
  id integer NOT NULL DEFAULT nextval('mm_kategoriak_id_seq'::regclass),
  nev text NOT NULL UNIQUE,
  ikon text NOT NULL,
  szin text DEFAULT '#206bc4'::text,
  leiras text,
  sorrend integer DEFAULT 0,
  CONSTRAINT mm_kategoriak_pkey PRIMARY KEY (id)
);
CREATE TABLE public.mm_merfoldkovek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  otlet_id uuid NOT NULL,
  cim text NOT NULL,
  leiras text,
  hatarido date,
  teljesitve boolean DEFAULT false,
  teljesitve_datum timestamp with time zone,
  sorrend integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_merfoldkovek_pkey PRIMARY KEY (id),
  CONSTRAINT mm_merfoldkovek_otlet_id_fkey FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id)
);
CREATE TABLE public.mm_otlet_cimkek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  otlet_id uuid NOT NULL,
  cimke text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_otlet_cimkek_pkey PRIMARY KEY (id),
  CONSTRAINT mm_otlet_cimkek_otlet_id_fkey FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id)
);
CREATE TABLE public.mm_otlet_kategoriak (
  otlet_id uuid NOT NULL,
  kategoria_id integer NOT NULL,
  CONSTRAINT mm_otlet_kategoriak_pkey PRIMARY KEY (otlet_id, kategoria_id),
  CONSTRAINT mm_otlet_kategoriak_otlet_id_fkey FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id),
  CONSTRAINT mm_otlet_kategoriak_kategoria_id_fkey FOREIGN KEY (kategoria_id) REFERENCES public.mm_kategoriak(id)
);
CREATE TABLE public.mm_otletek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cim text NOT NULL,
  leiras text NOT NULL,
  celcsoport text DEFAULT 'Mindenki'::text CHECK (celcsoport = ANY (ARRAY['Fiatalok'::text, 'Felnőttek'::text, 'Idősek'::text, 'Családok'::text, 'Gyerekek'::text, 'Mindenki'::text])),
  becsult_ido text DEFAULT '2-3 hónap'::text CHECK (becsult_ido = ANY (ARRAY['1 hónap'::text, '2-3 hónap'::text, 'Fél év'::text, 'Folyamatos'::text])),
  statusz text DEFAULT 'uj'::text CHECK (statusz = ANY (ARRAY['uj'::text, 'szavazas'::text, 'kozos_munka'::text, 'megvalosult'::text, 'archivalt'::text, 'piszkozat'::text])),
  szavazas_kezdete timestamp with time zone,
  szavazas_vege timestamp with time zone,
  tamogatasok_szama integer DEFAULT 0,
  csatlakozok_szama integer DEFAULT 0,
  hozzaszolasok_szama integer DEFAULT 0,
  kidolgozottsag integer DEFAULT 0,
  benyujtas_szama integer DEFAULT 1,
  otletgazda_id uuid NOT NULL,
  otletgazda_nev text,
  otletgazda_gyulekezet text,
  csatolmany_url text,
  aktiv boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_otletek_pkey PRIMARY KEY (id),
  CONSTRAINT mm_otletek_otletgazda_id_fkey FOREIGN KEY (otletgazda_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mm_segedanyag_ertekelesek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  segedanyag_id uuid NOT NULL,
  user_id uuid NOT NULL,
  pontszam integer NOT NULL CHECK (pontszam >= 1 AND pontszam <= 5),
  velemeny text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_segedanyag_ertekelesek_pkey PRIMARY KEY (id),
  CONSTRAINT mm_segedanyag_ertekelesek_segedanyag_id_fkey FOREIGN KEY (segedanyag_id) REFERENCES public.mm_segedanyagok(id),
  CONSTRAINT mm_segedanyag_ertekelesek_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mm_segedanyag_kategoriak (
  segedanyag_id uuid NOT NULL,
  kategoria_id integer NOT NULL,
  CONSTRAINT mm_segedanyag_kategoriak_pkey PRIMARY KEY (segedanyag_id, kategoria_id),
  CONSTRAINT mm_segedanyag_kategoriak_segedanyag_id_fkey FOREIGN KEY (segedanyag_id) REFERENCES public.mm_segedanyagok(id),
  CONSTRAINT mm_segedanyag_kategoriak_kategoria_id_fkey FOREIGN KEY (kategoria_id) REFERENCES public.mm_kategoriak(id)
);
CREATE TABLE public.mm_segedanyagok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cim text NOT NULL,
  leiras text,
  forras_url text,
  forras_nev text,
  formatum text DEFAULT 'PDF'::text CHECK (formatum = ANY (ARRAY['PDF'::text, 'DOCX'::text, 'PPTX'::text, 'video'::text, 'link'::text, 'csomag'::text])),
  feltolto_id uuid NOT NULL,
  feltolto_nev text,
  feltolto_gyulekezet text,
  letoltes_szam integer DEFAULT 0,
  atlag_ertekeles numeric DEFAULT 0,
  ertekelesek_szama integer DEFAULT 0,
  csatolmany_url text,
  aktiv boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_segedanyagok_pkey PRIMARY KEY (id),
  CONSTRAINT mm_segedanyagok_feltolto_id_fkey FOREIGN KEY (feltolto_id) REFERENCES auth.users(id)
);
CREATE TABLE public.mm_szavazatok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  otlet_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tipus text NOT NULL CHECK (tipus = ANY (ARRAY['tamogatas'::text, 'csatlakozas'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mm_szavazatok_pkey PRIMARY KEY (id),
  CONSTRAINT mm_szavazatok_otlet_id_fkey FOREIGN KEY (otlet_id) REFERENCES public.mm_otletek(id),
  CONSTRAINT mm_szavazatok_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.monetar (
  id integer NOT NULL DEFAULT nextval('monetar_id_seq'::regclass),
  cimlet_id integer NOT NULL,
  darab integer NOT NULL,
  source character varying,
  sourceid character varying,
  CONSTRAINT monetar_pkey PRIMARY KEY (id),
  CONSTRAINT monetar_cimlet_id_fk FOREIGN KEY (cimlet_id) REFERENCES public.nom_cimlet(id)
);
CREATE TABLE public.munkanaplo (
  id integer NOT NULL DEFAULT nextval('munkanaplo_id_seq'::regclass),
  idopont date,
  jellege character varying,
  id_jellege character varying,
  bibliaolvasas character varying,
  alapige character varying,
  cim character varying,
  enekek character varying,
  jelenlet_ferfi integer,
  jelenlet_no integer,
  jelenlet_gyermek integer,
  szolgalt character varying,
  persely numeric,
  megjegyzes text,
  created timestamp without time zone,
  jelenlet_osszesen integer NOT NULL,
  mediapath character varying,
  congregation_id uuid,
  kategoria character varying DEFAULT 'szolgalat'::character varying,
  du boolean DEFAULT false,
  CONSTRAINT munkanaplo_pkey PRIMARY KEY (id),
  CONSTRAINT munkanaplo_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.nevnap (
  id integer NOT NULL,
  honap character varying,
  nap character varying,
  nev1 character varying NOT NULL,
  nev2 character varying,
  nev3 character varying,
  CONSTRAINT nevnap_pkey PRIMARY KEY (id)
);
CREATE TABLE public.nom_cimlet (
  id integer NOT NULL DEFAULT nextval('nom_cimlet_id_seq'::regclass),
  name character varying NOT NULL,
  val integer NOT NULL,
  divide integer NOT NULL,
  deleted boolean NOT NULL,
  CONSTRAINT nom_cimlet_pkey PRIMARY KEY (id)
);
CREATE TABLE public.param (
  name character varying NOT NULL,
  val character varying NOT NULL,
  val2 character varying,
  val3 character varying,
  CONSTRAINT param_pkey PRIMARY KEY (name)
);
CREATE TABLE public.penztar (
  id integer NOT NULL DEFAULT nextval('penztar_id_seq'::regclass),
  datum date DEFAULT CURRENT_DATE,
  bizonylatszam text,
  irattipus text CHECK (irattipus = ANY (ARRAY['bevétel'::text, 'kiadás'::text])),
  nev_manualis text,
  szemely_id integer,
  osszeg numeric NOT NULL,
  koltsegvetesi_tetel text,
  megjegyzes text,
  synced boolean DEFAULT false,
  lelkész_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT penztar_pkey PRIMARY KEY (id),
  CONSTRAINT penztar_szemely_id_fkey FOREIGN KEY (szemely_id) REFERENCES public.szemely(id),
  CONSTRAINT penztar_koltsegvetesi_tetel_fkey FOREIGN KEY (koltsegvetesi_tetel) REFERENCES public.szamadasicel(id),
  CONSTRAINT penztar_lelkész_id_fkey FOREIGN KEY (lelkész_id) REFERENCES auth.users(id)
);
CREATE TABLE public.presbiter (
  id integer NOT NULL DEFAULT nextval('presbiter_id_seq'::regclass),
  id_szemely integer NOT NULL,
  tisztseg character varying NOT NULL,
  korzet character varying,
  korzetszamok character varying,
  id_csoport integer,
  CONSTRAINT presbiter_pkey PRIMARY KEY (id),
  CONSTRAINT presbiter_id_csoport_fk FOREIGN KEY (id_csoport) REFERENCES public.csoport(id),
  CONSTRAINT presbiter_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  congregation text,
  birth_date date,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  phone text,
  congregation_id uuid,
  role text DEFAULT 'lelkesz'::text,
  diocese_id uuid,
  district_id uuid,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT profiles_diocese_id_fkey FOREIGN KEY (diocese_id) REFERENCES public.dioceses(id),
  CONSTRAINT profiles_district_id_fkey FOREIGN KEY (district_id) REFERENCES public.districts(id)
);
CREATE TABLE public.sirhely (
  id integer NOT NULL DEFAULT nextval('sirhely_id_seq'::regclass),
  parcella character varying NOT NULL,
  sor integer NOT NULL,
  szam character varying NOT NULL,
  elhelyezkedes character varying,
  meret character varying,
  tipus character varying,
  megjegyzes character varying,
  aktivberlesid integer,
  temetoid integer NOT NULL,
  imagelnk character varying,
  allapot text DEFAULT 'szabad'::text CHECK (allapot = ANY (ARRAY['szabad'::text, 'foglalt'::text, 'lejart'::text, 'zart'::text, 'fenntartott'::text])),
  gps_lat double precision,
  gps_lng double precision,
  deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sirhely_pkey PRIMARY KEY (id),
  CONSTRAINT sirhely_aktivberlesid_fk FOREIGN KEY (aktivberlesid) REFERENCES public.sirhelyberles(id),
  CONSTRAINT sirhely_temetoid_fk FOREIGN KEY (temetoid) REFERENCES public.sirhelytemeto(id)
);
CREATE TABLE public.sirhelyberles (
  id integer NOT NULL DEFAULT nextval('sirhelyberles_id_seq'::regclass),
  sirhelyid integer NOT NULL,
  befizetesid integer NOT NULL,
  megvaltas timestamp without time zone NOT NULL,
  lejarata timestamp without time zone,
  megjegyzes character varying,
  berlo character varying,
  berloid integer,
  berlocim character varying,
  berloelerhetoseg character varying,
  tipus text DEFAULT 'berles'::text CHECK (tipus = ANY (ARRAY['berles'::text, 'megvaltas'::text])),
  osszeg numeric,
  deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sirhelyberles_pkey PRIMARY KEY (id),
  CONSTRAINT sirhelyberles_befizetesid_fk FOREIGN KEY (befizetesid) REFERENCES public.befizetes(id),
  CONSTRAINT sirhelyberles_berloid_fk FOREIGN KEY (berloid) REFERENCES public.szemely(id),
  CONSTRAINT sirhelyberles_sirhelyid_fk FOREIGN KEY (sirhelyid) REFERENCES public.sirhely(id)
);
CREATE TABLE public.sirhelyelhunyt (
  id integer NOT NULL DEFAULT nextval('sirhelyelhunyt_id_seq'::regclass),
  temetesid integer NOT NULL,
  sz_datum timestamp without time zone,
  sz_hely character varying,
  ferfi boolean NOT NULL,
  anyjaneve character varying,
  hdatum timestamp without time zone,
  hhely character varying,
  tdatum timestamp without time zone,
  ttipus character varying,
  tmodja character varying,
  elhelyezkedes character varying,
  temetteto character varying,
  szolgaltato character varying,
  megjegyzes character varying,
  nev character varying,
  sznev character varying,
  sirhelyid integer NOT NULL,
  deleted boolean DEFAULT false,
  CONSTRAINT sirhelyelhunyt_pkey PRIMARY KEY (id),
  CONSTRAINT sirhelyelhunyt_temetesid_fk FOREIGN KEY (temetesid) REFERENCES public.temetes(id),
  CONSTRAINT sirhelyelhunyt_sirhelyid_fk FOREIGN KEY (sirhelyid) REFERENCES public.sirhely(id)
);
CREATE TABLE public.sirhelytemeto (
  id integer NOT NULL DEFAULT nextval('sirhelytemeto_id_seq'::regclass),
  nev character varying NOT NULL,
  megjegyzes character varying,
  congregation_id uuid,
  cim text,
  aktiv boolean DEFAULT true,
  deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sirhelytemeto_pkey PRIMARY KEY (id),
  CONSTRAINT sirhelytemeto_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid,
  user_id uuid,
  sender_name text,
  sender_email text,
  category text NOT NULL CHECK (category = ANY (ARRAY['hiba'::text, 'fejlesztes'::text, 'kiegeszites'::text, 'kerdes'::text, 'egyeb'::text])),
  module text,
  subject text NOT NULL,
  message text NOT NULL,
  urgency text DEFAULT 'alacsony'::text CHECK (urgency = ANY (ARRAY['alacsony'::text, 'kozepes'::text, 'surgos'::text])),
  page_url text,
  status text DEFAULT 'new'::text CHECK (status = ANY (ARRAY['new'::text, 'read'::text, 'replied'::text, 'closed'::text])),
  admin_reply text,
  replied_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT support_messages_pkey PRIMARY KEY (id),
  CONSTRAINT support_messages_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.szamadasicel (
  id character varying NOT NULL,
  nevro character varying,
  nev character varying,
  sorszam integer NOT NULL,
  sorszamok character varying,
  aktiv boolean NOT NULL,
  aktivevi boolean NOT NULL,
  iscel boolean NOT NULL,
  belsotetel character varying,
  type character varying NOT NULL,
  CONSTRAINT szamadasicel_pkey PRIMARY KEY (id)
);
CREATE TABLE public.szamadasidatum (
  honap integer NOT NULL,
  ev integer,
  CONSTRAINT szamadasidatum_pkey PRIMARY KEY (honap)
);
CREATE TABLE public.szemely (
  id integer NOT NULL DEFAULT nextval('szemely_id_seq'::regclass),
  cnp character varying NOT NULL,
  szcs_nev character varying,
  k_nev character varying,
  csaladnev character varying,
  ferjk_nev character varying,
  allapot character varying,
  apjaneve character varying,
  id_apja character varying,
  anyjaneve character varying,
  id_anyja character varying,
  csaladfo boolean NOT NULL,
  ferfi boolean NOT NULL,
  meghalt boolean NOT NULL,
  sz_datum date,
  sz_helyid integer,
  vallas character varying,
  foglalkozas character varying,
  nemzetiseg character varying,
  c_utcaid integer NOT NULL,
  c_szam character varying,
  c_tombhaz character varying,
  c_lepcsohaz character varying,
  c_ajto character varying,
  c_emelet character varying,
  c_szcim character varying,
  telefon character varying,
  email character varying,
  befizetoev integer NOT NULL,
  megjegyzes character varying,
  isvisible boolean NOT NULL,
  kep character varying,
  type character varying NOT NULL,
  created timestamp without time zone,
  namepattern character varying,
  szig character varying,
  taj character varying,
  congregation_id uuid,
  family_id uuid,
  member_status text DEFAULT 'aktív'::text,
  voter_eligible boolean DEFAULT false,
  photo_url text,
  c_helysegid integer,
  CONSTRAINT szemely_pkey PRIMARY KEY (id),
  CONSTRAINT szemely_c_utcaid_fk FOREIGN KEY (c_utcaid) REFERENCES public.adrstreet(id),
  CONSTRAINT szemely_sz_helyid_fk FOREIGN KEY (sz_helyid) REFERENCES public.adrlocality(id),
  CONSTRAINT szemely_id_apja_fk FOREIGN KEY (id_apja) REFERENCES public.szemely(cnp),
  CONSTRAINT szemely_id_anyja_fk FOREIGN KEY (id_anyja) REFERENCES public.szemely(cnp),
  CONSTRAINT szemely_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT szemely_c_helysegid_fk FOREIGN KEY (c_helysegid) REFERENCES public.adrlocality(id)
);
CREATE TABLE public.temetes (
  id integer NOT NULL DEFAULT nextval('temetes_id_seq'::regclass),
  id_szemely integer NOT NULL,
  hdatum timestamp without time zone NOT NULL,
  hoka character varying,
  tdatum timestamp without time zone NOT NULL,
  lelkeszneve character varying,
  okirat character varying,
  megjegyzes character varying,
  munkanaploba boolean NOT NULL,
  hhelyid integer,
  thelyid integer,
  congregation_id uuid,
  munkanaplo_id integer,
  CONSTRAINT temetes_pkey PRIMARY KEY (id),
  CONSTRAINT temetes_id_szemely_fk FOREIGN KEY (id_szemely) REFERENCES public.szemely(id),
  CONSTRAINT temetes_hhelyid_fk FOREIGN KEY (hhelyid) REFERENCES public.adrlocality(id),
  CONSTRAINT temetes_thelyid_fk FOREIGN KEY (thelyid) REFERENCES public.adrlocality(id),
  CONSTRAINT temetes_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id)
);
CREATE TABLE public.tmp_befizetes (
  id double precision NOT NULL,
  év character varying,
  ho double precision,
  nyugtamin double precision,
  nyugtamax double precision,
  maradék double precision,
  egyházfentartás double precision,
  javitás double precision,
  persely double precision,
  mezögazdaság double precision,
  stóla double precision,
  rendkivüli double precision,
  harangdij double precision,
  egyébb double precision,
  sirhelyek integer,
  összesen double precision,
  CONSTRAINT tmp_befizetes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tmp_csaladosszeg (
  id_csalad character varying,
  osszeg integer,
  kotelezoosszeg integer,
  házszám character varying,
  családnév character varying,
  szcsaládnév character varying,
  keresztnév character varying,
  született timestamp without time zone,
  év character varying,
  hó character varying,
  nap character varying,
  éves1 character varying,
  életkor character varying,
  azonositó character varying,
  utca character varying,
  helység character varying,
  apja character varying,
  anyja character varying,
  megjegyzes character varying,
  férfi boolean NOT NULL,
  meghalt boolean NOT NULL,
  csaladfo boolean NOT NULL
);
CREATE TABLE public.tmp_kiadas (
  id double precision NOT NULL,
  év character varying,
  ho double precision,
  nyugtamin double precision,
  nyugtamax double precision,
  fizetés double precision,
  fizutadók double precision,
  kiszállásiköltségek double precision,
  fütésvillany double precision,
  postatel double precision,
  közpjárulék double precision,
  javitásberuházás double precision,
  diakónia double precision,
  segély double precision,
  egesztarsbiztositas integer,
  munkanelkulisegelyalap integer,
  egyébb double precision,
  összesen double precision,
  CONSTRAINT tmp_kiadas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tmp_penztarkonyv (
  id double precision,
  nr double precision,
  data timestamp without time zone,
  explicatii character varying,
  incasari double precision,
  plati double precision,
  sold double precision,
  nyugta double precision,
  cel character varying
);
CREATE TABLE public.tmp_valnevjegy (
  type character varying,
  id_csalad integer NOT NULL DEFAULT nextval('tmp_valnevjegy_id_csalad_seq'::regclass),
  id_szemely integer,
  állapot character varying,
  családnév character varying,
  szcsaládnév character varying,
  keresztnév character varying,
  ferjk_nev character varying,
  született timestamp without time zone,
  házszám character varying,
  utca character varying,
  helység character varying,
  férfi boolean NOT NULL,
  foglalkozás character varying,
  csaladfo boolean NOT NULL,
  isvisible boolean NOT NULL,
  isbefizeto boolean NOT NULL,
  befizetve double precision
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  account_code text NOT NULL,
  direction text CHECK (direction = ANY (ARRAY['income'::text, 'expense'::text])),
  amount_ron numeric NOT NULL,
  payment_type text DEFAULT 'cash'::text,
  document_number text,
  description text,
  entered_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_congregation_id_fkey FOREIGN KEY (congregation_id) REFERENCES public.congregations(id),
  CONSTRAINT transactions_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES auth.users(id)
);
CREATE TABLE public.users (
  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),
  username character varying NOT NULL,
  userpass character varying,
  usertype character varying NOT NULL,
  fullname character varying NOT NULL,
  lastacces timestamp without time zone,
  CONSTRAINT users_pkey PRIMARY KEY (username)
);