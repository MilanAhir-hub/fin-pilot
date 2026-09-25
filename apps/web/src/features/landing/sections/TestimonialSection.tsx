import Marquee from 'react-fast-marquee';
import SectionTitle from '../components/SectionTitle';
import TestimonialCard from '../components/TestimonialCard';
import { testimonialsData } from '../data/testimonial';
import type { ITestimonial } from '../types';

export default function TestimonialSection() {
  const combined = [...testimonialsData, ...testimonialsData];

  return (
    <div id="testimonials" className="px-section-container">
      <SectionTitle
        text1="Customer Proof"
        text2="Loved by Founders & Chartered Accountants"
        text3="Over 4,000 Indian businesses and audit firms trust FinPilot to manage ₹840Cr+ in monthly ledger entries with zero math hallucinations."
      />

      <div className="px-testimonials-marquee-wrapper">
        <Marquee
          className="px-marquee"
          gradient={true}
          speed={25}
          gradientColor="#08090b"
        >
          <div className="px-marquee-inner">
            {combined.map((testimonial: ITestimonial, index: number) => (
              <TestimonialCard key={`row1-${index}`} index={index} testimonial={testimonial} />
            ))}
          </div>
        </Marquee>

        <Marquee
          className="px-marquee"
          gradient={true}
          speed={25}
          direction="right"
          gradientColor="#08090b"
        >
          <div className="px-marquee-inner">
            {combined.map((testimonial: ITestimonial, index: number) => (
              <TestimonialCard key={`row2-${index}`} index={index} testimonial={testimonial} />
            ))}
          </div>
        </Marquee>
      </div>
    </div>
  );
}
