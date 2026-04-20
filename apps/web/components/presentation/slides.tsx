'use client'

/**
 * Slide sablonok — éves beszámoló prezentációhoz.
 *
 * Minden slide egy self-contained React komponens, ami:
 *   - `data`: az összegyűjtött PresentationData
 *   - `title` / `subtitle` / `commentary`: a lelkész által szerkesztett szövegek
 *   - `projection`: ha true, nagyobb betűméret (vetítéshez)
 *
 * A slide-ok: sorrendben 1-12 (bővíthető).
 */

import type { ComponentType, ReactNode } from 'react'
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BookOpen,
  Building2,
  Cake,
  Coins,
  Heart,
  Sparkles,
  Sprout,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'

import type { PresentationData } from '@/app/(dashboard)/eves-jelentes/prezentacio/actions'
import { buildConclusions, buildForecast } from './analytics'
import { cn } from '@/lib/utils'
import {
  AnimatedBar,
  AnimatedNumber,
  GradientOrbs,
  MotionItem,
  ProgressRing,
  fadeUp,
  motion,
  popIn,
  scaleIn,
  slideStagger,
  slideStaggerFast,
} from './motion-primitives'

interface SlideProps {
  data: PresentationData
  title: string
  subtitle?: string
  commentary?: string
  projection?: boolean
}

export interface SlideDefinition {
  key: string
  defaultTitle: string
  defaultSubtitle?: string
  /** Dinamikus cím, ha a data-tól függ (pl. "Szőcs Endre 2026. évi beszámolója") */
  resolveTitle?: (data: PresentationData) => string
  resolveSubtitle?: (data: PresentationData) => string
  component: ComponentType<SlideProps>
}

// ──────────────────────────────────────────────────────────────
// Közös slide wrapper
// ──────────────────────────────────────────────────────────────

type OrbVariant = 'violet' | 'teal' | 'amber' | 'emerald' | 'rose' | 'sky'

function SlideFrame({
  children,
  className,
  projection,
  orbVariant = 'violet',
  backgroundClass,
}: {
  children: ReactNode
  className?: string
  projection?: boolean
  orbVariant?: OrbVariant
  /** Ha egyedi hátteret akarunk (pl. pillér-intro vagy záró slide) */
  backgroundClass?: string
}) {
  return (
    <motion.div
      variants={slideStagger}
      initial="hidden"
      animate="visible"
      className={cn(
        'relative h-full w-full overflow-hidden p-6 md:p-8',
        backgroundClass ?? 'bg-gradient-to-br from-slate-50 via-white to-violet-50/50',
        projection && 'p-10 md:p-14',
        className,
      )}
    >
      <GradientOrbs variant={orbVariant} />
      <div className="relative z-10 flex h-full w-full flex-col">{children}</div>
    </motion.div>
  )
}

function SlideHeader({
  title,
  subtitle,
  icon,
  projection,
  accentClass = 'from-violet-500 to-purple-600',
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  projection?: boolean
  accentClass?: string
}) {
  return (
    <MotionItem variants={fadeUp} className="mb-6 flex items-start gap-4">
      {icon && (
        <motion.div
          variants={popIn}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg',
            accentClass,
            projection ? 'size-14' : 'size-10',
          )}
        >
          {icon}
        </motion.div>
      )}
      <div>
        <h2
          className={cn(
            'font-heading font-bold text-slate-800',
            projection ? 'text-5xl leading-tight' : 'text-2xl md:text-3xl',
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={cn(
              'mt-1 text-slate-500',
              projection ? 'text-xl' : 'text-sm md:text-base',
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
    </MotionItem>
  )
}

function SlideCommentary({ commentary, projection }: { commentary?: string; projection?: boolean }) {
  if (!commentary) return null
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className={cn(
        'mt-auto border-l-4 border-violet-400 bg-violet-50/70 pl-4 py-3 italic text-violet-900 backdrop-blur-sm rounded-r-lg',
        projection ? 'text-xl leading-relaxed' : 'text-sm',
      )}
    >
      {commentary}
    </motion.div>
  )
}

// ──────────────────────────────────────────────────────────────
// 1. CÍM-SLIDE — Gyülekezet + év + logó
// ──────────────────────────────────────────────────────────────

function TitleSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  return (
    <SlideFrame
      projection={projection}
      className="flex flex-col items-center justify-center text-center"
      backgroundClass="bg-gradient-to-br from-violet-50 via-white to-amber-50/60"
      orbVariant="violet"
    >
      <motion.div variants={popIn}>
        {data.congregation.cimer_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.congregation.cimer_url}
            alt="Címer"
            className={cn('mb-6 rounded-2xl object-contain shadow-2xl ring-1 ring-white', projection ? 'size-40' : 'size-24')}
          />
        ) : (
          <div className={cn('mb-6 flex items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-2xl', projection ? 'size-40 text-6xl' : 'size-24 text-4xl')}>
            ✝
          </div>
        )}
      </motion.div>
      <MotionItem variants={fadeUp}>
        <p className={cn('font-semibold uppercase tracking-[0.28em] text-violet-600', projection ? 'text-base' : 'text-xs')}>
          Éves beszámoló
        </p>
      </MotionItem>
      <MotionItem variants={fadeUp}>
        <h1 className={cn('mt-3 font-heading font-bold text-slate-900 drop-shadow-sm', projection ? 'text-7xl' : 'text-4xl md:text-5xl')}>
          {title}
        </h1>
      </MotionItem>
      {subtitle && (
        <MotionItem variants={fadeUp}>
          <p className={cn('mt-4 text-slate-600', projection ? 'text-3xl' : 'text-lg')}>{subtitle}</p>
        </MotionItem>
      )}
      <MotionItem variants={fadeUp}>
        <motion.div
          className={cn('mx-auto mt-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-violet-400 to-transparent', projection ? 'w-64' : 'w-40')}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.8, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </MotionItem>
      {commentary && (
        <MotionItem variants={fadeUp}>
          <p className={cn('mt-8 italic text-violet-800', projection ? 'text-2xl' : 'text-base')}>
            &bdquo;{commentary}&rdquo;
          </p>
        </MotionItem>
      )}
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 2. ÁTTEKINTÉS — KPI-kártyák
// ──────────────────────────────────────────────────────────────

function OverviewSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const kpis: Array<{
    label: string
    value: number
    suffix?: string
    icon: ReactNode
    color: string
    orb: OrbVariant
  }> = [
    { label: 'Aktív tagok', value: data.members.totalActive, icon: <Users className="size-5" />, color: 'from-teal-500 to-cyan-600', orb: 'teal' },
    { label: 'Családok', value: data.members.families, icon: <Building2 className="size-5" />, color: 'from-emerald-500 to-teal-600', orb: 'emerald' },
    { label: `${data.year}. évi bevétel`, value: data.finance.totalIncome, suffix: ' RON', icon: <TrendingUp className="size-5" />, color: 'from-amber-500 to-orange-500', orb: 'amber' },
    { label: `${data.year}. évi kiadás`, value: data.finance.totalExpense, suffix: ' RON', icon: <TrendingDown className="size-5" />, color: 'from-rose-500 to-pink-600', orb: 'rose' },
  ]
  return (
    <SlideFrame projection={projection} orbVariant="violet">
      <SlideHeader title={title} subtitle={subtitle} icon={<Heart className="size-5" />} projection={projection} />
      <motion.div
        variants={slideStagger}
        className="grid flex-1 grid-cols-2 gap-4"
      >
        {kpis.map((k) => (
          <MotionItem
            key={k.label}
            variants={scaleIn}
            className="group flex flex-col justify-between overflow-hidden rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur transition-shadow hover:shadow-xl"
          >
            <motion.div
              variants={popIn}
              className={cn(
                'flex items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md transition-transform group-hover:scale-105',
                k.color,
                projection ? 'size-14' : 'size-11',
              )}
            >
              {k.icon}
            </motion.div>
            <div className="mt-3">
              <p className={cn('text-slate-500 font-medium uppercase tracking-wider', projection ? 'text-base' : 'text-xs')}>{k.label}</p>
              <p className={cn('mt-1 font-bold text-slate-900 tabular-nums', projection ? 'text-5xl' : 'text-2xl md:text-3xl')}>
                <AnimatedNumber value={k.value} />
                {k.suffix && <span className="ml-1 text-slate-500">{k.suffix}</span>}
              </p>
            </div>
          </MotionItem>
        ))}
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 3. GYÜLEKEZET ÖSSZETÉTELE — férfi/nő arány + pie chart
// ──────────────────────────────────────────────────────────────

function DemographicsSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const chartData = [
    { name: 'Férfi', value: data.members.male },
    { name: 'Nő', value: data.members.female },
  ]
  const COLORS = ['#3b82f6', '#ec4899']
  const total = data.members.totalActive || 1
  const malePct = Math.round((data.members.male / total) * 100)
  const femalePct = Math.round((data.members.female / total) * 100)
  return (
    <SlideFrame projection={projection} orbVariant="teal">
      <SlideHeader title={title} subtitle={subtitle} icon={<Users className="size-5" />} projection={projection} accentClass="from-teal-500 to-cyan-600" />
      <motion.div variants={slideStagger} className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <MotionItem variants={scaleIn} className="flex items-center justify-center rounded-2xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <ResponsiveContainer width="100%" height={projection ? 400 : 240}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={projection ? 150 : 90} label animationDuration={1200}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </MotionItem>
        <MotionItem variants={fadeUp} className="flex flex-col justify-center space-y-4 rounded-2xl bg-white/90 p-6 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <div className="space-y-1.5">
            <p className={cn('text-slate-500 uppercase tracking-wider', projection ? 'text-base' : 'text-xs')}>Összesen</p>
            <p className={cn('font-bold text-slate-900 tabular-nums', projection ? 'text-6xl' : 'text-4xl')}>
              <AnimatedNumber value={data.members.totalActive} /> <span className={cn('font-medium text-slate-400', projection ? 'text-3xl' : 'text-xl')}>fő</span>
            </p>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-blue-500 shadow-sm ring-2 ring-blue-200" />
                  <span className={cn('font-semibold text-slate-700', projection ? 'text-2xl' : 'text-base')}>
                    <AnimatedNumber value={data.members.male} /> férfi
                  </span>
                </div>
                <span className={cn('tabular-nums font-mono text-slate-500', projection ? 'text-lg' : 'text-xs')}>
                  {malePct}%
                </span>
              </div>
              <AnimatedBar percent={malePct} color="#3b82f6" heightClass={projection ? 'h-2.5' : 'h-1.5'} delay={0.2} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-pink-500 shadow-sm ring-2 ring-pink-200" />
                  <span className={cn('font-semibold text-slate-700', projection ? 'text-2xl' : 'text-base')}>
                    <AnimatedNumber value={data.members.female} /> nő
                  </span>
                </div>
                <span className={cn('tabular-nums font-mono text-slate-500', projection ? 'text-lg' : 'text-xs')}>
                  {femalePct}%
                </span>
              </div>
              <AnimatedBar percent={femalePct} color="#ec4899" heightClass={projection ? 'h-2.5' : 'h-1.5'} delay={0.35} />
            </div>
          </div>
        </MotionItem>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 4. KOR-ELOSZLÁS — oszlopdiagram
// ──────────────────────────────────────────────────────────────

function AgeDistributionSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  return (
    <SlideFrame projection={projection} orbVariant="sky">
      <SlideHeader title={title} subtitle={subtitle} icon={<Cake className="size-5" />} projection={projection} accentClass="from-sky-500 to-indigo-600" />
      <MotionItem variants={scaleIn} className="flex-1 rounded-2xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
        <ResponsiveContainer width="100%" height={projection ? 500 : 320}>
          <BarChart data={data.members.ageGroups}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} animationDuration={1200} animationBegin={300} />
          </BarChart>
        </ResponsiveContainer>
      </MotionItem>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 5. ANYAKÖNYV — keresztelő, konfirmáció, esketés, temetés
// ──────────────────────────────────────────────────────────────

function AnyakonyvSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const items = [
    { label: 'Keresztelések', value: data.anyakonyv.keresztelo, color: 'from-sky-400 to-blue-500', icon: <Sprout className="size-6" /> },
    { label: 'Konfirmációk', value: data.anyakonyv.konfirmacio, color: 'from-emerald-400 to-teal-500', icon: <BookOpen className="size-6" /> },
    { label: 'Esketések', value: data.anyakonyv.esketes, color: 'from-pink-400 to-rose-500', icon: <Heart className="size-6" /> },
    { label: 'Temetések', value: data.anyakonyv.temetes, color: 'from-slate-400 to-slate-600', icon: <span>🕊️</span> },
  ]
  return (
    <SlideFrame projection={projection} orbVariant="sky">
      <SlideHeader title={title} subtitle={subtitle} icon={<BookOpen className="size-5" />} projection={projection} accentClass="from-sky-500 to-blue-600" />
      <motion.div variants={slideStagger} className="grid flex-1 grid-cols-2 gap-4">
        {items.map((it) => (
          <MotionItem key={it.label} variants={scaleIn} className="flex flex-col justify-between overflow-hidden rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
            <motion.div
              variants={popIn}
              className={cn(
                'flex items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md',
                it.color,
                projection ? 'size-14' : 'size-11',
              )}
            >
              {it.icon}
            </motion.div>
            <div className="mt-2">
              <p className={cn('text-slate-500 uppercase tracking-wider', projection ? 'text-base' : 'text-xs')}>{it.label}</p>
              <p className={cn('font-bold text-slate-900 tabular-nums', projection ? 'text-6xl' : 'text-4xl')}>
                <AnimatedNumber value={it.value} />
              </p>
            </div>
          </MotionItem>
        ))}
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 6. ANYAKÖNYV TÖRTÉNETI — évenként
// ──────────────────────────────────────────────────────────────

function AnyakonyvHistorySlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  return (
    <SlideFrame projection={projection} orbVariant="sky">
      <SlideHeader title={title} subtitle={subtitle} icon={<BookOpen className="size-5" />} projection={projection} accentClass="from-sky-500 to-blue-600" />
      <MotionItem variants={scaleIn} className="flex-1 rounded-2xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
        <ResponsiveContainer width="100%" height={projection ? 500 : 320}>
          <BarChart data={data.anyakonyv.byYear}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Bar dataKey="keresztelo" name="Keresztelések" fill="#3b82f6" animationDuration={1200} animationBegin={200} />
            <Bar dataKey="konfirmacio" name="Konfirmációk" fill="#10b981" animationDuration={1200} animationBegin={350} />
            <Bar dataKey="esketes" name="Esketések" fill="#ec4899" animationDuration={1200} animationBegin={500} />
            <Bar dataKey="temetes" name="Temetések" fill="#64748b" animationDuration={1200} animationBegin={650} />
          </BarChart>
        </ResponsiveContainer>
      </MotionItem>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 7. SZÁMADÁS — éves pénzügyi áttekintés (összegzés)
// ──────────────────────────────────────────────────────────────

/**
 * A SZÁMADÁS slide: 4 fő KPI (bevétel, kiadás, különbség, tranzakciók)
 * + összefoglaló info-kártyák. A lelkészi éves beszámoló "címlapja" a
 * pénzügyi rész elején.
 */
function FinanceSummarySlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const { totalIncome, totalExpense, surplus } = data.finance
  const incomeItems = data.finance.incomeByCategory.length
  const expenseItems = data.finance.expenseByCategory.length
  const isPositive = surplus >= 0
  const ronFormatter = (n: number) => n.toLocaleString('hu', { maximumFractionDigits: 0 })
  return (
    <SlideFrame projection={projection} orbVariant="amber">
      <SlideHeader title={title} subtitle={subtitle} icon={<Coins className="size-5" />} projection={projection} accentClass="from-amber-500 to-orange-500" />
      <motion.div variants={slideStagger} className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        {/* Bevétel kártya */}
        <MotionItem variants={scaleIn} className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-lg ring-1 ring-emerald-200/70 backdrop-blur">
          <div className="flex items-center gap-2">
            <motion.div variants={popIn} className={cn('flex items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md', projection ? 'size-14' : 'size-11')}>
              <TrendingUp className={projection ? 'size-6' : 'size-5'} />
            </motion.div>
            <div>
              <p className={cn('font-semibold uppercase tracking-wider text-emerald-700/80', projection ? 'text-sm' : 'text-xs')}>Bevételek {data.year}</p>
              <p className={cn('text-emerald-800/60', projection ? 'text-sm' : 'text-xs')}>
                <AnimatedNumber value={incomeItems} /> tétel-csoport
              </p>
            </div>
          </div>
          <div>
            <p className={cn('font-bold text-emerald-900 tabular-nums', projection ? 'text-6xl' : 'text-4xl')}>
              <AnimatedNumber value={totalIncome} formatter={ronFormatter} />
            </p>
            <p className={cn('mt-1 text-emerald-700/70', projection ? 'text-xl' : 'text-sm')}>RON</p>
          </div>
        </MotionItem>

        {/* Kiadás kártya */}
        <MotionItem variants={scaleIn} className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50 p-5 shadow-lg ring-1 ring-rose-200/70 backdrop-blur">
          <div className="flex items-center gap-2">
            <motion.div variants={popIn} className={cn('flex items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-md', projection ? 'size-14' : 'size-11')}>
              <TrendingDown className={projection ? 'size-6' : 'size-5'} />
            </motion.div>
            <div>
              <p className={cn('font-semibold uppercase tracking-wider text-rose-700/80', projection ? 'text-sm' : 'text-xs')}>Kiadások {data.year}</p>
              <p className={cn('text-rose-800/60', projection ? 'text-sm' : 'text-xs')}>
                <AnimatedNumber value={expenseItems} /> tétel-csoport
              </p>
            </div>
          </div>
          <div>
            <p className={cn('font-bold text-rose-900 tabular-nums', projection ? 'text-6xl' : 'text-4xl')}>
              <AnimatedNumber value={totalExpense} formatter={ronFormatter} />
            </p>
            <p className={cn('mt-1 text-rose-700/70', projection ? 'text-xl' : 'text-sm')}>RON</p>
          </div>
        </MotionItem>

        {/* Egyenleg / különbség kártya — egész szélességben */}
        <MotionItem variants={fadeUp} className={cn(
          'md:col-span-2 flex items-center justify-between rounded-2xl p-5 shadow-lg ring-1 backdrop-blur',
          isPositive
            ? 'bg-gradient-to-r from-emerald-50 via-teal-50 to-white ring-emerald-200'
            : 'bg-gradient-to-r from-amber-50 via-orange-50 to-white ring-amber-200',
        )}>
          <div>
            <p className={cn('font-semibold uppercase tracking-wider', isPositive ? 'text-emerald-700/80' : 'text-amber-700/80', projection ? 'text-sm' : 'text-xs')}>
              Év pénzügyi mozgása
            </p>
            <p className={cn('mt-2 font-bold tabular-nums', isPositive ? 'text-emerald-900' : 'text-amber-900', projection ? 'text-5xl' : 'text-3xl')}>
              <AnimatedNumber value={surplus} formatter={ronFormatter} showPlus={isPositive} /> RON
            </p>
            <p className={cn('mt-1 font-medium', isPositive ? 'text-emerald-700' : 'text-amber-700', projection ? 'text-lg' : 'text-sm')}>
              {isPositive
                ? 'Az év pozitív mozgással zárult — a bevétel meghaladta a kiadást.'
                : 'Az év kiadásai meghaladták a bevételeket — a hiány a tartalékból fedezve.'}
            </p>
          </div>
          <motion.div
            variants={popIn}
            animate={{ y: [0, -4, 0] }}
            transition={{ y: { duration: 3, repeat: Infinity, ease: 'easeInOut' }, delay: 0.6 }}
            className={cn(
              'hidden shrink-0 items-center justify-center rounded-full text-white shadow-lg md:flex',
              isPositive ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-amber-500 to-orange-500',
              projection ? 'size-24 text-5xl' : 'size-16 text-3xl',
            )}
          >
            {isPositive ? '↗' : '↘'}
          </motion.div>
        </MotionItem>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 8. BEVÉTELEK RÉSZLETESEN — minden tétel horizontális bar
// ──────────────────────────────────────────────────────────────

/**
 * A SZÁMADÁS PDF mintája alapján: minden bevétel-tétel egy-egy sorban,
 * horizontális bar-ral és pontosított összeggel. A lista a legnagyobbtól
 * a legkisebbig rendezve. Kompakt layout: sok tétel elfér A4-en is.
 */
function IncomeDetailSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const items = data.finance.incomeByCategory
  const maxAmount = Math.max(...items.map((i) => i.amount), 1)
  const COLORS = ['#10b981', '#14b8a6', '#06b6d4', '#8b5cf6', '#a855f7', '#ec4899', '#f59e0b', '#f97316', '#84cc16', '#22c55e', '#64748b', '#3b82f6']
  const totalIncome = data.finance.totalIncome
  const ronFormatter = (n: number) => n.toLocaleString('hu', { maximumFractionDigits: 0 })

  // Ha nincs tétel: friendly üres állapot
  if (items.length === 0) {
    return (
      <SlideFrame projection={projection} orbVariant="emerald" className="items-center justify-center">
        <SlideHeader title={title} subtitle={subtitle} icon={<TrendingUp className="size-5" />} projection={projection} accentClass="from-emerald-500 to-teal-600" />
        <p className="text-center text-slate-500">Nincs rögzített bevétel erre az évre.</p>
      </SlideFrame>
    )
  }

  return (
    <SlideFrame projection={projection} orbVariant="emerald">
      <MotionItem variants={fadeUp} className="mb-4 flex items-end justify-between gap-4 border-b-2 border-emerald-200/80 pb-3">
        <div className="flex items-center gap-3">
          <motion.div variants={popIn} className={cn('flex items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg', projection ? 'size-14' : 'size-11')}>
            <TrendingUp className={projection ? 'size-6' : 'size-5'} />
          </motion.div>
          <div>
            <h2 className={cn('font-heading font-bold text-slate-800', projection ? 'text-4xl' : 'text-2xl md:text-3xl')}>
              {title}
            </h2>
            {subtitle && <p className={cn('text-slate-500', projection ? 'text-lg' : 'text-sm')}>{subtitle}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className={cn('font-semibold uppercase tracking-wider text-emerald-700/70', projection ? 'text-sm' : 'text-xs')}>
            Bevételek {data.year}
          </p>
          <p className={cn('font-bold text-emerald-900 tabular-nums', projection ? 'text-4xl' : 'text-2xl')}>
            <AnimatedNumber value={totalIncome} formatter={ronFormatter} /> <span className="text-emerald-700/70">RON</span>
          </p>
        </div>
      </MotionItem>

      {/* Részletes tétel-lista animált bar-okkal */}
      <motion.div variants={slideStaggerFast} className="flex-1 overflow-y-auto pr-2">
        <div className="space-y-1.5">
          {items.map((item, i) => {
            const pct = (item.amount / maxAmount) * 100
            const color = COLORS[i % COLORS.length]
            return (
              <MotionItem key={item.name} variants={fadeUp} className="flex items-center gap-3">
                <div className={cn('min-w-0 flex-shrink-0 truncate text-right font-medium text-slate-700', projection ? 'w-[28%] text-base' : 'w-[30%] text-xs')}>
                  {item.name}
                </div>
                <div className="relative flex-1">
                  <AnimatedBar
                    percent={pct}
                    color={color}
                    delay={0.2 + i * 0.04}
                    heightClass={projection ? 'h-7' : 'h-5'}
                  />
                </div>
                <div className={cn('flex-shrink-0 text-right font-mono font-semibold text-slate-900 tabular-nums', projection ? 'w-36 text-base' : 'w-28 text-xs')}>
                  {item.amount.toLocaleString('hu', { maximumFractionDigits: 2 })}
                </div>
              </MotionItem>
            )
          })}
        </div>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 9. KIADÁSOK RÉSZLETESEN — minden tétel horizontális bar
// ──────────────────────────────────────────────────────────────

function ExpenseDetailSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const items = data.finance.expenseByCategory
  const maxAmount = Math.max(...items.map((i) => i.amount), 1)
  const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
  const totalExpense = data.finance.totalExpense
  const ronFormatter = (n: number) => n.toLocaleString('hu', { maximumFractionDigits: 0 })

  if (items.length === 0) {
    return (
      <SlideFrame projection={projection} orbVariant="rose" className="items-center justify-center">
        <SlideHeader title={title} subtitle={subtitle} icon={<TrendingDown className="size-5" />} projection={projection} accentClass="from-rose-500 to-orange-500" />
        <p className="text-center text-slate-500">Nincs rögzített kiadás erre az évre.</p>
      </SlideFrame>
    )
  }

  return (
    <SlideFrame projection={projection} orbVariant="rose">
      <MotionItem variants={fadeUp} className="mb-4 flex items-end justify-between gap-4 border-b-2 border-rose-200/80 pb-3">
        <div className="flex items-center gap-3">
          <motion.div variants={popIn} className={cn('flex items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg', projection ? 'size-14' : 'size-11')}>
            <TrendingDown className={projection ? 'size-6' : 'size-5'} />
          </motion.div>
          <div>
            <h2 className={cn('font-heading font-bold text-slate-800', projection ? 'text-4xl' : 'text-2xl md:text-3xl')}>
              {title}
            </h2>
            {subtitle && <p className={cn('text-slate-500', projection ? 'text-lg' : 'text-sm')}>{subtitle}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className={cn('font-semibold uppercase tracking-wider text-rose-700/70', projection ? 'text-sm' : 'text-xs')}>
            Kiadások {data.year}
          </p>
          <p className={cn('font-bold text-rose-900 tabular-nums', projection ? 'text-4xl' : 'text-2xl')}>
            <AnimatedNumber value={totalExpense} formatter={ronFormatter} /> <span className="text-rose-700/70">RON</span>
          </p>
        </div>
      </MotionItem>

      <motion.div variants={slideStaggerFast} className="flex-1 overflow-y-auto pr-2">
        <div className="space-y-1.5">
          {items.map((item, i) => {
            const pct = (item.amount / maxAmount) * 100
            const color = COLORS[i % COLORS.length]
            return (
              <MotionItem key={item.name} variants={fadeUp} className="flex items-center gap-3">
                <div className={cn('min-w-0 flex-shrink-0 truncate text-right font-medium text-slate-700', projection ? 'w-[28%] text-base' : 'w-[30%] text-xs')}>
                  {item.name}
                </div>
                <div className="relative flex-1">
                  <AnimatedBar
                    percent={pct}
                    color={color}
                    delay={0.2 + i * 0.04}
                    heightClass={projection ? 'h-7' : 'h-5'}
                  />
                </div>
                <div className={cn('flex-shrink-0 text-right font-mono font-semibold text-slate-900 tabular-nums', projection ? 'w-36 text-base' : 'w-28 text-xs')}>
                  {item.amount.toLocaleString('hu', { maximumFractionDigits: 2 })}
                </div>
              </MotionItem>
            )
          })}
        </div>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 10. PÉNZÜGYI TREND — 5 éves line chart (a régi FinanceOverview)
// ──────────────────────────────────────────────────────────────

function FinanceTrendSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  return (
    <SlideFrame projection={projection} orbVariant="amber">
      <SlideHeader title={title} subtitle={subtitle} icon={<Coins className="size-5" />} projection={projection} accentClass="from-amber-500 to-orange-500" />
      <MotionItem variants={scaleIn} className="flex-1 rounded-2xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
        <ResponsiveContainer width="100%" height={projection ? 500 : 320}>
          <LineChart data={data.finance.byYear}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip formatter={(v) => (typeof v === 'number' ? `${v.toLocaleString('hu')} RON` : String(v))} />
            <Legend />
            <Line type="monotone" dataKey="income" name="Bevétel" stroke="#10b981" strokeWidth={3} animationDuration={1500} animationBegin={200} />
            <Line type="monotone" dataKey="expense" name="Kiadás" stroke="#ef4444" strokeWidth={3} animationDuration={1500} animationBegin={500} />
          </LineChart>
        </ResponsiveContainer>
      </MotionItem>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 10. EGYHÁZFENNTARTÁS TELJESÍTÉS
// ──────────────────────────────────────────────────────────────

function EgyhazfenntartasSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const rate = Math.round(data.finance.egyhazfenntartas.paymentRate)
  const ringColor = rate > 70 ? '#10b981' : rate > 40 ? '#f59e0b' : '#ef4444'
  const ringBg = rate > 70 ? 'from-emerald-500 to-teal-600' : rate > 40 ? 'from-amber-500 to-orange-500' : 'from-rose-500 to-red-600'
  return (
    <SlideFrame projection={projection} orbVariant="amber">
      <SlideHeader title={title} subtitle={subtitle} icon={<Coins className="size-5" />} projection={projection} accentClass={ringBg} />
      <motion.div variants={slideStagger} className="grid flex-1 grid-cols-1 items-stretch gap-4 md:grid-cols-[1fr_1.3fr]">
        {/* Bal: nagy kör-diagram */}
        <MotionItem variants={scaleIn} className="flex flex-col items-center justify-center rounded-2xl bg-white/90 p-6 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <ProgressRing
            percent={rate}
            size={projection ? 280 : 180}
            strokeWidth={projection ? 22 : 14}
            color={ringColor}
          >
            <div className="text-center">
              <p className={cn('font-bold tabular-nums text-slate-900', projection ? 'text-7xl' : 'text-5xl')}>
                <AnimatedNumber value={rate} />
                <span className={cn('ml-0.5 text-slate-500', projection ? 'text-4xl' : 'text-2xl')}>%</span>
              </p>
              <p className={cn('mt-1 font-medium uppercase tracking-wider text-slate-500', projection ? 'text-base' : 'text-xs')}>
                Teljesítés
              </p>
            </div>
          </ProgressRing>
        </MotionItem>

        {/* Jobb: két KPI egymás alatt */}
        <div className="grid grid-rows-2 gap-4">
          <KpiBlock
            label="Aktív tagok"
            value={data.finance.egyhazfenntartas.activeMembers}
            color="from-blue-500 to-indigo-600"
            projection={projection}
          />
          <KpiBlock
            label="Fizetett tagok"
            value={data.finance.egyhazfenntartas.paidMembers}
            color="from-emerald-500 to-teal-600"
            projection={projection}
          />
        </div>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

function KpiBlock({
  label,
  value,
  color,
  projection,
  suffix,
}: {
  label: string
  value: number | string
  color: string
  projection?: boolean
  suffix?: string
}) {
  return (
    <MotionItem variants={scaleIn} className="flex flex-col justify-between rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
      <div className={cn('h-1.5 w-16 rounded-full bg-gradient-to-r', color)} />
      <div className="mt-auto">
        <p className={cn('text-slate-500 uppercase tracking-wider', projection ? 'text-base' : 'text-xs')}>{label}</p>
        <p className={cn('font-bold text-slate-900 tabular-nums', projection ? 'text-6xl' : 'text-4xl')}>
          {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
          {suffix && <span className="ml-1 text-slate-500">{suffix}</span>}
        </p>
      </div>
    </MotionItem>
  )
}

// ──────────────────────────────────────────────────────────────
// 11. PROGRAMOK
// ──────────────────────────────────────────────────────────────

function ProgramsSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const rate = Math.round(data.programs.completionRate)
  return (
    <SlideFrame projection={projection} orbVariant="violet">
      <SlideHeader title={title} subtitle={subtitle} icon={<Heart className="size-5" />} projection={projection} accentClass="from-violet-500 to-purple-600" />
      <motion.div variants={slideStagger} className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="grid grid-cols-1 gap-3">
          <KpiBlock label="Összes program" value={data.programs.total} color="from-violet-500 to-purple-600" projection={projection} />
          <KpiBlock label="Teljesített" value={data.programs.completed} color="from-emerald-500 to-teal-600" projection={projection} />
          <KpiBlock label="Arány" value={rate} suffix="%" color="from-amber-500 to-orange-500" projection={projection} />
        </div>
        <MotionItem variants={scaleIn} className="rounded-2xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <h4 className={cn('mb-2 font-semibold text-slate-700', projection ? 'text-xl' : 'text-sm')}>Típus szerint</h4>
          <ResponsiveContainer width="100%" height={projection ? 420 : 260}>
            <BarChart data={data.programs.byType} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" stroke="#64748b" />
              <YAxis type="category" dataKey="type" stroke="#64748b" width={projection ? 140 : 90} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 8, 8, 0]} animationDuration={1200} animationBegin={300} />
            </BarChart>
          </ResponsiveContainer>
        </MotionItem>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// 12. ZÁRÓ SLIDE — köszönet + ige
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// PILLÉR-BEVEZETŐ — a 3 pillér elé nyitó slide (2026-04-21r)
// ──────────────────────────────────────────────────────────────

/**
 * 3 pillér rendszer a PDF-minta alapján:
 *   1. Lélekszámbeli — Hányan vagyunk?
 *   2. Lelki — Hogyan vagyunk jelen?
 *   3. Anyagi — Miből gazdálkodunk?
 */
interface PillarIntroSlideProps extends SlideProps {
  pillarNumber: number
  pillarName: string
  question: string
  color: 'teal' | 'violet' | 'amber'
}

function PillarIntroSlide({ title, subtitle, commentary, projection, pillarNumber, pillarName, question, color }: PillarIntroSlideProps) {
  const colorMap = {
    teal: { bg: 'from-teal-100/80 via-white to-emerald-100/80', text: 'text-teal-800', number: 'from-teal-500 to-emerald-600', accent: 'text-emerald-700', orb: 'teal' as OrbVariant },
    violet: { bg: 'from-violet-100/80 via-white to-purple-100/80', text: 'text-violet-800', number: 'from-violet-500 to-purple-600', accent: 'text-violet-700', orb: 'violet' as OrbVariant },
    amber: { bg: 'from-amber-100/80 via-white to-orange-100/80', text: 'text-amber-800', number: 'from-amber-500 to-orange-500', accent: 'text-amber-700', orb: 'amber' as OrbVariant },
  }
  const c = colorMap[color]
  return (
    <SlideFrame
      projection={projection}
      className="items-center justify-center text-center"
      backgroundClass={`bg-gradient-to-br ${c.bg}`}
      orbVariant={c.orb}
    >
      <MotionItem variants={fadeUp}>
        <p className={cn('font-semibold uppercase tracking-[0.3em]', c.accent, projection ? 'text-base' : 'text-xs')}>
          {pillarNumber}. pillér
        </p>
      </MotionItem>
      <motion.div
        variants={popIn}
        whileHover={{ scale: 1.05, rotate: 3 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className={cn(
          'mt-4 flex items-center justify-center rounded-3xl bg-gradient-to-br text-white shadow-2xl ring-4 ring-white/70',
          c.number,
          projection ? 'size-40 text-8xl' : 'size-24 text-5xl',
        )}
      >
        {pillarNumber}
      </motion.div>
      <MotionItem variants={fadeUp}>
        <h1 className={cn('mt-8 font-heading font-bold drop-shadow-sm', c.text, projection ? 'text-8xl' : 'text-5xl md:text-6xl')}>
          {pillarName}
        </h1>
      </MotionItem>
      <MotionItem variants={fadeUp}>
        <p className={cn('mt-6 font-semibold', c.accent, projection ? 'text-4xl' : 'text-2xl')}>
          {question}
        </p>
      </MotionItem>
      <MotionItem variants={fadeUp}>
        <motion.div
          className={cn('mx-auto mt-6 h-0.5 rounded-full bg-gradient-to-r from-transparent via-current to-transparent opacity-40', c.accent, projection ? 'w-64' : 'w-40')}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.9, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </MotionItem>
      {(subtitle || title !== pillarName) && (
        <MotionItem variants={fadeUp}>
          <p className={cn('mt-4 italic text-slate-600', projection ? 'text-2xl' : 'text-base')}>
            {subtitle || title}
          </p>
        </MotionItem>
      )}
      {commentary && (
        <MotionItem variants={fadeUp}>
          <p className={cn('mt-8 max-w-2xl italic text-slate-700', projection ? 'text-2xl' : 'text-base')}>
            &bdquo;{commentary}&rdquo;
          </p>
        </MotionItem>
      )}
    </SlideFrame>
  )
}

// Wrapper-ek a 3 pillér-bevezetőhöz
function Pillar1IntroSlide(props: SlideProps) {
  return <PillarIntroSlide {...props} pillarNumber={1} pillarName="Lélekszámbeli" question="Hányan vagyunk?" color="teal" />
}
function Pillar2IntroSlide(props: SlideProps) {
  return <PillarIntroSlide {...props} pillarNumber={2} pillarName="Lelki" question="Hogyan vagyunk jelen?" color="violet" />
}
function Pillar3IntroSlide(props: SlideProps) {
  return <PillarIntroSlide {...props} pillarNumber={3} pillarName="Anyagi" question="Miből gazdálkodunk?" color="amber" />
}

// ──────────────────────────────────────────────────────────────
// NÉV-LISTA SLIDE-OK — keresztelések, konfirmációk, esketések, temetések
// (a SZÁMADÁS PDF mintája alapján, 2026-04-21r)
// ──────────────────────────────────────────────────────────────

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const months = ['jan', 'feb', 'márc', 'ápr', 'máj', 'jún', 'júl', 'aug', 'szept', 'okt', 'nov', 'dec']
  return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]}`
}

function formatYearOnly(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return String(d.getFullYear())
}

function BaptismsListSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const items = data.anyakonyv.nameLists.keresztelesek
  const boys = items.filter((i) => i.isMale === true).length
  const girls = items.filter((i) => i.isMale === false).length
  return (
    <SlideFrame projection={projection} orbVariant="sky">
      <SlideHeader
        title={title}
        subtitle={subtitle || `${boys} fiú, ${girls} lány — összesen ${items.length}`}
        icon={<span className="text-xl">🕊️</span>}
        projection={projection}
        accentClass="from-sky-400 to-blue-500"
      />
      {items.length === 0 ? (
        <MotionItem variants={scaleIn} className="flex flex-1 items-center justify-center rounded-2xl bg-white/90 p-8 text-slate-400 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <p className={projection ? 'text-xl' : 'text-base'}>Ebben az évben nem volt keresztelés.</p>
        </MotionItem>
      ) : (
        <MotionItem variants={scaleIn} className="flex-1 overflow-y-auto rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <motion.div variants={slideStaggerFast} className={cn('grid gap-2', items.length > 10 ? 'grid-cols-2' : 'grid-cols-1')}>
            {items.map((item, i) => (
              <MotionItem key={i} variants={fadeUp} className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-b-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate font-medium text-slate-800', projection ? 'text-lg' : 'text-sm')}>
                    {item.name}
                    {item.isMale === true && <span className="ml-2 text-xs text-blue-500">♂</span>}
                    {item.isMale === false && <span className="ml-2 text-xs text-pink-500">♀</span>}
                  </div>
                </div>
                <div className={cn('flex-shrink-0 font-mono text-slate-500', projection ? 'text-base' : 'text-xs')}>
                  {formatDateShort(item.date)}
                </div>
              </MotionItem>
            ))}
          </motion.div>
        </MotionItem>
      )}
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

function ConfirmationsListSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const items = data.anyakonyv.nameLists.konfirmaciok
  return (
    <SlideFrame projection={projection} orbVariant="emerald">
      <SlideHeader
        title={title}
        subtitle={subtitle || `${items.length} konfirmandus`}
        icon={<BookOpen className="size-5" />}
        projection={projection}
        accentClass="from-emerald-500 to-teal-600"
      />
      {items.length === 0 ? (
        <MotionItem variants={scaleIn} className="flex flex-1 items-center justify-center rounded-2xl bg-white/90 p-8 text-slate-400 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <p className={projection ? 'text-xl' : 'text-base'}>Ebben az évben nem volt konfirmáció.</p>
        </MotionItem>
      ) : (
        <MotionItem variants={scaleIn} className="flex-1 overflow-y-auto rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <motion.div variants={slideStaggerFast} className={cn('grid gap-2', items.length > 10 ? 'grid-cols-2' : 'grid-cols-1')}>
            {items.map((item, i) => (
              <MotionItem key={i} variants={fadeUp} className="flex items-center gap-3 border-b border-slate-100 pb-2 last:border-b-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate font-medium text-slate-800', projection ? 'text-lg' : 'text-sm')}>
                    {item.name}
                    {item.isMale === true && <span className="ml-2 text-xs text-blue-500">♂</span>}
                    {item.isMale === false && <span className="ml-2 text-xs text-pink-500">♀</span>}
                  </div>
                </div>
                <div className={cn('flex-shrink-0 font-mono text-slate-500', projection ? 'text-base' : 'text-xs')}>
                  {formatDateShort(item.date)}
                </div>
              </MotionItem>
            ))}
          </motion.div>
        </MotionItem>
      )}
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

function MarriagesListSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const items = data.anyakonyv.nameLists.esketesek
  return (
    <SlideFrame projection={projection} orbVariant="rose">
      <SlideHeader
        title={title}
        subtitle={subtitle || `${items.length} házaspár`}
        icon={<Heart className="size-5" />}
        projection={projection}
        accentClass="from-pink-500 to-rose-600"
      />
      {items.length === 0 ? (
        <MotionItem variants={scaleIn} className="flex flex-1 items-center justify-center rounded-2xl bg-white/90 p-8 text-slate-400 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <p className={projection ? 'text-xl' : 'text-base'}>Ebben az évben nem volt esketés.</p>
        </MotionItem>
      ) : (
        <MotionItem variants={scaleIn} className="flex-1 overflow-y-auto rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <motion.div variants={slideStaggerFast} className="space-y-2">
            {items.map((item, i) => (
              <MotionItem key={i} variants={fadeUp} className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-3 border-b border-slate-100 pb-2 last:border-b-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className={cn('truncate font-medium text-slate-800', projection ? 'text-lg' : 'text-sm')}>
                    {item.ferfiName} <span className="text-xs text-blue-500">♂</span>
                  </div>
                </div>
                <motion.span
                  className="text-2xl text-rose-400"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.1 }}
                >
                  ♡
                </motion.span>
                <div className="min-w-0">
                  <div className={cn('truncate font-medium text-slate-800', projection ? 'text-lg' : 'text-sm')}>
                    {item.noName} <span className="text-xs text-pink-500">♀</span>
                  </div>
                </div>
                <div className={cn('flex-shrink-0 font-mono text-slate-500', projection ? 'text-base' : 'text-xs')}>
                  {formatDateShort(item.date)}
                </div>
              </MotionItem>
            ))}
          </motion.div>
        </MotionItem>
      )}
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

function FuneralsListSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const items = data.anyakonyv.nameLists.temetesek
  const men = items.filter((i) => i.isMale === true).length
  const women = items.filter((i) => i.isMale === false).length
  return (
    <SlideFrame projection={projection} orbVariant="sky">
      <SlideHeader
        title={title}
        subtitle={subtitle || `${men} férfi, ${women} nő — összesen ${items.length}`}
        icon={<span className="text-xl">🕊️</span>}
        projection={projection}
        accentClass="from-slate-500 to-slate-700"
      />
      {items.length === 0 ? (
        <MotionItem variants={scaleIn} className="flex flex-1 items-center justify-center rounded-2xl bg-white/90 p-8 text-slate-400 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <p className={projection ? 'text-xl' : 'text-base'}>Ebben az évben nem volt temetés.</p>
        </MotionItem>
      ) : (
        <MotionItem variants={scaleIn} className="flex-1 overflow-y-auto rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <motion.div variants={slideStaggerFast} className={cn('grid gap-2', items.length > 8 ? 'grid-cols-2' : 'grid-cols-1')}>
            {items.map((item, i) => (
              <MotionItem key={i} variants={fadeUp} className="flex items-start gap-3 border-b border-slate-100 pb-2 last:border-b-0">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate font-medium text-slate-800', projection ? 'text-base' : 'text-sm')}>
                    {item.name}
                    {item.isMale === true && <span className="ml-2 text-xs text-blue-500">♂</span>}
                    {item.isMale === false && <span className="ml-2 text-xs text-pink-500">♀</span>}
                  </div>
                  <div className={cn('mt-0.5 text-slate-500', projection ? 'text-sm' : 'text-xs')}>
                    {item.ageAtDeath !== null && <>{item.ageAtDeath} éves · </>}
                    {item.halalDate && <>Halál: {formatYearOnly(item.halalDate)} · </>}
                    Temetés: {formatDateShort(item.temetesDate)}
                  </div>
                </div>
              </MotionItem>
            ))}
          </motion.div>
        </MotionItem>
      )}
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// ISTENTISZTELETEK — a 2. pillér központi slide-ja
// ──────────────────────────────────────────────────────────────

function WorshipServicesSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const total = data.worship.totalServices
  const allTypes = Object.entries(data.worship.byType).sort((a, b) => b[1] - a[1])
  const TYPE_LABELS: Record<string, string> = {
    istentisztelet: 'Istentiszteletek',
    biblia_ora: 'Biblia-órák',
    konferencia: 'Konferenciák',
    evangelizacio: 'Evangelizációk',
    imaora: 'Imaórák',
    ifi: 'Ifjúsági alkalmak',
    noszovetseg: 'Nőszövetségi alkalmak',
    tabor: 'Táborok',
    unnepi_alkalom: 'Ünnepi alkalmak',
    presbiteri: 'Presbiteri gyűlések',
  }
  const TYPE_COLORS: Record<string, string> = {
    istentisztelet: '#0f766e',
    biblia_ora: '#7c3aed',
    konferencia: '#d97706',
    evangelizacio: '#dc2626',
    imaora: '#0891b2',
    ifi: '#16a34a',
    noszovetseg: '#db2777',
    tabor: '#ea580c',
    unnepi_alkalom: '#ca8a04',
    presbiteri: '#475569',
  }
  return (
    <SlideFrame projection={projection} orbVariant="teal">
      <SlideHeader title={title} subtitle={subtitle} icon={<BookOpen className="size-5" />} projection={projection} accentClass="from-teal-500 to-emerald-600" />
      <motion.div variants={slideStagger} className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_1.5fr]">
        {/* Bal: nagy istentisztelet-szám */}
        <MotionItem variants={scaleIn} className="flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 p-5 shadow-lg ring-1 ring-teal-200/60 backdrop-blur">
          <p className={cn('font-semibold uppercase tracking-wider text-teal-700/80', projection ? 'text-base' : 'text-xs')}>
            Istentiszteletek száma
          </p>
          <p className={cn('mt-2 font-bold text-teal-900 tabular-nums', projection ? 'text-9xl' : 'text-7xl')}>
            <AnimatedNumber value={total} />
          </p>
          <p className={cn('mt-2 text-teal-700/70', projection ? 'text-xl' : 'text-sm')}>a {data.year}. évben</p>
        </MotionItem>

        {/* Jobb: alkalmak típus szerint — horizontális bar-ok */}
        <MotionItem variants={scaleIn} className="rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <h4 className={cn('mb-3 font-semibold text-slate-700', projection ? 'text-xl' : 'text-sm')}>
            Minden alkalom típus szerint
          </h4>
          {allTypes.length === 0 ? (
            <p className="text-center text-sm text-slate-400">Nincs rögzített alkalom.</p>
          ) : (
            <motion.div variants={slideStaggerFast} className="space-y-2">
              {allTypes.map(([type, count], i) => {
                const maxCount = Math.max(...allTypes.map((t) => t[1]), 1)
                const pct = (count / maxCount) * 100
                const label = TYPE_LABELS[type] || type
                const color = TYPE_COLORS[type] || '#64748b'
                return (
                  <MotionItem key={type} variants={fadeUp} className="flex items-center gap-3">
                    <div className={cn('flex-shrink-0 truncate font-medium text-slate-700', projection ? 'w-48 text-base' : 'w-32 text-xs')}>
                      {label}
                    </div>
                    <div className="flex-1">
                      <AnimatedBar
                        percent={pct}
                        color={color}
                        delay={0.3 + i * 0.05}
                        heightClass={projection ? 'h-6' : 'h-4'}
                      />
                    </div>
                    <div className={cn('flex-shrink-0 text-right font-mono font-semibold text-slate-900 tabular-nums', projection ? 'w-14 text-base' : 'w-10 text-xs')}>
                      <AnimatedNumber value={count} />
                    </div>
                  </MotionItem>
                )
              })}
            </motion.div>
          )}
        </MotionItem>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// INSIGHTS — következtetések az előző évi adatok alapján (opcionális)
// ──────────────────────────────────────────────────────────────

function ConclusionsSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const insights = buildConclusions(data)
  return (
    <SlideFrame projection={projection} orbVariant="violet">
      <SlideHeader
        title={title}
        subtitle={subtitle || 'Mit tanultunk ebből az évből?'}
        icon={<Sparkles className="size-5" />}
        projection={projection}
        accentClass="from-violet-500 to-fuchsia-600"
      />
      <MotionItem variants={scaleIn} className="flex-1 overflow-y-auto rounded-2xl bg-white/90 p-5 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
        <motion.div variants={slideStaggerFast} className={cn('grid gap-3', insights.length > 4 ? 'md:grid-cols-2' : 'grid-cols-1')}>
          {insights.map((ins, i) => {
            const colorMap = {
              up: { bg: 'from-emerald-50 to-teal-50', text: 'text-emerald-900', icon: '↗', iconColor: 'text-emerald-600' },
              down: { bg: 'from-rose-50 to-orange-50', text: 'text-rose-900', icon: '↘', iconColor: 'text-rose-600' },
              stable: { bg: 'from-slate-50 to-white', text: 'text-slate-900', icon: '→', iconColor: 'text-slate-500' },
            }
            const c = colorMap[ins.direction]
            return (
              <MotionItem key={i} variants={fadeUp} className={cn('rounded-xl bg-gradient-to-br p-3 ring-1 ring-slate-100', c.bg)}>
                <div className="flex items-start gap-2">
                  <motion.span
                    className={cn('flex-shrink-0 text-2xl font-bold', c.iconColor)}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 260 }}
                  >
                    {c.icon}
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <h4 className={cn('font-semibold', c.text, projection ? 'text-lg' : 'text-sm')}>{ins.headline}</h4>
                    <p className={cn('mt-1 leading-relaxed text-slate-700', projection ? 'text-sm' : 'text-xs')}>
                      {ins.detail}
                    </p>
                    <div className={cn('mt-1.5 flex items-center justify-between text-slate-500', projection ? 'text-xs' : 'text-[10px]')}>
                      <span>{ins.metricLabel}</span>
                      <span className={cn('font-mono font-semibold', c.text)}>{ins.metricValue}</span>
                    </div>
                  </div>
                </div>
              </MotionItem>
            )
          })}
        </motion.div>
      </MotionItem>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

function ForecastSlide({ data, title, subtitle, commentary, projection }: SlideProps) {
  const series = buildForecast(data, 5)
  // Chart adat: év-szerint, bevétel + kiadás (és jelezzük, hol kezdődik a forecast)
  const lastActualYear = data.finance.byYear.length > 0
    ? Math.max(...data.finance.byYear.map((y) => y.year))
    : data.year
  const chartData = series[0].data.map((p, i) => ({
    year: p.year,
    income: p.predicted,
    expense: series[1].data[i]?.predicted || 0,
  }))
  return (
    <SlideFrame projection={projection} orbVariant="violet">
      <SlideHeader title={title} subtitle={subtitle} icon={<Sparkles className="size-5" />} projection={projection} accentClass="from-violet-500 to-fuchsia-600" />
      <motion.div variants={slideStagger} className="flex flex-1 flex-col gap-3">
        <MotionItem variants={scaleIn} className="flex-1 rounded-2xl bg-white/90 p-4 shadow-lg ring-1 ring-slate-200/60 backdrop-blur">
          <ResponsiveContainer width="100%" height={projection ? 400 : 260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip
                formatter={(v, name) => {
                  const label = String(name)
                  return [typeof v === 'number' ? `${v.toLocaleString('hu')} RON` : String(v), label]
                }}
                labelFormatter={(y) => (y as number) > lastActualYear ? `${y} (előrejelzés)` : `${y}`}
              />
              <Legend />
              <Line type="monotone" dataKey="income" name="Bevétel" stroke="#10b981" strokeWidth={3} animationDuration={1500} animationBegin={200} />
              <Line type="monotone" dataKey="expense" name="Kiadás" stroke="#ef4444" strokeWidth={3} animationDuration={1500} animationBegin={500} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-2 text-center text-[11px] italic text-slate-500">
            A vonal {lastActualYear} évig történeti adat, utána lineáris trend-alapú előrejelzés.
          </p>
        </MotionItem>
        <motion.div variants={slideStaggerFast} className="grid grid-cols-2 gap-3">
          {series.map((s) => (
            <MotionItem key={s.label} variants={fadeUp} className="rounded-xl bg-white/90 p-3 shadow-sm ring-1 ring-slate-200/60 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: s.color }} />
                <span className="text-sm font-semibold text-slate-800">{s.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{s.summary}</p>
            </MotionItem>
          ))}
        </motion.div>
      </motion.div>
      <SlideCommentary commentary={commentary} projection={projection} />
    </SlideFrame>
  )
}

function ClosingSlide({ title, subtitle, commentary, projection }: SlideProps) {
  return (
    <SlideFrame
      projection={projection}
      className="items-center justify-center text-center"
      backgroundClass="bg-gradient-to-br from-violet-100/80 via-white to-amber-50/80"
      orbVariant="violet"
    >
      <motion.div
        variants={popIn}
        animate={{ y: [0, -6, 0] }}
        transition={{ y: { duration: 4, repeat: Infinity, ease: 'easeInOut' }, delay: 0.5 }}
        className={cn(
          'mb-6 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-2xl ring-4 ring-white/70',
          projection ? 'size-32 text-6xl' : 'size-20 text-4xl',
        )}
      >
        ✝
      </motion.div>
      <MotionItem variants={fadeUp}>
        <h1 className={cn('font-heading font-bold text-slate-900', projection ? 'text-7xl' : 'text-4xl')}>{title}</h1>
      </MotionItem>
      {subtitle && (
        <MotionItem variants={fadeUp}>
          <p className={cn('mt-4 italic text-violet-800', projection ? 'text-3xl' : 'text-xl')}>{subtitle}</p>
        </MotionItem>
      )}
      <MotionItem variants={fadeUp}>
        <motion.div
          className={cn('mx-auto mt-8 h-0.5 rounded-full bg-gradient-to-r from-transparent via-violet-400 to-transparent', projection ? 'w-80' : 'w-48')}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 1, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </MotionItem>
      {commentary && (
        <MotionItem variants={fadeUp}>
          <p className={cn('mt-8 max-w-3xl text-slate-700', projection ? 'text-2xl' : 'text-base')}>{commentary}</p>
        </MotionItem>
      )}
    </SlideFrame>
  )
}

// ──────────────────────────────────────────────────────────────
// Exportált lista
// ──────────────────────────────────────────────────────────────

/**
 * Slide-struktúra 3 pillérre szervezve — a Közgyűlési beszámoló PDF
 * mintája alapján (2026-04-21r):
 *   1. Lélekszámbeli (Hányan?) — tagok, anyakönyv, név-listák
 *   2. Lelki (Hogyan?) — istentiszteletek, alkalmak, programok
 *   3. Anyagi (Miből?) — számadás, bevételek, kiadások
 */
export const SLIDES: SlideDefinition[] = [
  // ─── NYITÓ ───
  {
    key: 'title',
    defaultTitle: 'Éves beszámoló',
    defaultSubtitle: 'Gyülekezeti jelentés',
    resolveTitle: (d) => `${d.congregation.name}`,
    resolveSubtitle: (d) => `${d.year}. évi beszámoló`,
    component: TitleSlide,
  },
  {
    key: 'overview',
    defaultTitle: 'Éves áttekintés',
    defaultSubtitle: 'A három pillér és három kérdés',
    component: OverviewSlide,
  },

  // ─── 1. PILLÉR — LÉLEKSZÁMBELI ───
  {
    key: 'pillar-1-intro',
    defaultTitle: 'Lélekszámbeli',
    defaultSubtitle: 'Megmaradásunk fő pillére',
    component: Pillar1IntroSlide,
  },
  {
    key: 'demographics',
    defaultTitle: 'Gyülekezet összetétele',
    defaultSubtitle: 'Férfiak és nők aránya',
    component: DemographicsSlide,
  },
  {
    key: 'age-distribution',
    defaultTitle: 'Kor szerinti eloszlás',
    defaultSubtitle: 'A tagság életkor-csoportonként',
    component: AgeDistributionSlide,
  },
  {
    key: 'anyakonyv',
    defaultTitle: 'Anyakönyvi események',
    defaultSubtitle: 'Keresztelő, konfirmáció, esküvő, temetés',
    component: AnyakonyvSlide,
  },
  {
    key: 'baptisms-list',
    defaultTitle: 'Keresztelések',
    defaultSubtitle: 'Akik az év folyamán bekerültek a gyülekezet családjába',
    component: BaptismsListSlide,
  },
  {
    key: 'confirmations-list',
    defaultTitle: 'Konfirmációk',
    defaultSubtitle: 'Akik hitvallást tettek az év folyamán',
    component: ConfirmationsListSlide,
  },
  {
    key: 'marriages-list',
    defaultTitle: 'Esketések',
    defaultSubtitle: 'Akik szövetséget kötöttek Isten és az egyház előtt',
    component: MarriagesListSlide,
  },
  {
    key: 'funerals-list',
    defaultTitle: 'Temetések',
    defaultSubtitle: 'Akiket eltemettünk — emlékük legyen áldott',
    component: FuneralsListSlide,
  },
  {
    key: 'anyakonyv-history',
    defaultTitle: 'Anyakönyvi trend — 5 év',
    defaultSubtitle: 'Hogyan változtak az események évek során',
    component: AnyakonyvHistorySlide,
  },

  // ─── 2. PILLÉR — LELKI ───
  {
    key: 'pillar-2-intro',
    defaultTitle: 'Lelki',
    defaultSubtitle: 'Akik aktívan részt vesznek a gyülekezeti életben',
    component: Pillar2IntroSlide,
  },
  {
    key: 'worship-services',
    defaultTitle: 'Istentiszteletek és alkalmak',
    defaultSubtitle: 'A gyülekezet lelki élete számokban',
    component: WorshipServicesSlide,
  },
  {
    key: 'programs',
    defaultTitle: 'Gyülekezeti programok',
    defaultSubtitle: 'Az év eseményei összességében',
    component: ProgramsSlide,
  },

  // ─── 3. PILLÉR — ANYAGI ───
  {
    key: 'pillar-3-intro',
    defaultTitle: 'Anyagi',
    defaultSubtitle: 'Hogyan gazdálkodunk azzal, amink van',
    component: Pillar3IntroSlide,
  },
  {
    key: 'finance-summary',
    defaultTitle: 'Számadás',
    defaultSubtitle: 'Pénzügyi áttekintés az évről',
    resolveSubtitle: (d) => `Az ${d.year}. év pénzügyi áttekintése`,
    component: FinanceSummarySlide,
  },
  {
    key: 'income-detail',
    defaultTitle: 'Bevételek részletesen',
    defaultSubtitle: 'Miből gazdálkodott az egyház',
    component: IncomeDetailSlide,
  },
  {
    key: 'expense-detail',
    defaultTitle: 'Kiadások részletesen',
    defaultSubtitle: 'Mire költött az egyház',
    component: ExpenseDetailSlide,
  },
  {
    key: 'egyhazfenntartas',
    defaultTitle: 'Egyházfenntartás teljesítése',
    defaultSubtitle: 'Aktív tagok — fizetett tagok aránya',
    component: EgyhazfenntartasSlide,
  },
  {
    key: 'finance-trend',
    defaultTitle: 'Pénzügyi trend — 5 év',
    defaultSubtitle: 'Bevétel és kiadás összehasonlítása',
    component: FinanceTrendSlide,
  },

  // ─── KIEGÉSZÍTŐK (opcionálisak — a Studio toggle-olható) ───
  {
    key: 'conclusions',
    defaultTitle: 'Következtetések',
    defaultSubtitle: 'Mit tanultunk ebből az évből',
    component: ConclusionsSlide,
  },
  {
    key: 'forecast',
    defaultTitle: 'Előrejelzés — 5 év',
    defaultSubtitle: 'Merre tart a gyülekezet',
    component: ForecastSlide,
  },

  // ─── ZÁRÓ ───
  {
    key: 'closing',
    defaultTitle: 'Soli Deo Gloria',
    defaultSubtitle: 'Egyedül Istené a dicsőség',
    component: ClosingSlide,
  },
]

// ──────────────────────────────────────────────────────────────
// Az opcionális slide-kulcsok — a Studio-ban a user be/ki kapcsolhatja
// ──────────────────────────────────────────────────────────────

export const OPTIONAL_SLIDE_KEYS = ['conclusions', 'forecast'] as const
export type OptionalSlideKey = typeof OPTIONAL_SLIDE_KEYS[number]
