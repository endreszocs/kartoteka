export const MEMBER_IMPORT_PROFILES = [
  {
    value: 'persons',
    label: 'Személyek',
    description:
      'Tagok, alap személyes adatok, címek és gyülekezeti státuszok előkészített importja.',
    columns: [
      'csaladnev',
      'keresztnev',
      'cnp',
      'szuletesi_datum',
      'telefon',
      'email',
      'vallas',
      'foglalkozas',
    ],
    hints: [
      'Egy sor = egy személy.',
      'A CNP legyen egyedi.',
      'A dátumok legyenek egységes formátumúak.',
    ],
  },
  {
    value: 'families',
    label: 'Családok',
    description:
      'Családi egységek, háztartási adatok és címkapcsolatok betöltésének labor-előkészítése.',
    columns: ['csalad_azonosito', 'csaladnev', 'telepules', 'utca', 'hazszam', 'megjegyzes'],
    hints: [
      'A családazonosító legyen stabil.',
      'A cím egy családon belül egységes legyen.',
      'A háztartási megjegyzések külön oszlopba kerüljenek.',
    ],
  },
  {
    value: 'presbyters',
    label: 'Presbiterek',
    description: 'Presbiteri tisztségek és szolgálati körök strukturált Excel-előkészítése.',
    columns: ['szemely_cnp', 'teljes_nev', 'tiszseg', 'korzet', 'megbizas_kezdete', 'megbizas_vege'],
    hints: [
      'A személyeket CNP-vel vagy stabil azonosítóval párosítsd.',
      'A tisztségek legyenek egységes megnevezésűek.',
    ],
  },
  {
    value: 'districts',
    label: 'Körzetek',
    description: 'Körzet- és körzetkapcsolati adatok tömeges felvitelének előellenőrzése.',
    columns: ['korzet_nev', 'korzet_kod', 'felelos_szemely', 'megjegyzes'],
    hints: [
      'A körzetkód segít az egyedi azonosításban.',
      'A felelős személy legyen meglévő tag.',
    ],
  },
  {
    value: 'voters',
    label: 'Választók',
    description:
      'Választói névjegyzékhez szükséges státuszok és jogosultsági mezők import-előkészítése.',
    columns: [
      'szemely_cnp',
      'teljes_nev',
      'valasztoi_statusz',
      'utolso_befizetes_eve',
      'megjegyzes',
    ],
    hints: [
      'A választói státusz külön oszlopban szerepeljen.',
      'A befizetési adatokkal előzetesen egyeztetni érdemes.',
    ],
  },
] as const
