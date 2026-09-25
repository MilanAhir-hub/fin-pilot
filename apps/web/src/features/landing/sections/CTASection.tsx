import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function CTASection({ onGoToAuth }: { onGoToAuth?: () => void }) {
  return (
    <motion.div
      className="px-cta-card"
      initial={{ y: 150, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
    >
      <div className="px-cta-content">
        <motion.h2
          className="px-cta-title"
          initial={{ y: 80, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 280, damping: 70, mass: 1 }}
        >
          Ready to put your books on autopilot?
        </motion.h2>
        <motion.p
          className="px-cta-sub"
          initial={{ y: 80, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 200, damping: 70, mass: 1 }}
        >
          Start your 30-day free trial today. Zero math hallucinations, 100% auditable double-entry precision.
        </motion.p>
      </div>
      <motion.button
        onClick={onGoToAuth}
        className="px-cta-btn"
        initial={{ y: 80, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 280, damping: 70, mass: 1 }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span>Get Started Now</span>
          <ArrowRight size={16} />
        </span>
      </motion.button>
    </motion.div>
  );
}
