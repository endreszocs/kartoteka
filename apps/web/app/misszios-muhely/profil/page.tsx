import type { CSSProperties } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight,
  Award,
  BookOpen,
  HeartHandshake,
  Lightbulb,
  MessageCircle,
  Sparkles,
  Sprout,
} from 'lucide-react'

import { MissionBadge } from '@/components/muhely/rewards/mission-badge'
import { getEffectiveAccessContext } from '@/lib/auth/effective-access'
import { getMissionProgress } from '@/lib/missions/gamification'
import { getMissionBadge, isMissionBadgeCode } from '@/lib/missions/badges'

import { loadProfilePage } from '../community-actions'
import styles from './profile.module.css'

const IDEA_STATUS: Record<string, string> = {
  uj: 'Friss gondolat',
  szavazas: 'Közösségi mérlegelés',
  kozos_munka: 'Közös munkában',
  megvalosult: 'Megvalósult',
  archivalt: 'Lezárt',
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'korábban'

  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function initials(fullName: string) {
  const letters = fullName
    .replace(/^(Nt\.|Ft\.|Főt\.|Rev\.)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')

  return letters.slice(0, 2).toLocaleUpperCase('hu-HU') || 'LM'
}

export default async function ProfilPage() {
  const { user } = await getEffectiveAccessContext()
  if (!user) redirect('/login')

  const data = await loadProfilePage()
  if ('error' in data) redirect('/login')

  const points = data.myStats.osszpontszam || 0
  const progress = getMissionProgress(points)
  const progressStyle = { '--profile-progress': `${progress.percent}%` } as CSSProperties
  const earnedBadges = data.myBadges.flatMap((entry) => {
    const code = entry.mm_jelveny_tipusok?.kod
    if (!isMissionBadgeCode(code)) return []

    return [{ badge: getMissionBadge(code), earnedAt: entry.elnyerve }]
  })

  const statCards = [
    { icon: Lightbulb, label: 'Útnak indított ötlet', value: data.myIdeas.length },
    { icon: BookOpen, label: 'Polcra tett segédanyag', value: data.myMaterials.length },
    { icon: HeartHandshake, label: 'Adott támogatás', value: data.myStats.tamogatasok_adva || 0 },
    { icon: MessageCircle, label: 'Építő hozzászólás', value: data.myStats.hozzaszolasok_szama || 0 },
  ]

  return (
    <main className={styles.page}>
      <section className={styles.profileHero} aria-labelledby="profile-title">
        <div className={styles.botanicalCorner} aria-hidden="true" />
        <div className={styles.identity}>
          <div className={styles.avatar} aria-hidden="true">
            <span>{initials(data.viewer.fullName)}</span>
          </div>
          <div>
            <span className={styles.eyebrow}><Sprout aria-hidden="true" /> Saját műhelynaplóm</span>
            <h1 id="profile-title">{data.viewer.fullName}</h1>
            <p>{data.viewer.congregationName || 'A Missziós Műhely közössége'}</p>
          </div>
        </div>

        <div className={styles.heroProgress}>
          <div className={styles.progressRing} style={progressStyle}>
            <span><strong>{points}</strong><small>pont</small></span>
          </div>
          <div className={styles.levelCopy}>
            <span>Jelenlegi állomás</span>
            <strong>{progress.current.name}</strong>
            <p>{progress.current.description}</p>
            {progress.next ? (
              <small>{Math.max(progress.next.minPoints - points, 0)} pont a következő állomásig</small>
            ) : (
              <small>A szolgálati ösvény minden állomását elérted.</small>
            )}
          </div>
        </div>

        <div className={styles.heroActions}>
          <Link href="/misszios-muhely/jutalmak">
            <Award aria-hidden="true" /> Jelvényszekrényem <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/misszios-muhely/forum">
            <Lightbulb aria-hidden="true" /> Új ötletet hozok
          </Link>
        </div>
      </section>

      <section className={styles.statsSection} aria-labelledby="profile-stats-title">
        <header className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>Az eddigi nyomok</span>
            <h2 id="profile-stats-title">Amit már a közösbe tettél</h2>
          </div>
          <p>Minden szám mögött egy beszélgetés, egy megosztott tapasztalat vagy egy szolgálat felé tett lépés van.</p>
        </header>
        <div className={styles.statGrid}>
          {statCards.map((stat) => (
            <article key={stat.label} className={styles.statCard}>
              <span><stat.icon aria-hidden="true" /></span>
              <strong>{stat.value}</strong>
              <p>{stat.label}</p>
            </article>
          ))}
        </div>
      </section>

      <div className={styles.journalGrid}>
        <section className={styles.journalPanel} aria-labelledby="my-ideas-title">
          <header className={styles.panelHeading}>
            <div>
              <span className={styles.kicker}>Gondolatmagok</span>
              <h2 id="my-ideas-title">Ötleteim</h2>
            </div>
            <Link href="/misszios-muhely/forum">Az Ötletasztalhoz <ArrowRight aria-hidden="true" /></Link>
          </header>
          {data.myIdeas.length ? (
            <div className={styles.ideaList}>
              {data.myIdeas.slice(0, 5).map((idea, index) => (
                <Link key={idea.id} href={`/misszios-muhely/forum/${idea.id}`} className={styles.ideaEntry}>
                  <span className={styles.entryNumber}>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <span className={styles.status}>{IDEA_STATUS[idea.statusz || 'uj'] || 'Közös gondolkodás'}</span>
                    <h3>{idea.cim}</h3>
                    <p>
                      <HeartHandshake aria-hidden="true" /> {idea.tamogatasok_szama || 0}
                      <MessageCircle aria-hidden="true" /> {idea.hozzaszolasok_szama || 0}
                      <time dateTime={idea.created_at}>{formatDate(idea.created_at)}</time>
                    </p>
                  </div>
                  <ArrowRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyPage}>
              <Lightbulb aria-hidden="true" />
              <strong>Az első oldal még rád vár.</strong>
              <p>Hozz egy apró, kipróbálható gondolatot; a közösség segít tovább formálni.</p>
              <Link href="/misszios-muhely/forum">Ötletet hozok <ArrowRight aria-hidden="true" /></Link>
            </div>
          )}
        </section>

        <section className={styles.journalPanel} aria-labelledby="my-materials-title">
          <header className={styles.panelHeading}>
            <div>
              <span className={styles.kicker}>Megosztott tapasztalat</span>
              <h2 id="my-materials-title">Segédanyagaim</h2>
            </div>
            <Link href="/misszios-muhely/segedanyagok">A Műhelypolchoz <ArrowRight aria-hidden="true" /></Link>
          </header>
          {data.myMaterials.length ? (
            <div className={styles.materialList}>
              {data.myMaterials.slice(0, 5).map((material) => (
                <Link key={material.id} href="/misszios-muhely/segedanyagok" className={styles.materialEntry}>
                  <span className={styles.bookSpine} aria-hidden="true"><BookOpen /></span>
                  <div>
                    <span>{material.formatum || 'segédanyag'}</span>
                    <h3>{material.cim}</h3>
                    <p>{material.leiras || 'A közösség számára megosztott műhelyanyag.'}</p>
                    <time dateTime={material.created_at}>{formatDate(material.created_at)}</time>
                  </div>
                  <ArrowRight aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyPage}>
              <BookOpen aria-hidden="true" />
              <strong>A polcod első darabja még hiányzik.</strong>
              <p>Egy jól bevált vázlat vagy gyülekezeti gyakorlat másnak éppen a szükséges segítség lehet.</p>
              <Link href="/misszios-muhely/segedanyagok">Anyagot osztok meg <ArrowRight aria-hidden="true" /></Link>
            </div>
          )}
        </section>
      </div>

      <section className={styles.badgeShelf} aria-labelledby="profile-badges-title">
        <header className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>Emlékek a szolgálati útról</span>
            <h2 id="profile-badges-title">Elnyert jelvényeim</h2>
          </div>
          <Link href="/misszios-muhely/jutalmak">Mind a 12 jelvény <ArrowRight aria-hidden="true" /></Link>
        </header>
        {earnedBadges.length ? (
          <div className={styles.badgeRow}>
            {earnedBadges.slice(0, 6).map(({ badge, earnedAt }) => (
              <article key={badge.code} className={styles.badgeMemory}>
                <div className={styles.badgeArt}>
                  <MissionBadge badge={badge} state="earned" decorative />
                </div>
                <div>
                  <strong>{badge.name}</strong>
                  <p>{badge.description}</p>
                  <time dateTime={earnedAt}>Elnyerve: {formatDate(earnedAt)}</time>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.badgeEmpty}>
            <Sparkles aria-hidden="true" />
            <div><strong>Az első jelvényed már közel lehet.</strong><p>A jelvények nem versenyt mérnek, hanem a közösségnek adott ajándékokra emlékeztetnek.</p></div>
            <Link href="/misszios-muhely/jutalmak">Megnézem az ösvényt <ArrowRight aria-hidden="true" /></Link>
          </div>
        )}
      </section>

      <blockquote className={styles.closingNote}>
        <Sparkles aria-hidden="true" />
        <p>„A lelki ajándékokat pedig kinek-kinek azért adja, hogy használjon vele.”</p>
        <cite>1Kor 12,7</cite>
      </blockquote>
    </main>
  )
}
