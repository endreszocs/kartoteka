/**
 * FELHASZNÁLÓ-NÉV SEGÉDEK — egy helyen (2026-09-05, profil-kör D7).
 *
 * MIÉRT: a monogram HÁROM ad hoc változatban élt (profil-dialógus, fejléc,
 * profil-választó) és a keresztnév-kinyerő KÉT másolatban (dashboard layout,
 * pending oldal). A monogram-változatok az „Nt. Kovács János" előtagot sem
 * szűrték, ezért „NK" lett belőle „KJ" helyett.
 *
 * ⚠️ Ez a FELHASZNÁLÓ (lelkész, könyvelő…) nevére való. A gyülekezeti TAGOK
 * neve más szabályt követ (`packages/ui-app/src/members/name-format.ts`).
 *
 * Direktíva-mentes modul: kliens és szerver egyaránt használja.
 */

/** Egyházi/tudományos előtagok, amelyek NEM részei a névnek. */
const NEV_ELOTAG = /^(?:(?:Nt|Ft|Főt|Rev|Pál|Dr|Drs|Prof|Id|Ifj)\.\s+)+/i

/** Az előtag(ok) levágása: „Nt. Dr. Kovács János" → „Kovács János". */
export function stripTitles(fullName: string | null | undefined): string {
  if (!fullName) return ''
  return fullName.trim().replace(NEV_ELOTAG, '').trim()
}

/**
 * Monogram az avatárhoz: az ELSŐ és az UTOLSÓ szó kezdőbetűje (magyar
 * sorrendben vezeték- + keresztnév). Egyszavas névnél az első két betű.
 * Ha nincs név, a `fallback` (alapból „?") — sosem üres, az avatár-kör ne
 * maradjon lyukas.
 */
export function getInitials(fullName: string | null | undefined, fallback = '?'): string {
  const tiszta = stripTitles(fullName)
  if (!tiszta) return fallback
  const szavak = tiszta.split(/\s+/).filter(Boolean)
  if (szavak.length === 0) return fallback
  if (szavak.length === 1) return szavak[0].slice(0, 2).toUpperCase()
  const elso = szavak[0][0] ?? ''
  const utolso = szavak[szavak.length - 1][0] ?? ''
  return `${elso}${utolso}`.toUpperCase() || fallback
}

/**
 * Magyar keresztnév-kinyerés — „Nt. Kovács János" → „János".
 * Ha nem ismerhető fel, `null` (a hívó a saját fallbackjét írja, pl.
 * „Lelkipásztor"). A dashboard layout korábbi helyi függvénye költözött ide.
 */
export function extractFirstName(fullName: string | null | undefined): string | null {
  const tiszta = stripTitles(fullName)
  if (!tiszta) return null
  const parts = tiszta.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return parts[parts.length - 1]
}
