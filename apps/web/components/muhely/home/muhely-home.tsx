'use client'

import type { CSSProperties } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  ArrowRight,
  Award,
  BookOpen,
  CircleCheck,
  HeartHandshake,
  Lightbulb,
  MessageCircle,
  Sparkles,
  Sprout,
  Users,
} from 'lucide-react'

import { getMissionProgress, MISSION_LEVELS, type MissionUserStats } from '@/lib/missions/gamification'

import styles from './muhely-home.module.css'

type HomeCategory = {
  id: number
  nev: string
  ikon: string
  szin: string
}

type HomeMaterial = {
  id: string
  cim: string
  leiras: string | null
  formatum: string
  feltolto_nev: string | null
  feltolto_gyulekezet: string | null
  created_at: string
  mm_segedanyag_kategoriak: Array<{
    kategoria_id: number
    mm_kategoriak: { nev: string; ikon: string; szin: string } | null
  }>
}

type HomeIdea = {
  id: string
  cim: string
  leiras: string
  statusz: string | null
  otletgazda_nev: string | null
  otletgazda_gyulekezet: string | null
  tamogatasok_szama: number | null
  csatlakozok_szama: number | null
  hozzaszolasok_szama: number | null
  created_at: string
  mySupport?: boolean
  myJoin?: boolean
  mm_otlet_kategoriak: Array<{
    kategoria_id: number
    mm_kategoriak: { nev: string; ikon: string; szin: string } | null
  }>
}

type HomeBadgeType = {
  id: number
  kod: string
  nev: string
  leiras: string
  feltetel: string
  szin: string
  sorrend: number
}

type HomeBadge = {
  id: string
  jelveny_id: number
}

type HomeContributor = {
  userId: string
  fullName: string
  congregationName: string
  score: number
  level: string
}

export interface MuhelyHomeData {
  viewer: {
    id: string
    fullName: string
    congregationName: string
  }
  recentMaterials: HomeMaterial[]
  recentIdeas: HomeIdea[]
  myProjects: HomeIdea[]
  topContributors: HomeContributor[]
  communityStats: {
    totalMaterials: number
    totalIdeas: number
    totalComments: number
    totalMembers: number
  }
  categories: HomeCategory[]
  myStats: MissionUserStats
  badgeCatalog: HomeBadgeType[]
  myBadges: HomeBadge[]
}

interface MuhelyHomeProps {
  data: MuhelyHomeData
}

type BadgeRequirement = {
  current: (stats: MissionUserStats) => number
  target: number
  action: string
}

const BADGE_REQUIREMENTS: Record<string, BadgeRequirement> = {
  elso_otlet: { current: (stats) => stats.otletek_szama, target: 1, action: 'Oszd meg az első ötletedet' },
  otletgyaros: { current: (stats) => stats.otletek_szama, target: 5, action: 'Hozz még egy kipróbálható ötletet' },
  tamogato: { current: (stats) => stats.tamogatasok_adva, target: 10, action: 'Bátoríts egy közösségi ötletet' },
  tamogato_bajnok: { current: (stats) => stats.tamogatasok_adva, target: 25, action: 'Adj támogatást egy jó kezdeményezésnek' },
  feltolto: { current: (stats) => stats.segedanyagok_feltoltve, target: 5, action: 'Tegyél egy bevált anyagot a Műhelypolcra' },
  siker: { current: (stats) => stats.megvalosult_otletek, target: 1, action: 'Vigyél tovább egy ötletet a megvalósítás felé' },
  nagy_siker: { current: (stats) => stats.megvalosult_otletek, target: 3, action: 'Folytasd egy közös projekt építését' },
  top_ertekelo: { current: (stats) => stats.ertekelesek_adva, target: 20, action: 'Értékelj egy hasznos segédanyagot' },
  hozzaszolo: { current: (stats) => stats.hozzaszolasok_szama, target: 50, action: 'Kapcsolódj be egy beszélgetésbe' },
  mentor: { current: (stats) => stats.feladatok_teljesitve, target: 10, action: 'Teljesíts egy vállalt projektfeladatot' },
}

