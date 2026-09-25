import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import SectionTitle from '../components/SectionTitle';
import { featuresData } from '../data/features';
import type { IFeature } from '../types';

export default function FeaturesSection({ onGoToAuth }: { onGoToAuth?: () => void }) {
  return (
    <div id="features" className="px-section-container">
      <SectionTitle
        text1="Ledger Intelligence"
        text2="Everything Indian SMEs Need to Close Books"
        text3="From OCR invoice intake to gapless double-entry posting, automated IMS reconciliation, and probabilistic cash forecasts."
      />

      <div className="px-features-grid">
        {featuresData.map((feature: IFeature, index: number) => (
          <motion.div
            key={index}
            className={`px-feature-card-wrapper ${index === 1 ? 'is-highlighted' : ''}`}
            initial={{ y: 150, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.12, type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
          >
            <div className="px-feature-card">
              <div className="px-feature-icon">{feature.icon}</div>
              <h3 className="px-feature-title">{feature.title}</h3>
              <p className="px-feature-desc">{feature.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="px-features-showcase-box" id="preview">
        <div className="px-showcase-glow" />
        <motion.p
          className="px-showcase-quote"
          initial={{ y: 150, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
        >
          FinPilot strictly decouples arithmetic from generative models: the AI queries 24+ read-only tools against double-entry ledgers, delivering 100% mathematically proven accounting.
        </motion.p>

        <div className="px-showcase-grid">
          <motion.div
            className="px-showcase-left"
            initial={{ y: 150, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ type: 'spring', stiffness: 240, damping: 70, mass: 1 }}
          >
            <img
              className="px-showcase-img"
              src="/assets/features-showcase-1.png"
              alt="FinPilot ledger and dashboard preview"
              loading="lazy"
            />
          </motion.div>

          <motion.div
            className="px-showcase-right"
            initial={{ y: 150, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
          >
            <img
              src="/assets/features-showcase-2.png"
              alt="FinPilot cash runway analytics"
              className="px-showcase-img-2"
              loading="lazy"
            />
            <h3 className="px-showcase-heading">
              Audit-ready financial statements with zero manual reconciliations
            </h3>
            <p className="px-showcase-desc">
              Prevent deemed acceptance on GST IMS, scan supplier bills with high-confidence OCR, and simulate 13-week runway forecasts.
            </p>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onGoToAuth?.();
              }}
              className="px-showcase-link"
            >
              <span>Explore live product tour</span>
              <ArrowUpRight size={18} className="px-showcase-link-arrow" />
            </a>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
