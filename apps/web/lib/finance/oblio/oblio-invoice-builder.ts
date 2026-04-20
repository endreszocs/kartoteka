/**
 * KARTOTEKA → Oblio számla-builder.
 *
 * A KARTOTEKA belső adataiból (bérleti szerződés, congregation, oblio_fiokok)
 * Oblio-kompatibilis `OblioInvoiceCreateRequest`-et épít.
 *
 * Fontos jogi kontextus:
 * - Ha a gyülekezet NEM ÁFA-alany (tva_alany = false), akkor a számla
 *   `vatPercentage = 0` és `vatName = 'Scutit fără drept de deducere'`
 * - Ha a gyülekezet ÁFA-alany (tva_alany = true), akkor `vatPercentage = 19`
 *   és `vatName = 'Normala'`
 * - A `mentions` mezőben jogi hivatkozást jelölünk
 */

import 'server-only'
import type { OblioInvoiceCreateRequest, OblioClient, OblioProduct } from './oblio-types'

interface BuildInvoiceArgs {
  /** A bérleti szerződés adatai */
  contract: {
    berlo_nev: string
    ceg_nev: string | null
    ceg_adoszam: string | null
    targy: string | null
    leiras: string
    tipus: string // terulet / epulet
    osszeg: number
    fizetesi_ciklus: string
  }

  /** Az Oblio fiók konfigurációja */
  oblioConfig: {
    cif: string
    sorozat_default: string | null
    nev_default_service: string | null
  }

  /** Számla paraméterek */
  invoice: {
    szamlaDatum: string // YYYY-MM-DD
    esedekesseg: string // YYYY-MM-DD
    idoszak: string // pl. "martie 2026" — a szolgáltatás időszaka
    osszeg: number // az adott havi/negyedéves/éves összeg
    megjegyzes?: string
  }

  /** A gyülekezet TVA-alany-e? */
  tvaAlany: boolean
}

/**
 * Oblio-kompatibilis számla-request felépítése.
 */
export function buildOblioInvoiceRequest(args: BuildInvoiceArgs): OblioInvoiceCreateRequest {
  const { contract, oblioConfig, invoice, tvaAlany } = args

  // 1. Partner (client) — cég vagy magánszemély
  const isCeg = !!contract.ceg_nev && !!contract.ceg_adoszam
  const client: OblioClient = isCeg
    ? {
        cif: contract.ceg_adoszam || undefined,
        name: contract.ceg_nev || contract.berlo_nev,
      }
    : {
        name: contract.berlo_nev,
        // Magánszemélynél CNP nem kötelező (B2C e-Factura),
        // ha nincs, az Oblio 13 db nullát fog beírni
      }

  // 2. Termék/szolgáltatás
  const serviceName = oblioConfig.nev_default_service || 'Chirie spațiu'
  const tipusLabel = contract.tipus === 'terulet' ? 'teren' : 'clădire'
  const fullServiceName = `${serviceName} ${tipusLabel} - ${invoice.idoszak}`

  const product: OblioProduct = {
    name: fullServiceName,
    measuringUnit: 'buc',
    currency: 'RON',
    quantity: 1,
    price: invoice.osszeg,
    productType: 'Serviciu',
    vatPercentage: tvaAlany ? 19 : 0,
    vatName: tvaAlany
      ? 'Normala'
      : 'Scutit fără drept de deducere',
    vatIncluded: false,
  }

  // 3. Jogi hivatkozás (mentions)
  const mentions = tvaAlany
    ? `Factură emisă de către unitatea de cult conform art. 331 Cod fiscal.`
    : `Factură emisă conform art. 292 alin. (2) lit. e) din Codul fiscal (scutit fără drept de deducere). ` +
      `Contract de ${contract.tipus === 'terulet' ? 'arendare/închiriere teren' : 'închiriere clădire'}.`

  return {
    cif: oblioConfig.cif,
    client,
    issueDate: invoice.szamlaDatum,
    dueDate: invoice.esedekesseg,
    seriesName: oblioConfig.sorozat_default || 'KA',
    language: 'RO',
    precision: 2,
    currency: 'RON',
    useStock: 0,
    products: [product],
    internalNote: invoice.megjegyzes,
    mentions,
  }
}