const STATUS_META: Record<string, { label: string; icon: typeof Sprout }> = {
  uj: { label: 'Friss gondolat', icon: Sprout },
  szavazas: { label: 'Közösségi mérlegelés', icon: HeartHandshake },
  kozos_munka: { label: 'Aktív együttműködés', icon: Users },
  megvalosult: { label: 'Megvalósult szolgálat', icon: CircleCheck },
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] },
  },
}

function firstName(fullName: string) {
  const clean = fullName.replace(/^(Nt\.|Ft\.|Főt\.|Rev\.)\s+/i, '').trim()
  return clean.split(/\s+/).filter(Boolean).at(-1) || 'Lelkipásztor'
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' }).format(new Date(value))
}

function categoryNames(item: HomeMaterial | HomeIdea) {
  if ('mm_segedanyag_kategoriak' in item) {
    return item.mm_segedanyag_kategoriak
      .map((entry) => entry.mm_kategoriak?.nev)
      .filter((name): name is string => Boolean(name))
  }

  return item.mm_otlet_kategoriak
    .map((entry) => entry.mm_kategoriak?.nev)
    .filter((name): name is string => Boolean(name))
}

function getNextBadge(data: MuhelyHomeData) {
  const earnedIds = new Set(data.myBadges.map((badge) => badge.jelveny_id))
  const candidates = data.badgeCatalog
    .filter((badge) => !earnedIds.has(badge.id))
    .flatMap((badge) => {
      const rule = BADGE_REQUIREMENTS[badge.kod]
      if (!rule) return []
      const current = Math.min(rule.current(data.myStats), rule.target)
      return [{ badge, rule, current, remaining: Math.max(rule.target - current, 0) }]
    })
    .sort((left, right) => left.remaining - right.remaining || left.badge.sorrend - right.badge.sorrend)

  return candidates[0] || null
}

function EmptyPaper({ children }: { children: React.ReactNode }) {
  return <div className={styles.emptyPaper}>{children}</div>
}

