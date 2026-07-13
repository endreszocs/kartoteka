'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, BookOpen, LibraryBig, Sparkles } from 'lucide-react'

import styles from './materials-studio.module.css'

interface MaterialShelfHeroProps {
  materialCount: number
  categoryCount: number
}

const premiumEase = [0.22, 1, 0.36, 1] as const

export function MaterialShelfHero({ materialCount, categoryCount }: MaterialShelfHeroProps) {
  const reduceMotion = useReducedMotion()

  return (
    <section className={styles.hero} aria-labelledby="material-shelf-title">
      <motion.div
        className={styles.heroBackdrop}
        aria-hidden="true"
        initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.9, ease: premiumEase }}
      >
        <Image
          src="/misszios-muhely/workshop-reading-room-bg-v1.webp"
          alt=""
          fill
          preload
          sizes="(min-width: 1380px) 1380px, 100vw"
          className={styles.heroBackdropImage}
        />
      </motion.div>

      <div className={styles.heroVeil} aria-hidden="true" />
      <span className={styles.heroSunbeam} aria-hidden="true" />

      <motion.div
        className={styles.heroCopy}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.68, delay: 0.06, ease: premiumEase }}
      >
        <div className={styles.eyebrow}>
          <Sparkles aria-hidden="true" />
          Műhelypolc
        </div>
        <h1 id="material-shelf-title" className={styles.heroTitle}>
          Kézbe vehető segítség a <span className={styles.heroTitleAccent}>szolgálathoz.</span>
        </h1>
        <p className={styles.heroDescription}>
          Prédikációvázlatok, liturgiai ötletek és kipróbált gyülekezeti anyagok egy napfényes közös polcon.
          Lapozz bele nyugodtan — vagy tedd mellé azt, ami nálatok már gyümölcsöt termett.
        </p>

        <div className={styles.heroStats} aria-label="A Műhelypolc számokban">
          <div className={styles.heroStat}>
            <BookOpen aria-hidden="true" />
            <span><strong>{materialCount}</strong> megosztott anyag</span>
          </div>
          <div className={styles.heroStat}>
            <LibraryBig aria-hidden="true" />
            <span><strong>{categoryCount}</strong> témakör</span>
          </div>
        </div>

        <a className={styles.heroCue} href="#material-catalogue">
          Fellapozom a polcot
          <ArrowDown aria-hidden="true" />
        </a>
      </motion.div>

      <motion.div
        className={styles.heroVisual}
        aria-hidden="true"
        initial={reduceMotion ? false : { opacity: 0, x: 14, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.76, delay: 0.16, ease: premiumEase }}
      >
        <Image
          src="/misszios-muhely/workshop-shelf-illustration-v2.png"
          alt=""
          fill
          sizes="(max-width: 639px) 104vw, (max-width: 899px) 56vw, (max-width: 1239px) 42vw, 544px"
          loading="eager"
          className={styles.heroIllustration}
        />
      </motion.div>
    </section>
  )
}
