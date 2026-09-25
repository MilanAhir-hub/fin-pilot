import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { footerData } from '../data/footer';
import type { IFooterLink } from '../types';

export default function Footer() {
  return (
    <footer className="px-footer">
      <motion.div
        className="px-footer-left"
        initial={{ x: -150, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 280, damping: 70, mass: 1 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <a
            href="#"
            className="px-brand-logo"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <span className="px-brand-icon">
              <Sparkles size={17} color="#ffffff" />
            </span>
            <span className="px-brand-text">
              Fin<span className="px-brand-accent">Pilot</span>
            </span>
            <span className="px-brand-tag">AI</span>
          </a>
          <p style={{ maxWidth: '18rem', color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
            Automated double-entry accounting and GST IMS 2.0 reconciliation for Indian SMEs.
          </p>
        </div>

        {footerData.map((section, index) => (
          <div key={index} className="px-footer-col">
            <p className="px-footer-col-title">{section.title}</p>
            <ul className="px-footer-col-links">
              {section.links.map((link: IFooterLink, lIndex: number) => (
                <li key={lIndex}>
                  <a href={link.href} className="px-footer-link">
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </motion.div>

      <motion.div
        className="px-footer-right"
        initial={{ x: 150, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 280, damping: 70, mass: 1 }}
      >
        <p className="px-footer-tagline">
          Zero AI math hallucinations. Complete Schedule III double-entry ledger precision.
        </p>
        <div className="px-footer-socials">
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
          >
            <svg
              className="px-social-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
              <rect x="2" y="9" width="4" height="12" />
              <circle cx="4" cy="4" r="2" />
            </svg>
          </a>
          <a
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            aria-label="Twitter"
          >
            <svg
              className="px-social-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
            </svg>
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
          >
            <svg
              className="px-social-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </a>
        </div>
        <p className="px-footer-copy">
          &copy; {new Date().getFullYear()} FinPilot Technologies Pvt. Ltd. All rights reserved.
        </p>
      </motion.div>
    </footer>
  );
}