export function MuhelyHome({ data }: MuhelyHomeProps) {
  const reducedMotion = useReducedMotion()
  const progress = getMissionProgress(data.myStats.osszpontszam || 0)
  const featuredIdea = data.myProjects[0] || data.recentIdeas[0] || null
  const nextBadge = getNextBadge(data)
  const heroName = firstName(data.viewer.fullName)
  const heroVariants = reducedMotion ? undefined : itemVariants
  const listVariants = reducedMotion ? undefined : containerVariants
  const ringStyle = {
    '--mm-progress': `${progress.percent}%`,
  } as CSSProperties

  return (
    <motion.div
      className={styles.home}
      variants={listVariants}
      initial={reducedMotion ? false : 'hidden'}
      animate="visible"
    >
      <motion.section className={styles.hero} variants={heroVariants} aria-labelledby="muhely-hero-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><Sparkles aria-hidden="true" /> Missziós Műhely</span>
          <h1 id="muhely-hero-title">Itt lesz az ötletből szolgálat.</h1>
          <p>Jó, hogy itt vagy, {heroName}. Ez a közös tér azért van, hogy a gondolataid társakra, a szolgálati tapasztalataid pedig új otthonra találjanak.</p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/misszios-muhely/forum">
              <Lightbulb aria-hidden="true" /> Új ötletet hozok <ArrowRight aria-hidden="true" />
            </Link>
            <Link className={styles.secondaryAction} href="/misszios-muhely/segedanyagok">
              <BookOpen aria-hidden="true" /> Megnézem a Műhelypolcot
            </Link>
          </div>
          <dl className={styles.communityNumbers} aria-label="A műhelyközösség számokban">
            <div><dt>ötlet</dt><dd>{data.communityStats.totalIdeas}</dd></div>
            <div><dt>segédanyag</dt><dd>{data.communityStats.totalMaterials}</dd></div>
            <div><dt>beszélgetés</dt><dd>{data.communityStats.totalComments}</dd></div>
            <div><dt>alkotótárs</dt><dd>{data.communityStats.totalMembers}</dd></div>
          </dl>
        </div>
        <div className={styles.heroStillLife} aria-hidden="true">
          <div className={styles.sunWash} />
          <Image
            src="/misszios-muhely/hero-still-life-v2.png"
            alt=""
            width={900}
            height={620}
            priority
            sizes="(max-width: 900px) 100vw, 44vw"
          />
        </div>
      </motion.section>

      <motion.div className={styles.firstRow} variants={heroVariants}>
        <section className={styles.welcomeCard} aria-labelledby="sajat-ut-title">
          <div className={styles.sectionKicker}><Sprout aria-hidden="true" /> Saját utad</div>
          <h2 id="sajat-ut-title">Isten hozott újra!</h2>
          <p className={styles.muted}>{data.viewer.congregationName || 'A Missziós Műhely közössége'}</p>
          <div className={styles.levelSummary}>
            <div className={styles.progressRing} style={ringStyle}>
              <strong>{data.myStats.osszpontszam || 0}</strong>
              <span>pont</span>
            </div>
            <div>
              <span className={styles.levelLabel}>{progress.current.name}</span>
              <p>{progress.current.description}</p>
              {progress.next ? (
                <small>{progress.next.minPoints - data.myStats.osszpontszam} pont a következő szintig</small>
              ) : (
                <small>A szolgálati ösvény csúcsára értél.</small>
              )}
            </div>
          </div>
          <blockquote>„Aki hű a kevesen, a sokon is hű lesz.” <cite>Lk 16,10</cite></blockquote>
        </section>

        <section className={styles.featuredIdea} aria-labelledby="kozos-asztal-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionKicker}>A közös asztal</span>
              <h2 id="kozos-asztal-title">Ötletek, amelyek éppen formálódnak</h2>
            </div>
            <Link href="/misszios-muhely/forum">Összes ötlet <ArrowRight aria-hidden="true" /></Link>
          </header>
          {featuredIdea ? (
            <FeaturedIdea idea={featuredIdea} />
          ) : (
            <EmptyPaper>Még üres az asztal. Hozd el az első közös gondolatot!</EmptyPaper>
          )}
        </section>
      </motion.div>

      <motion.div className={styles.secondRow} variants={heroVariants}>
        <section className={styles.shelfSection} aria-labelledby="muhelypolc-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionKicker}>Megosztott tapasztalat</span>
              <h2 id="muhelypolc-title">Műhelypolc</h2>
            </div>
            <Link href="/misszios-muhely/segedanyagok">Minden forrás <ArrowRight aria-hidden="true" /></Link>
          </header>
          {data.recentMaterials.length ? (
            <div className={styles.shelf}>
              {data.recentMaterials.map((material) => (
                <Link key={material.id} href="/misszios-muhely/segedanyagok" className={styles.bookCard}>
                  <span className={styles.bookFormat}>{material.formatum || 'anyag'}</span>
                  <strong>{material.cim}</strong>
                  <span>{categoryNames(material).slice(0, 2).join(' · ') || 'Közös műhelyanyag'}</span>
                  <small>{material.feltolto_nev || 'Műhelytárs'} · {shortDate(material.created_at)}</small>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyPaper>A polc első darabja a te bevált segédanyagod is lehet.</EmptyPaper>
          )}
        </section>

        <section className={styles.pathSection} aria-labelledby="osveny-title">
          <header className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionKicker}>Lépésről lépésre</span>
              <h2 id="osveny-title">Szolgálati ösvény</h2>
            </div>
            <Link href="/misszios-muhely/jutalmak">Részletek <ArrowRight aria-hidden="true" /></Link>
          </header>
          <div className={styles.levelPath} aria-label={`Jelenlegi szint: ${progress.current.name}`}>
            {MISSION_LEVELS.map((level, index) => {
              const reached = data.myStats.osszpontszam >= level.minPoints
              const current = progress.current.name === level.name
              return (
                <div key={level.name} className={styles.pathStep} data-reached={reached} data-current={current}>
                  <span>{current ? <Sparkles aria-hidden="true" /> : index + 1}</span>
                  <strong>{level.name}</strong>
                  <small>{level.minPoints} pont</small>
                </div>
              )
            })}
          </div>
          {nextBadge ? (
            <div className={styles.nextBadge}>
              <Award aria-hidden="true" />
              <div>
                <span>Következő kis lépés · {nextBadge.badge.nev}</span>
                <strong>{nextBadge.rule.action}</strong>
                <small>{nextBadge.current}/{nextBadge.rule.target} · {nextBadge.badge.feltetel}</small>
              </div>
            </div>
          ) : (
            <div className={styles.nextBadge}><Award aria-hidden="true" /><strong>Minden mérhető jelvényedet megszerezted.</strong></div>
          )}
        </section>
      </motion.div>

      <motion.section className={styles.inspirationSection} variants={heroVariants} aria-labelledby="inspiracio-title">
        <header className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionKicker}>Most történik</span>
            <h2 id="inspiracio-title">Közösségi inspiráció</h2>
          </div>
        </header>
        <div className={styles.inspirationGrid}>
          {data.recentIdeas.slice(0, 3).map((idea) => (
            <Link key={idea.id} className={styles.ideaNote} href={`/misszios-muhely/forum/${idea.id}`}>
              <span>{categoryNames(idea).slice(0, 2).join(' · ') || 'Közös gondolkodás'}</span>
              <strong>{idea.cim}</strong>
              <p>{idea.leiras}</p>
              <small><MessageCircle aria-hidden="true" /> {idea.hozzaszolasok_szama || 0} hozzászólás</small>
            </Link>
          ))}
          <div className={styles.communityLights}>
            <span className={styles.sectionKicker}>Közösségi fények</span>
            {data.topContributors.slice(0, 3).map((person) => (
              <div key={person.userId}>
                <span aria-hidden="true">{person.fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)}</span>
                <p><strong>{person.fullName}</strong><small>{person.congregationName || person.level}</small></p>
                <b>{person.score} p</b>
              </div>
            ))}
          </div>
        </div>
        {data.categories.length > 0 && (
          <div className={styles.categoryRibbon} aria-label="Műhelykategóriák">
            {data.categories.slice(0, 8).map((category) => (
              <Link key={category.id} href="/misszios-muhely/segedanyagok">
                <span style={{ backgroundColor: category.szin }} aria-hidden="true" />{category.nev}
              </Link>
            ))}
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}

function FeaturedIdea({ idea }: { idea: HomeIdea }) {
  const status = STATUS_META[idea.statusz || 'uj'] || STATUS_META.uj
  const StatusIcon = status.icon
  const totalSignals = (idea.tamogatasok_szama || 0) + (idea.csatlakozok_szama || 0)
  const progressValue = idea.statusz === 'megvalosult' ? 100 : idea.statusz === 'kozos_munka' ? 64 : idea.statusz === 'szavazas' ? 38 : 18

  return (
    <Link href={`/misszios-muhely/forum/${idea.id}`} className={styles.featuredIdeaBody}>
      <div className={styles.ideaIllustration} aria-hidden="true"><Sprout /></div>
      <div className={styles.ideaCopy}>
        <span className={styles.statusPill}><StatusIcon aria-hidden="true" /> {status.label}</span>
        <h3>{idea.cim}</h3>
        <p>{idea.leiras}</p>
        <div className={styles.ideaMeta}>
          <span><HeartHandshake aria-hidden="true" /> {idea.tamogatasok_szama || 0} támogatás</span>
          <span><Users aria-hidden="true" /> {idea.csatlakozok_szama || 0} társ</span>
          <span><MessageCircle aria-hidden="true" /> {idea.hozzaszolasok_szama || 0}</span>
        </div>
        <small>{idea.otletgazda_nev || 'Műhelytárs'} · {idea.otletgazda_gyulekezet || shortDate(idea.created_at)}</small>
      </div>
      <div className={styles.ideaNext}>
        <span>Következő lépés</span>
        <strong>{idea.statusz === 'kozos_munka' ? 'Folytassátok a közös feladatokat' : 'Kapcsolódj a beszélgetéshez'}</strong>
        <div className={styles.ideaProgress}><span style={{ width: `${Math.max(progressValue, Math.min(totalSignals * 4, 90))}%` }} /></div>
        <b>Megnyitom <ArrowRight aria-hidden="true" /></b>
      </div>
    </Link>
  )
}
