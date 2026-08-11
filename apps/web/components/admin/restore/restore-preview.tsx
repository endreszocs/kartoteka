'use client'

/**
 * A SZÁRAZ FUTÁS EREDMÉNYE. 2026-08-11.
 *
 * A sorrend szándékos: elöl az áll, ami FÁJ. „37 sor törlődik" semmit nem
 * jelent — „Nagy István temetése kikerül az anyakönyvből" mindent. Ezért a
 * törlődő sorok mintacímkékkel jelennek meg, még a táblázat előtt.
 *
 * A mintacímkék fehérlistás mezőkből készülnek (`backup_restore_row_label`):
 * CNP, szig-szám, TAJ, fénykép, e-mail, telefon és lelkigondozói megjegyzés
 * SOHA nem kerül a képernyőre.
 */

import { AlertTriangle, ArrowDownToLine, Ban, Info, LifeBuoy, Pencil, Trash2 } from 'lucide-react'

import { StatusBadge } from '@/components/admin/_shared/status-badge'
import type { RestorePreview } from '@/app/(dashboard)/admin/biztonsagi-mentes/restore-shared'

function szam(n: number): string {
  return n.toLocaleString('hu-HU')
}

function KartyaSzam({
  cimke,
  ertek,
  hangsuly,
  Ikon,
}: {
  cimke: string
  ertek: number
  hangsuly: 'jo' | 'figyelem' | 'veszely'
  Ikon: typeof Trash2
}) {
  const szinek =
    hangsuly === 'veszely'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : hangsuly === 'figyelem'
        ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${szinek}`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        <Ikon className="size-3.5 shrink-0" aria-hidden />
        {cimke}
      </div>
      <p className="mt-1 font-heading text-2xl tabular-nums sm:text-3xl">{szam(ertek)}</p>
    </div>
  )
}

export function RestorePreviewPanel({ preview }: { preview: RestorePreview }) {
  const veszteseg = preview.tablak.filter((t) => t.torles > 0)
  const valtozik = preview.tablak.filter((t) => t.beszuras + t.modositas + t.torles > 0)
  const hibasTablak = preview.tablak.filter((t) => t.hiba)

  return (
    <div className="space-y-4">
      {/* ── Összefoglaló ─────────────────────────────────────────────── */}
      <div>
        <h3 className="font-heading text-lg text-foreground">Ez történne, ha most megnyomnád</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A rendszer a(z) <strong className="text-foreground">{preview.congregationNev}</strong>{' '}
          gyülekezet adatait a <strong className="text-foreground">{preview.runDate}</strong>-i
          mentés állapotára cserélné. Most még semmi nem történt.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KartyaSzam
          cimke="Visszajönne"
          ertek={preview.osszesen.beszuras}
          hangsuly="jo"
          Ikon={ArrowDownToLine}
        />
        <KartyaSzam
          cimke="Felülíródna"
          ertek={preview.osszesen.modositas}
          hangsuly="figyelem"
          Ikon={Pencil}
        />
        <KartyaSzam
          cimke="Eltűnne"
          ertek={preview.osszesen.torles}
          hangsuly="veszely"
          Ikon={Trash2}
        />
      </div>

      {/* ── Blokkolók ────────────────────────────────────────────────── */}
      {preview.blokkolo.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <Ban className="size-5 shrink-0" aria-hidden />
            Így a visszaállítás nem indulhat el
          </p>
          <p className="mt-1 text-sm text-destructive/90">
            Az alábbi táblákat a rendszer nem tudja biztonságosan visszatölteni. Amíg ez így van,
            inkább megállunk, mint hogy féloldalas állapotot hozzunk létre. Ezek besorolása
            SQL-ben történik.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-destructive/90">
            {preview.blokkolo.map((b) => (
              <li key={b.tabla} className="break-words">
                <span className="font-mono font-semibold">{b.tabla}</span> — {b.ok}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── AMI ELVESZNE ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="flex items-center gap-2 font-semibold text-destructive">
          <Trash2 className="size-5 shrink-0" aria-hidden />
          Ami elveszne
        </p>
        {veszteseg.length === 0 ? (
          <p className="mt-1 text-sm text-foreground">
            A mentés óta nem keletkezett olyan adat, ami eltűnne. Ez a legjobb eset.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Ezek a sorok a mentés elkészülte UTÁN keletkeztek, ezért a visszaállítás
              törölné őket. A mentés előtti állapotról készülő biztonsági másolatból
              visszahozhatók, de a visszahozás külön művelet.
            </p>
            <ul className="mt-3 space-y-3">
              {veszteseg.map((t) => (
                <li key={t.tabla} className="rounded-lg border border-destructive/20 bg-card p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {t.tabla}
                    </span>
                    <StatusBadge intent="danger">{szam(t.torles)} sor tűnne el</StatusBadge>
                  </div>
                  {t.mintaTorles.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-sm text-foreground">
                      {t.mintaTorles.map((m, i) => (
                        <li key={`${t.tabla}-${i}`} className="break-words">
                          • {m}
                        </li>
                      ))}
                      {t.torles > t.mintaTorles.length && (
                        <li className="text-muted-foreground">
                          …és további {szam(t.torles - t.mintaTorles.length)} sor.
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── Táblánkénti részletek ────────────────────────────────────── */}
      <details className="rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Táblánkénti részletek ({szam(valtozik.length)} tábla változna,{' '}
          {szam(preview.tablak.length)} érintett)
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-2 py-2">Tábla</th>
                <th className="px-2 py-2 text-right">Mentésben</th>
                <th className="px-2 py-2 text-right">Most</th>
                <th className="px-2 py-2 text-right">Vissza</th>
                <th className="px-2 py-2 text-right">Felülír</th>
                <th className="px-2 py-2 text-right">Eltűnik</th>
              </tr>
            </thead>
            <tbody>
              {preview.tablak.map((t) => (
                <tr key={t.tabla} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1.5 font-mono text-xs text-foreground">
                    {t.tabla}
                    {t.nincsPk && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(nincs kulcs)</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{szam(t.mentesben)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{szam(t.elo)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                    {t.beszuras > 0 ? `+${szam(t.beszuras)}` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-amber-700 dark:text-amber-300">
                    {t.modositas > 0 ? `~${szam(t.modositas)}` : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-destructive">
                    {t.torles > 0 ? `−${szam(t.torles)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hibasTablak.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-destructive">
            {hibasTablak.map((t) => (
              <li key={t.tabla}>
                <span className="font-mono">{t.tabla}</span>: {t.hiba}
              </li>
            ))}
          </ul>
        )}
        {preview.erintetlen.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Amihez hozzá sem nyúl</strong> (nincs a
            mentésben): {preview.erintetlen.join(', ')}
          </p>
        )}
      </details>

      {/* ── Figyelmeztetések ─────────────────────────────────────────── */}
      {preview.figyelmeztetesek.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
          <p className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            Ezt nézd meg, mielőtt döntesz
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900/90 dark:text-amber-200/90">
            {preview.figyelmeztetesek.map((f, i) => (
              <li key={i} className="break-words">
                • {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Amit nem tud ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <Info className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          Amit a visszaállítás nem tud
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
          {preview.amitNemTud.map((s, i) => (
            <li key={i} className="break-words">
              • {s}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Biztonsági háló ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30">
        <p className="flex items-center gap-2 font-semibold text-sky-900 dark:text-sky-200">
          <LifeBuoy className="size-5 shrink-0" aria-hidden />
          A biztonsági háló
        </p>
        <p className="mt-1 text-sm leading-relaxed text-sky-900/90 dark:text-sky-200/90">
          Mielőtt bármi megváltozna, a rendszer mentést készít a MOSTANI állapotról, és
          ellenőrzi is, hogy sikerült. Ha ez nem sikerül, a visszaállítás el sem indul. Az
          elő-mentés 90 napig megmarad — ebből lehet visszatérni ide, ahol most vagy.
        </p>
      </div>
    </div>
  )
}
