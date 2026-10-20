import { useState } from 'react';
import { Menu, X, Sparkles, ArrowRight, Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';
import { navlinks } from '../data/navlinks';
import type { INavLink } from '../types';

export default function Navbar({
  onGoToAuth,
  theme = 'dark',
  toggleTheme,
}: {
  onGoToAuth?: () => void;
  theme?: string;
  toggleTheme?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleLinkClick = (href: string) => {
    setIsOpen(false);
    if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else if (href === '#') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const isLight = theme === 'light';

  return (
    <>
      <motion.nav
        className="px-navbar"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 250, damping: 70, mass: 1 }}
      >
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

        <div className="px-nav-links-desktop">
          {navlinks.map((link: INavLink) => (
            <a
              key={link.name}
              href={link.href}
              className="px-nav-link"
              onClick={(e) => {
                if (link.href.startsWith('#')) {
                  e.preventDefault();
                  handleLinkClick(link.href);
                }
              }}
            >
              {link.name}
            </a>
          ))}
        </div>

        <div className="px-nav-actions-desktop">
          {toggleTheme && (
            <button
              type="button"
              onClick={toggleTheme}
              className="px-theme-toggle-btn"
              title={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
              aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
              id="landing-bright-mode-toggle"
            >
              {isLight ? (
                <>
                  <Moon size={16} className="px-theme-icon" />
                  <span className="px-theme-label">Dark</span>
                </>
              ) : (
                <>
                  <Sun size={16} className="px-theme-icon" />
                  <span className="px-theme-label">Bright</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={onGoToAuth}
            className="px-nav-cta-desktop"
          >
            <span>Get Started / Sign In</span>
            <ArrowRight size={15} />
          </button>
        </div>

        <div className="px-nav-actions-mobile">
          {toggleTheme && (
            <button
              type="button"
              onClick={toggleTheme}
              className="px-theme-toggle-btn px-theme-toggle-mobile"
              title={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
              aria-label={isLight ? 'Switch to Dark Mode' : 'Switch to Bright Mode'}
            >
              {isLight ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          )}

          <button
            onClick={() => setIsOpen(true)}
            className="px-nav-mobile-toggle"
            aria-label="Open navigation menu"
          >
            <Menu size={26} />
          </button>
        </div>
      </motion.nav>

      {/* Mobile Drawer */}
      <div className={`px-mobile-drawer ${isOpen ? 'is-open' : ''}`}>
        <div className="px-brand-logo" style={{ marginBottom: '1rem' }}>
          <span className="px-brand-icon">
            <Sparkles size={17} color="#ffffff" />
          </span>
          <span className="px-brand-text">
            Fin<span className="px-brand-accent">Pilot</span>
          </span>
          <span className="px-brand-tag">AI</span>
        </div>

        {navlinks.map((link: INavLink) => (
          <a
            key={link.name}
            href={link.href}
            className="px-mobile-link"
            onClick={(e) => {
              if (link.href.startsWith('#')) {
                e.preventDefault();
                handleLinkClick(link.href);
              } else {
                setIsOpen(false);
              }
            }}
          >
            {link.name}
          </a>
        ))}

        {toggleTheme && (
          <button
            type="button"
            onClick={() => {
              toggleTheme();
            }}
            className="px-theme-toggle-btn px-mobile-theme-btn"
          >
            {isLight ? (
              <>
                <Moon size={18} />
                <span>Switch to Dark Mode</span>
              </>
            ) : (
              <>
                <Sun size={18} />
                <span>Switch to Bright Mode</span>
              </>
            )}
          </button>
        )}

        <button
          onClick={() => {
            setIsOpen(false);
            onGoToAuth?.();
          }}
          className="px-btn-primary"
          style={{ marginTop: '0.5rem' }}
        >
          <span>Get Started / Sign In</span>
          <ArrowRight size={16} />
        </button>

        <button
          onClick={() => setIsOpen(false)}
          className="px-mobile-close-btn"
          aria-label="Close navigation menu"
        >
          <X size={22} />
        </button>
      </div>
    </>
  );
}
