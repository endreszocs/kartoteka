'use client'

import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { oauthCompleteSchema, type OAuthCompleteInput } from '@/lib/validations/auth'
import { completeOAuthProfile } from '@/app/(auth)/oauth-complete/actions'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

interface OAuthCompleteFormProps {
  defaultName?: string
}

interface RefDistrict { id: string; name: string }
interface RefDiocese { id: string; name: string; district_id: string | null }

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
      districtId: '',
      dioceseId: '',
      termsAccepted: false as unknown as true,
    },
  })

  // ── Egyházkerület + egyházmegye (DB-ből, kötelező) ────────────────────────
  const supabase = useMemo(() => createClient(), [])
  const [districts, setDistricts] = useState<RefDistrict[]>([])
  const [dioceses, setDioceses] = useState<RefDiocese[]>([])
  const [districtId, setDistrictId] = useState('')
  const [dioceseId, setDioceseId] = useState('')
  const [refDataError, setRefDataError] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [districtRes, dioceseRes] = await Promise.all([
        supabase.from('districts').select('id, name').order('name'),
        supabase.from('dioceses').select('id, name, district_id').order('name'),
      ])
      if (!active) return
      if (districtRes.error || dioceseRes.error) {
        setRefDataError(true)
        return
      }
      setDistricts((districtRes.data as RefDistrict[]) ?? [])
      setDioceses((dioceseRes.data as RefDiocese[]) ?? [])
    })()
    return () => {
      active = false
    }
  }, [supabase])

  const filteredDioceses = useMemo(
    () => (districtId ? dioceses.filter((d) => d.district_id === districtId) : []),
    [districtId, dioceses],
  )

  async function onSubmit(data: OAuthCompleteInput) {
    setServerError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const result = await completeOAuthProfile(data)
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
                setValue('districtId', v, { shouldValidate: true })
                setValue('dioceseId', '', { shouldValidate: false })
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
                setValue('dioceseId', v, { shouldValidate: true })
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

          <div className="space-y-1.5">
            <Label htmlFor="oc-cong">Egyházközség *</Label>
            <Input id="oc-cong" placeholder="Pl. Siculeni" {...register('congregation')} />
            {errors.congregation && <p className="text-red-500 text-sm">{errors.congregation.message}</p>}
          </div>

          {refDataError && (
            <p className="text-red-500 text-sm">
              Az egyházkerület/egyházmegye lista betöltése nem sikerült. Kérjük, frissítse az oldalt.
            </p>
          )}

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
