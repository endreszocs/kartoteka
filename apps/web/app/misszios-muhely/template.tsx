'use client'

import { motion, useReducedMotion } from 'framer-motion'

export default function MuhelyTemplate({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      className="muhely-route-transition"
      initial={
        shouldReduceMotion
          ? false
          : {
              opacity: 0,
              y: 10,
              filter: 'blur(3px)',
            }
      }
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {children}
    </motion.div>
  )
}
