'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FileUp, Paperclip, X } from 'lucide-react'
import { oauthCompleteSchema, type OAuthCompleteInput } from '@/lib/validations/auth'
import { completeOAuthProfile } from '@/app/(auth)/oauth-complete/actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

interface OAuthCompleteFormProps {
  defaultName?: string
}

interface RefDistrict { id: string; name: string }
interface RefDiocese { id: string; name: string; district_id: string | null }
interface RefCongregation { id: string; name: string; diocese_id: string | null }

type RequestedRole = OAuthCompleteInput['requestedRole']

const ROLES: { value: RequestedRole; label: string; description: string }[] = [
  { value: 'lelkesz', label: 'Lelkész', description: 'Gyülekezet vezető lelkésze' },
  { value: 'esperes', label: 'Esperes', description: 'Egyházmegye elöljárója' },
  { value: 'egyhazmegyei_admin', label: 'Egyházmegyei admin', description: 'Egyházmegyei hivatalvezető' },
  { value: 'egyhazkeruleti_admin', label: 'Egyházkerületi admin', description: 'EREK hivatalvezető' },
  { value: 'konyvelo', label: 'Könyvelő', description: 'Gyülekezeti/egyházmegyei könyvelő' },
  { value: 'egyhazmegyei_szamvevo', label: 'Egyházmegyei számvevő', description: 'Egyházmegyei pénzügyi ellenőr' },
]

const ALLOWED_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
const MAX_DOC_BYTES = 10 * 1024 * 1024 // 10 MB

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

