import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import SectionTitle from '../components/SectionTitle';
import { pricingData } from '../data/pricing';
import type { IPricing } from '../types';

export default function PricingSection({ onGoToAuth }: { onGoToAuth?: () => void }) {
  return (
    <div id="pricing" className="px-section-container">
      <SectionTitle
        text1="Transparent Pricing"
        text2="Plans Built for High-Growth Indian SMEs"
        text3="Simple, predictable pricing with zero hidden fees. Scale as your transaction volume and GST registrations grow."
      />

      <div className="px-pricing-grid">
        {pricingData.map((plan: IPricing, index: number) => (
          <motion.div
            key={index}
            className={`px-pricing-card ${plan.mostPopular ? 'is-popular' : ''}`}
            initial={{ y: 150, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.15, type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
          >
            {plan.mostPopular && (
              <span className="px-pricing-badge">Most Popular</span>
            )}
            <p className="px-pricing-name">{plan.name}</p>
            <h4 className="px-pricing-price">
              ₹{plan.price.toLocaleString('en-IN')}
              <span className="px-pricing-period">/{plan.period}</span>
            </h4>
            <ul className="px-pricing-features">
              {plan.features.map((feature, fIndex) => (
                <li key={fIndex} className="px-pricing-feature-item">
                  <Check className="px-check-icon" size={18} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={onGoToAuth}
              className={`px-pricing-btn ${plan.mostPopular ? 'btn-popular' : 'btn-normal'}`}
            >
              Get Started
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
