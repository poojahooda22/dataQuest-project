import type { ReactNode } from "react";
import { motion, type Variants } from "motion/react";

// Entrance-motion primitives on the design system's timing tokens (tokens.css: duration-fast 150ms /
// duration-normal 300ms; ease-out cubic-bezier(0.16,1,0.3,1)). Fintech-calm rules: animate ONLY
// transform+opacity, short distances, once on mount — motion confirms structure, never performs.
// Reduced motion is honored app-wide via <MotionConfig reducedMotion="user"> in App.

export const DS_EASE = [0.16, 1, 0.3, 1] as const;

/** Whole-view entrance: a quiet fade + 12px rise. Key it by view id so route switches re-run it. */
export function PageRise({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: DS_EASE }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: DS_EASE } },
};

/** A container whose StaggerItem children cascade in (~60ms apart). Cap at ~20 items (perf). */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerParent} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={staggerChild}>
      {children}
    </motion.div>
  );
}