export function OAuthCompleteForm({ defaultName }: OAuthCompleteFormProps) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<OAuthCompleteInput>({
    resolver: zodResolver(oauthCompleteSchema),
    defaultValues: {
      fullName: defaultName || '',
      requestedRole: 'lelkesz',
      districtId: '',
      dioceseId: '',
      requestedCongregationId: '',
      congregation: '',
      justification: '',
      referrer: '',
      termsAccepted: false as unknown as true,
    },
  })

  // ── Kért szerepkör ────────────────────────────────────────────────────────
  const [role, setRole] = useState<RequestedRole>('lelkesz')

  // ── Kaszkád: egyházkerület → egyházmegye → egyházközség (DB-ből, kötelező) ─
  const supabase = useMemo(() => createClient(), [])
  const [districts, setDistricts] = useState<RefDistrict[]>([])
  const [dioceses, setDioceses] = useState<RefDiocese[]>([])
  const [congregations, setCongregations] = useState<RefCongregation[]>([])
  const [districtId, setDistrictId] = useState('')
  const [dioceseId, setDioceseId] = useState('')
  const [congregationId, setCongregationId] = useState('')
  const [refDataError, setRefDataError] = useState(false)

  // ── Opcionális igazolás ───────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [districtRes, dioceseRes, congRes] = await Promise.all([
        supabase.from('districts').select('id, name').order('name'),
        supabase.from('dioceses').select('id, name, district_id').order('name'),
        supabase.rpc('congregations_for_registration'),
      ])
      if (!active) return
      if (districtRes.error || dioceseRes.error || congRes.error) {
        setRefDataError(true)
        return
      }
      setDistricts((districtRes.data as RefDistrict[]) ?? [])
      setDioceses((dioceseRes.data as RefDiocese[]) ?? [])
      setCongregations((congRes.data as RefCongregation[]) ?? [])
    })()
    return () => {
      active = false
    }
  }, [supabase])

  const filteredDioceses = useMemo(
    () => (districtId ? dioceses.filter((d) => d.district_id === districtId) : []),
    [districtId, dioceses],
  )
  const filteredCongregations = useMemo(
    () => (dioceseId ? congregations.filter((c) => c.diocese_id === dioceseId) : []),
    [dioceseId, congregations],
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileError(null)
    if (!f) {
      setFile(null)
      return
    }
    if (!ALLOWED_DOC_TYPES.includes(f.type)) {
      setFileError('Csak PDF, JPG vagy PNG fájl tölthető fel.')
      setFile(null)
      return
    }
    if (f.size > MAX_DOC_BYTES) {
      setFileError('A fájl legfeljebb 10 MB lehet.')
      setFile(null)
      return
    }
    setFile(f)
  }

  async function onSubmit(data: OAuthCompleteInput) {
    setServerError(null)
    setSuccess(null)
    setFileError(null)
    setLoading(true)

    try {
      // Opcionális igazolás feltöltése a privát bucketbe (ha van)
      let documentPath: string | undefined
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'igazolas'
        const path = `requests/${crypto.randomUUID()}/${safeName}`
        const { error: upErr } = await supabase.storage
          .from('access-request-docs')
          .upload(path, file, { contentType: file.type, upsert: false })
        if (upErr) {
          setFileError('A dokumentum feltöltése nem sikerült: ' + upErr.message)
          setLoading(false)
          return
        }
        documentPath = path
      }

      const result = await completeOAuthProfile({ ...data, documentPath })
      if (result.error) {
        setServerError(result.error)
      } else if (result.success) {
        setSuccess(result.success)
        setTimeout(() => router.push('/login'), 2000)
      }
    } catch {
      setServerError('Ismeretlen hiba történt.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="text-center">
        <div className="mx-auto w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-3">
          <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <CardTitle className="text-xl font-bold">Kiegészítő adatok</CardTitle>
        <CardDescription>
          A regisztráció befejezéséhez kérjük, adja meg az alábbi adatokat.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
            {serverError}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm text-center">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="oc-name">Teljes név (Lelkipásztor) *</Label>
            <Input id="oc-name" placeholder="Pl. Nt. Kovács János" {...register('fullName')} />
            {errors.fullName && <p className="text-red-500 text-sm">{errors.fullName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oc-phone">Telefonszám *</Label>
            <Input id="oc-phone" type="tel" placeholder="+40 7..." {...register('phone')} />
            {errors.phone && <p className="text-red-500 text-sm">{errors.phone.message}</p>}
          </div>

          {/* Kért szerepkör */}
          <div className="space-y-1.5">
            <Label>Szerepkör *</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLES.map((r) => {
                const isActive = role === r.value
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => {
                      setRole(r.value)
                      setValue('requestedRole', r.value, { shouldValidate: true })
                    }}
                    className={`rounded-xl border-2 px-3 py-2 text-left transition ${
                      isActive
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${isActive ? 'text-foreground' : 'text-foreground/90'}`}>
                      {r.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{r.description}</p>
                  </button>
                )
              })}
            </div>
            {errors.requestedRole && <p className="text-red-500 text-sm">{errors.requestedRole.message}</p>}
          </div>

          {/* Egyházkerület — kötelező, DB-ből */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-district">Egyházkerület *</Label>
            <select
              id="oc-district"
              value={districtId}
              disabled={districts.length === 0}
              onChange={(e) => {
                const v = e.target.value
                setDistrictId(v)
                setDioceseId('')
                setCongregationId('')
                setValue('districtId', v, { shouldValidate: true })
                setValue('dioceseId', '', { shouldValidate: false })
                setValue('requestedCongregationId', '', { shouldValidate: false })
                setValue('congregation', '', { shouldValidate: false })
              }}
              className={SELECT_CLASS}
            >
              <option value="">— Válasszon —</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {errors.districtId && <p className="text-red-500 text-sm">{errors.districtId.message}</p>}
          </div>

          {/* Egyházmegye — kötelező, a választott egyházkerülethez szűrve */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-diocese">Egyházmegye *</Label>
            <select
              id="oc-diocese"
              value={dioceseId}
              disabled={!districtId}
              onChange={(e) => {
                const v = e.target.value
                setDioceseId(v)
                setCongregationId('')
                setValue('dioceseId', v, { shouldValidate: true })
                setValue('requestedCongregationId', '', { shouldValidate: false })
                setValue('congregation', '', { shouldValidate: false })
              }}
              className={SELECT_CLASS}
            >
              <option value="">
                {districtId ? '— Válasszon —' : 'Előbb válasszon egyházkerületet'}
              </option>
              {filteredDioceses.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {errors.dioceseId && <p className="text-red-500 text-sm">{errors.dioceseId.message}</p>}
          </div>

          {/* Egyházközség — kötelező, listából (a választott egyházmegyéhez szűrve) */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-cong">Egyházközség *</Label>
            <select
              id="oc-cong"
              value={congregationId}
              disabled={!dioceseId}
              onChange={(e) => {
                const v = e.target.value
                setCongregationId(v)
                const selected = congregations.find((c) => c.id === v)
                setValue('requestedCongregationId', v, { shouldValidate: true })
                setValue('congregation', selected?.name || '', { shouldValidate: true })
              }}
              className={SELECT_CLASS}
            >
              <option value="">
                {dioceseId ? '— Válasszon egyházközséget —' : 'Előbb válasszon egyházmegyét'}
              </option>
              {filteredCongregations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {dioceseId && filteredCongregations.length === 0 && (
              <p className="text-[11px] text-amber-600">
                Ehhez az egyházmegyéhez még nincs gyülekezet a listában. Kérjük, jelezze a
                rendszergazdának.
              </p>
            )}
            {(errors.requestedCongregationId || errors.congregation) && (
              <p className="text-red-500 text-sm">
                {errors.requestedCongregationId?.message || errors.congregation?.message}
              </p>
            )}
          </div>

          {refDataError && (
            <p className="text-red-500 text-sm">
              Az egyházkerület/egyházmegye/egyházközség lista betöltése nem sikerült. Kérjük, frissítse az oldalt.
            </p>
          )}

          {/* Rövid indoklás (opcionális) */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-justification">Rövid indoklás (opcionális)</Label>
            <Textarea
              id="oc-justification"
              rows={3}
              placeholder="Pl. A gyülekezet új lelkésze vagyok, a nyilvántartáshoz szeretnék hozzáférést."
              {...register('justification')}
            />
          </div>

          {/* Honnan hallott rólunk (opcionális) */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-referrer">Honnan hallott rólunk? (opcionális)</Label>
            <Input
              id="oc-referrer"
              placeholder="Pl. esperesi körlevél, kollégám ajánlása"
              {...register('referrer')}
            />
          </div>

          {/* Opcionális igazolás feltöltése */}
          <div className="space-y-1.5">
            <Label htmlFor="oc-document">Igazolás csatolása (opcionális)</Label>
            {file ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                  <Paperclip className="size-4 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">({Math.round(file.size / 1024)} KB)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Fájl eltávolítása"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <label
                htmlFor="oc-document"
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input bg-background px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5"
              >
                <FileUp className="size-4" />
                Kattintson a feltöltéshez — PDF, JPG vagy PNG (max 10 MB)
              </label>
            )}
            <input
              id="oc-document"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={handleFileChange}
              className="hidden"
            />
            {fileError && <p className="text-[11px] text-red-600">{fileError}</p>}
            <p className="text-[11px] text-muted-foreground">
              Pl. egyházmegyei vagy egyházkerületi igazolás a szolgálatáról — segíti a rendszergazda
              elbírálását.
            </p>
          </div>

          <div className="flex items-start gap-2 pt-1">
            <input type="checkbox" id="oc-terms" className="mt-1 shrink-0" {...register('termsAccepted')} />
            <label htmlFor="oc-terms" className="text-sm text-muted-foreground leading-relaxed">
              Elolvastam és elfogadom a{' '}
              <span className="text-primary font-semibold">
                Felhasználói Feltételeket és Adatvédelmi Tájékoztatót
              </span>
            </label>
          </div>
          {errors.termsAccepted && <p className="text-red-500 text-sm">{errors.termsAccepted.message}</p>}

          <Button type="submit" className="w-full font-semibold" disabled={loading || !!success}>
            {loading ? 'Feldolgozás...' : 'Regisztráció véglegesítése'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
