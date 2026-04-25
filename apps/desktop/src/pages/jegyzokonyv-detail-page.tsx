/**
 * Jegyzőkönyv részletes nézet — `/jegyzokonyvek/:id` route.
 *
 * Sprint H (2026-04-25) — READ-ONLY a 4 mirror-tábla join-jából.
 * 3 szekció: résztvevők, napirendi pontok, határozatok.
 */

import { useEffect, useState } from 'react'
import { ArrowLeft, ScrollText, ThumbsDown, ThumbsUp, UserCheck, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button, Card, CardContent } from '@kartoteka/ui'
import { PageHero } from '@kartoteka/ui-app'

import { DesktopShell } from '../lib/shell/desktop-shell'
import { getLocalMinutesById, type MinutesDetail } from '../lib/sync'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${m[1]}. ${m[2]}. ${m[3]}.`
}

export function JegyzokonyvDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<MinutesDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    let mounted = true
    setLoading(true)
    void getLocalMinutesById(id)
      .then((d) => {
        if (mounted) {
          setDetail(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (mounted) {
          setDetail(null)
          setLoading(false)
        }
      })
    return () => {
      mounted = false
    }
  }, [id])

  if (loading) {
    return (
      <DesktopShell>
        <div className="flex h-64 items-center justify-center">
          <p className="text-sm text-slate-500">Betöltés…</p>
        </div>
      </DesktopShell>
    )
  }

  if (!detail) {
    return (
      <DesktopShell>
        <div className="space-y-5">
          <Button variant="outline" size="sm" onClick={() => navigate('/jegyzokonyvek')} className="rounded-xl">
            <ArrowLeft className="mr-1 size-3.5" />
            Vissza a listához
          </Button>
          <Card className="card-raised border-0">
            <CardContent className="p-10 text-center">
              <ScrollText className="mx-auto size-10 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                A keresett jegyzőkönyv nem található a lokális cache-ben.
              </p>
              <p className="text-xs text-slate-400">
                Lépj vissza a listához és frissítsd az adatokat.
              </p>
            </CardContent>
          </Card>
        </div>
      </DesktopShell>
    )
  }

  return (
    <DesktopShell>
      <div className="space-y-5">
        <Button variant="outline" size="sm" onClick={() => navigate('/jegyzokonyvek')} className="rounded-xl">
          <ArrowLeft className="mr-1 size-3.5" />
          Vissza a listához
        </Button>

        <PageHero
          eyebrow={`${detail.ev}/${detail.ules_sorszam}. ${detail.tipus === 'presbiteri' ? 'presbiteri' : 'közgyűlési'} ülés`}
          title={formatDate(detail.datum)}
          description={detail.hely ? `Helyszín: ${detail.hely}` : undefined}
          Icon={ScrollText}
          stats={[
            { label: 'Résztvevők', value: String(detail.resztvevok.length) },
            { label: 'Napirendi pontok', value: String(detail.napirendi_pontok.length) },
            { label: 'Határozatok', value: String(detail.hatarozatok.length) },
          ]}
        />

        {/* Meta — kezdés/zárás/elnök/jegyző/hitelesítők */}
        <Card className="card-raised border-0">
          <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetaItem label="Kezdés" value={detail.kezdes} />
            <MetaItem label="Zárás" value={detail.zaras} />
            <MetaItem label="Elnök" value={detail.elnok_neve} />
            <MetaItem label="Jegyző" value={detail.jegyzo_neve} />
            <MetaItem label="Hitelesítő 1" value={detail.hitelesito1} />
            <MetaItem label="Hitelesítő 2" value={detail.hitelesito2} />
            <MetaItem label="Igevers" value={detail.igevers} />
            <MetaItem label="Felolvasás" value={detail.felolvasas} />
          </CardContent>
        </Card>

        {detail.megjegyzes && (
          <Card className="card-raised border-0">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Megjegyzés
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{detail.megjegyzes}</p>
            </CardContent>
          </Card>
        )}

        {/* Résztvevők */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Users className="size-4 text-violet-600" />
            <h2 className="font-heading text-xl text-slate-800">Résztvevők ({detail.resztvevok.length})</h2>
          </div>
          {detail.resztvevok.length === 0 ? (
            <Card className="card-raised border-0">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                Nincsen rögzített résztvevő.
              </CardContent>
            </Card>
          ) : (
            <Card className="card-raised border-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Név</th>
                    <th className="px-4 py-2.5">Szerep</th>
                    <th className="px-4 py-2.5">Státusz</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.resztvevok.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/40">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.nev}</td>
                      <td className="px-4 py-2.5 text-slate-600">{p.szerep ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {p.statusz === 'jelen' || p.statusz === 'jelen_volt' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            <UserCheck className="size-3" />
                            Jelen
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">{p.statusz ?? '—'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        {/* Napirendi pontok */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ScrollText className="size-4 text-sky-600" />
            <h2 className="font-heading text-xl text-slate-800">Napirendi pontok ({detail.napirendi_pontok.length})</h2>
          </div>
          {detail.napirendi_pontok.length === 0 ? (
            <Card className="card-raised border-0">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                Nincsen rögzített napirendi pont.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {detail.napirendi_pontok.map((np) => (
                <Card key={np.id} className="card-raised border-0">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-cyan-500 text-white">
                        <span className="font-mono text-sm font-bold">{np.sorszam}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-slate-800">{np.cim}</h3>
                        {np.eloado && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            Előadó: <strong className="text-slate-700">{np.eloado}</strong>
                          </p>
                        )}
                        {np.targyalas && (
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{np.targyalas}</p>
                        )}
                        {(np.szavazas_igen != null || np.szavazas_nem != null || np.szavazas_tartozkodo != null) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              <ThumbsUp className="size-3" />
                              Igen: {np.szavazas_igen ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700">
                              <ThumbsDown className="size-3" />
                              Nem: {np.szavazas_nem ?? 0}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                              Tartózk.: {np.szavazas_tartozkodo ?? 0}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Határozatok */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ScrollText className="size-4 text-emerald-600" />
            <h2 className="font-heading text-xl text-slate-800">Határozatok ({detail.hatarozatok.length})</h2>
          </div>
          {detail.hatarozatok.length === 0 ? (
            <Card className="card-raised border-0">
              <CardContent className="p-6 text-center text-sm text-slate-500">
                Nincsen rögzített határozat.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {detail.hatarozatok.map((h) => (
                <Card key={h.id} className="card-raised border-0">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 px-2.5 py-1.5 text-white">
                        <span className="font-mono text-xs font-bold">
                          {h.ev ? `${h.ev}/` : ''}{String(h.sorszam).padStart(3, '0')}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {h.allapot && h.allapot !== 'elfogadva' && (
                          <span className="mb-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                            {h.allapot}
                          </span>
                        )}
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{h.szoveg}</p>
                        {(h.felelos || h.hatarido) && (
                          <p className="mt-2 text-xs text-slate-500">
                            {h.felelos && (
                              <>
                                Felelős: <strong className="text-slate-700">{h.felelos}</strong>
                              </>
                            )}
                            {h.felelos && h.hatarido && <> • </>}
                            {h.hatarido && (
                              <>
                                Határidő: <strong className="text-slate-700">{formatDate(h.hatarido)}</strong>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </DesktopShell>
  )
}

function MetaItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value ?? '—'}</p>
    </div>
  )
}
