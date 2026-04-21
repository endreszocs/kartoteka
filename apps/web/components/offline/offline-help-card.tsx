'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  HardDriveDownload,
  Info,
  RefreshCw,
} from 'lucide-react'

/**
 * Rövid, összecsukható súgó kártya az /offline oldal alján.
 * Magyarázza a working flow-t a lelkészeknek.
 */
export function OfflineHelpCard() {
  const [open, setOpen] = useState(false)

  return (
    <div className="card-raised overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 border-b border-transparent px-5 py-3 text-left transition hover:bg-indigo-50/30"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100">
          <Info className="h-4 w-4 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-base text-slate-800">
            Hogyan működik az offline mentés?
          </h3>
          <p className="text-xs text-slate-500">
            Gyors útmutató a KARTOTEKA offline-first rendszeréhez
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          <StepCard
            stepNumber={1}
            title="Adatok cachelése a saját gépedre"
            Icon={HardDriveDownload}
            tone="violet"
            description={
              <>
                A rendszer a Supabase-ről folyamatosan letölti a gyülekezetedhez
                tartozó adatokat és a böngésződ lokális IndexedDB tárolójában
                tartja. Ez ad lehetőséget arra, hogy <strong>internet nélkül
                is</strong> böngészhess közöttük — akár az utcán, egy családlátogatás
                alatt, vagy gyenge internettel.
              </>
            }
          />

          <StepCard
            stepNumber={2}
            title="Offline szerkesztés + automatikus szinkron"
            Icon={RefreshCw}
            tone="amber"
            description={
              <>
                Ha offline dolgozol, az új rekordok, módosítások, törlések egy
                lokális {'„várakozó sor”'}-ba kerülnek. Amikor újra internetre
                csatlakozol, a rendszer <strong>automatikusan feltölti</strong>{' '}
                ezeket a változtatásokat a Supabase-re. Ha közben valaki más is
                módosította ugyanazt az adatot, a rendszer <strong>konfliktus
                dialógot</strong> jelenít meg, és te döntesz arról, melyik verzió
                maradjon.
              </>
            }
          />

          <StepCard
            stepNumber={3}
            title="Excel fájlok a saját mappádban"
            Icon={FileSpreadsheet}
            tone="teal"
            description={
              <>
                Plusz biztosítékul a rendszer <strong>Excel fájlokba is</strong>{' '}
                elmenti az adataidat egy általad választott mappába (pl.{' '}
                <code>D:\Gyülekezet\KARTOTEKA-export</code>). Ezeket a fájlokat
                Excelben is megnyithatod, kinyomtathatod, archiválhatod — de{' '}
                <strong>NE tedd OneDrive, Dropbox vagy Google Drive mappába</strong>,
                mert azok a felhőbe szinkronizálnak (GDPR adatvédelmi kockázat).
              </>
            }
          />

          <StepCard
            stepNumber={4}
            title="Mindig kéznél a gyülekezeted adatai"
            Icon={CheckCircle2}
            tone="emerald"
            description={
              <>
                Ha esetleg a Supabase szolgáltatás átmenetileg nem elérhető, vagy
                az internet kiesik, továbbra is dolgozhatsz. A lokális cache és
                az Excel fájl <strong>együttesen</strong> garantálják, hogy az
                adataid mindig elérhetők legyenek — a rendszer csak szinkronizálja
                ezeket, nem {'„tulajdonosa”'} nekik.
              </>
            }
          />

          <div className="rounded-xl bg-slate-50/60 px-3 py-2 text-xs text-slate-600">
            💡 <strong>Tipp:</strong> A fenti KPI kártyák és a státusz chip a
            fejlécben mindig mutatják, hogy éppen milyen állapotban van a sync.
            Ha kérdésed van, fordulj a kerületi admin-hoz.
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Step kártya (info szekció)
// ─────────────────────────────────────────────────────────────────

type StepTone = 'violet' | 'amber' | 'teal' | 'emerald'

const STEP_TONE_STYLES: Record<StepTone, { bg: string; color: string; ring: string }> = {
  violet: { bg: 'bg-violet-50', color: 'text-violet-600', ring: 'ring-violet-200' },
  amber: { bg: 'bg-amber-50', color: 'text-amber-600', ring: 'ring-amber-200' },
  teal: { bg: 'bg-teal-50', color: 'text-teal-600', ring: 'ring-teal-200' },
  emerald: {
    bg: 'bg-emerald-50',
    color: 'text-emerald-600',
    ring: 'ring-emerald-200',
  },
}

function StepCard({
  stepNumber,
  title,
  Icon,
  tone,
  description,
}: {
  stepNumber: number
  title: string
  Icon: React.ComponentType<{ className?: string }>
  tone: StepTone
  description: React.ReactNode
}) {
  const styles = STEP_TONE_STYLES[tone]
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center gap-1.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.bg} ring-1 ${styles.ring}`}
        >
          <Icon className={`h-4 w-4 ${styles.color}`} />
        </div>
        <span className="text-[10px] font-semibold text-slate-400">
          {stepNumber}
        </span>
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          {description}
        </p>
      </div>
    </div>
  )
}
