import type { Variants } from 'framer-motion';

// Shared entrance choreography. Components apply these with framer-motion's
// useReducedMotion guard so animations are skipped when the user prefers it.

export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE_OUT } },
};
