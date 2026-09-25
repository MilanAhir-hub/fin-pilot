import { Check, ChevronRight, Play, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import TiltedImage from '../components/TiltImage';

export default function HeroSection({ onGoToAuth }: { onGoToAuth?: () => void }) {
  const specialFeatures = [
    'Schedule III Indian Chart',
    'Append-Only Reversible Entries',
    'Zero AI Math Hallucinations',
    '1-Click GST IMS Reconciliation',
  ];

  return (
    <div className="px-hero-section">
      <div className="px-hero-ambient-glow" />
      <motion.a
        href="#features"
        className="px-hero-badge"
        initial={{ y: -20, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
      >
        <span className="px-hero-badge-tag">GST IMS 2.0</span>
        <p className="px-hero-badge-text">
          <span>Automated Accounting for Indian SMEs</span>
          <ChevronRight size={15} className="px-hero-badge-arrow" />
        </p>
      </motion.a>

      <motion.h1
        className="px-hero-heading"
        initial={{ y: 50, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 240, damping: 70, mass: 1 }}
      >
        Books on Autopilot.{' '}
        <span className="move-gradient px-hero-gradient-text">Math You Can Bet On.</span>
      </motion.h1>

      <motion.p
        className="px-hero-subtitle"
        initial={{ y: 50, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
      >
        Double-entry ledger precision paired with an AI Copilot that narrates what the engine computes
        — never hallucinating numbers. Automate GST IMS reconciliation, scan bills with OCR, and forecast cash runway in seconds.
      </motion.p>

      <motion.div
        className="px-hero-buttons"
        initial={{ y: 50, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
      >
        <button onClick={onGoToAuth} className="px-btn-primary">
          <span>Get Started / Sign In</span>
          <ArrowRight size={16} />
        </button>
        <a
          href="#features"
          className="px-btn-outline"
        >
          <Play size={15} fill="currentColor" />
          <span>Product Tour</span>
        </a>
      </motion.div>

      <div className="px-hero-features">
        {specialFeatures.map((feature, index) => (
          <motion.p
            className="px-hero-feature-item"
            key={index}
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.2, duration: 0.3 }}
          >
            <Check className="px-check-icon" size={18} />
            <span className="px-feature-label">{feature}</span>
          </motion.p>
        ))}
      </div>

      <TiltedImage />
    </div>
  );
}
