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

export function LandingPage({
  onGoToAuth,
}: {
  onGoToAuth?: () => void;
  theme?: string;
  toggleTheme?: () => void;
}) {
  return (
    <div className="pixels-landing-root">
      <LenisScroll />
      <Navbar onGoToAuth={onGoToAuth} />
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
