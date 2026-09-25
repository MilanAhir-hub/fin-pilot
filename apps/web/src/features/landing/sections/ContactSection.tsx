import { ArrowRight, Mail, User } from 'lucide-react';
import { motion } from 'motion/react';
import SectionTitle from '../components/SectionTitle';

export default function ContactSection() {
  return (
    <div id="contact" className="px-section-container">
      <SectionTitle
        text1="Get in Touch"
        text2="Talk to an Accounting Engineer"
        text3="Have custom Schedule III charts, ERP migrations, or multi-branch GST questions? We're here to help."
      />
      <form
        onSubmit={(e) => e.preventDefault()}
        className="px-contact-form"
      >
        <motion.div
          className="px-form-field"
          initial={{ y: 150, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 320, damping: 70, mass: 1 }}
        >
          <label className="px-form-label">Your Name</label>
          <div className="px-input-group">
            <User className="px-input-icon" size={20} />
            <input
              name="name"
              type="text"
              placeholder="e.g. Rahul Sharma"
              className="px-text-input"
            />
          </div>
        </motion.div>

        <motion.div
          className="px-form-field"
          initial={{ y: 150, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 280, damping: 70, mass: 1 }}
        >
          <label className="px-form-label">Business Email</label>
          <div className="px-input-group">
            <Mail className="px-input-icon" size={20} />
            <input
              name="email"
              type="email"
              placeholder="e.g. rahul@company.in"
              className="px-text-input"
            />
          </div>
        </motion.div>

        <motion.div
          className="px-form-field sm-col-span-2"
          initial={{ y: 150, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 240, damping: 70, mass: 1 }}
        >
          <label className="px-form-label">How Can We Help?</label>
          <textarea
            name="message"
            rows={6}
            placeholder="Tell us about your transaction volume, GST entities, or current accounting software..."
            className="px-textarea"
          />
        </motion.div>

        <motion.button
          type="submit"
          className="px-contact-submit-btn"
          initial={{ y: 150, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 280, damping: 70, mass: 1 }}
        >
          <span>Send Inquiry</span>
          <ArrowRight size={18} />
        </motion.button>
      </form>
    </div>
  );
}
