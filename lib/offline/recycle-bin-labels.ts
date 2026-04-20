/**
 * Recycle Bin label-builder — tábla-specifikus ember-olvasható címek.
 *
 * Ugyanazt a logikát követi, mint az `excel-import-diff.ts` buildDisplayLabel
 * függvénye, de stand-alone hogy a Kuka view fel tudja használni.
 */

export function buildRecycleBinLabel(dexieTable: string) {
  return (record: Record<string, unknown>): string => {
    switch (dexieTable) {
      case 'szemely': {
        const cs = record.csaladnev ?? ''
        const k = record.k_nev ?? ''
        if (cs || k) return `${cs} ${k}`.trim()
        return `Személy #${record.id ?? '?'}`
      }
      case 'csalad':
        return `Család #${record.id ?? '?'} (${record.c_szam ?? '—'})`
      case 'presbiter':
        return `Presbiter #${record.id ?? '?'} (${record.tisztseg ?? '—'})`
      case 'gyerek':
        return `${record.nev ?? 'Gyermek'} #${record.id ?? '?'}`
      case 'felmentes':
        return `Felmentés #${record.id ?? '?'} ${record.felmento ? '— ' + record.felmento : ''} (${record.kezdete ?? '?'} – ${record.vege ?? '?'})`
      case 'befizetes':
        return `${record.datum ?? '?'} — ${record.osszeg ?? 0} RON`
      case 'kiadas':
        return `${record.datum ?? '?'} — ${record.osszeg ?? 0} RON (${record.leiras ?? ''})`
      case 'bankszamlak':
        return String(record.bank_neve ?? `Bankszámla #${record.id}`)
      case 'belsomozgas':
        return `${record.datum ?? '?'} · ${record.tipus ?? ''} — ${record.osszeg ?? 0} RON`
      case 'berleti_szerzodes':
        return String(
          record.berlo_nev ??
            record.ceg_nev ??
            `Bérleti szerződés #${record.id}`,
        )
      case 'keresztseg':
        return `Keresztelő #${record.id ?? '?'} (${record.datum ?? '—'})`
      case 'konfirmalas':
        return `Konfirmálás #${record.id ?? '?'} (${record.datum ?? '—'})`
      case 'hazassag':
        return `Házasság #${record.id ?? '?'} (${record.datum ?? '—'})`
      case 'temetes':
        return `Temetés #${record.id ?? '?'} (${record.tdatum ?? record.hdatum ?? '—'})`
      case 'munkanaplo':
        return `${record.idopont ?? '?'} — ${record.cim ?? record.jellege ?? ''}`
      case 'iktato':
        return `${record.year ?? '?'}/${record.sequence_number ?? '?'} — ${record.subject ?? ''}`
      case 'iktato_sablonok':
        return String(record.nev ?? `Sablon`)
      case 'leltar_tetelek':
        return String(record.megnevezes ?? `Tétel #${record.id}`)
      case 'sirhelytemeto':
        return String(record.nev ?? `Temető #${record.id}`)
      case 'sirhely':
        return `Sírhely #${record.id ?? '?'} (${record.parcella ?? '—'}/${record.sor ?? '—'}/${record.szam ?? '—'})`
      case 'sirhelyberles':
        return `${record.berlo ?? 'Bérlő'} (${record.megvaltas ?? '?'} — ${record.lejarata ?? '?'})`
      case 'sirhelyelhunyt':
        return `${record.nev ?? 'Elhunyt'} (${record.hdatum ?? '?'})`
      case 'presbiteri_jegyzokonyvek':
        return `${record.ev ?? '?'}/${record.ules_sorszam ?? '?'} — ${record.datum ?? ''}`
      case 'jegyzokonyv_hatarozatok':
        return `Határozat ${record.ev ?? '?'}/${record.sorszam ?? '?'}`
      default:
        return `Rekord #${record.id ?? '?'}`
    }
  }
}
