import { useState, useEffect } from 'react';
import './landing.css';
import LenisScroll from './components/LenisScroll';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import HeroSection from './sections/HeroSection';
import FeaturesSection from './sections/FeaturesSection';
import TestimonialSection from './sections/TestimonialSection';
import PricingSection from './sections/PricingSection';
import ContactSection from './sections/ContactSection';
import CTASection from './sections/CTASection';
import { applyTheme, type Theme } from '../../lib/ui';

export function LandingPage({
  onGoToAuth,
  theme: propTheme,
  toggleTheme: propToggleTheme,
}: {
  onGoToAuth?: () => void;
  theme?: string;
  toggleTheme?: () => void;
}) {
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    if (propTheme === 'light' || propTheme === 'dark') return propTheme;
    if (typeof document !== 'undefined' && (document.documentElement.dataset.theme as Theme)) {
      return document.documentElement.dataset.theme as Theme;
    }
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('fp-theme') as Theme | null;
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'dark';
  });

  const handleToggleTheme = () => {
    if (propToggleTheme) {
      propToggleTheme();
    }
    const next: Theme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setCurrentTheme(next);
  };

  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement.dataset.theme !== currentTheme) {
      applyTheme(currentTheme);
    }
  }, [currentTheme]);

  return (
    <div className="pixels-landing-root" data-theme={currentTheme}>
      <LenisScroll />
      <Navbar
        onGoToAuth={onGoToAuth}
        theme={currentTheme}
        toggleTheme={handleToggleTheme}
      />
      <main>
        <HeroSection onGoToAuth={onGoToAuth} />
        <FeaturesSection onGoToAuth={onGoToAuth} />
        <TestimonialSection />
        <PricingSection onGoToAuth={onGoToAuth} />
        <ContactSection />
        <CTASection onGoToAuth={onGoToAuth} />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;
