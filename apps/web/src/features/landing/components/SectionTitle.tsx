import { motion } from 'motion/react';
import type { SectionTitleProps } from '../types';

export default function SectionTitle({ text1, text2, text3 }: SectionTitleProps) {
  return (
    <>
      <motion.p
        className="px-section-tag"
        initial={{ y: 120, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
      >
        {text1}
      </motion.p>
      <motion.h3
        className="px-section-h3"
        initial={{ y: 120, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 280, damping: 70, mass: 1 }}
      >
        {text2}
      </motion.h3>
      <motion.p
        className="px-section-desc"
        initial={{ y: 120, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 240, damping: 70, mass: 1 }}
      >
        {text3}
      </motion.p>
    </>
  );
}
