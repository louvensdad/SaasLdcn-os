'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';

import { staggerContainer, staggerItem } from '@/lib/motion';

type DivMotionProps = HTMLMotionProps<'div'>;

/**
 * Container that reveals its <StaggerItem> children with an incremental delay.
 * Entrance runs once (whileInView), and is skipped under reduced motion (the
 * same motion.div renders statically, without animation props).
 */
export function Stagger({ children, ...rest }: DivMotionProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <motion.div {...rest}>{children}</motion.div>;
  }
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, ...rest }: DivMotionProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <motion.div {...rest}>{children}</motion.div>;
  }
  return (
    <motion.div variants={staggerItem} {...rest}>
      {children}
    </motion.div>
  );
}
