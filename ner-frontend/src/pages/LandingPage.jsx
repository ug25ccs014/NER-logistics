import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import TiltCard from '../components/TiltCard.jsx';
import Counter from '../components/Counter.jsx';
import { useLanguage, LANGUAGES } from '../context/LanguageContext.jsx';
import '../styles/landing.css';

const FEATURES = [
  { icon: '🗺️', title: 'Live Accessibility Map', desc: 'Real-time road, bridge, and district connectivity status across the North Eastern Region, updated as conditions change.' },
  { icon: '🌧️', title: 'Disruption Prediction', desc: 'Rainfall and terrain-slope risk scoring flags landslide- and flood-prone stretches before they become impassable.' },
  { icon: '🧭', title: 'Fastest vs Safest Routing', desc: 'AI-assisted alternate-route suggestions weigh real road geometry against current risk, not just distance.' },
  { icon: '📍', title: 'Geo-tagged Field Reports', desc: 'Field officers and drivers upload photos and incident reports straight from the ground, even with no signal.' },
  { icon: '🚚', title: 'GPS Cargo Tracking', desc: 'Live tracking for vehicles carrying medicine, food, construction material, and agricultural produce.' },
  { icon: '🌐', title: 'Multilingual & Offline-first', desc: 'English, Hindi, and Assamese support, with field reports queued locally and synced once connectivity returns.' },
];

const STATS = [
  { value: 12000, suffix: '+', label: 'Road segments mapped' },
  { value: 3, label: 'Languages supported' },
  { value: 24, suffix: '/7', label: 'Risk monitoring' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export default function LandingPage() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="landing">
      <div className="landing-glow" />

      <nav className="landing-nav">
        <span className="brand">🛣️ NER Logistics Intelligence</span>
        <div className="landing-nav-right">
          <select
            className="landing-lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            title="Language / भाषा / ভাষা"
          >
            {LANGUAGES.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <Link to="/login" className="cta-link">Sign in</Link>
        </div>
      </nav>

      <motion.header
        className="landing-hero"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <span className="eyebrow">AI + GIS for North East India</span>
        <h1>
          Keep essential goods moving through <span className="accent-text">India's toughest terrain</span>
        </h1>
        <p>
          A logistics accessibility platform that predicts road disruptions, tracks cargo,
          and coordinates field reports in real time — built for the North Eastern Region's
          landslides, floods, and low-connectivity zones.
        </p>
        <div className="hero-ctas">
          <Link to="/login" className="btn-hero-primary">Get Started</Link>
          <a href="#features" className="btn-hero-secondary">See how it works</a>
        </div>
      </motion.header>

      <motion.section
        className="landing-section"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-100px' }}
        variants={fadeUp}
      >
        <div className="stats-row">
          {STATS.map((s) => (
            <div className="stat-block" key={s.label}>
              <span className="stat-number">
                <Counter value={s.value} suffix={s.suffix || ''} />
              </span>
              <span className="stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <section id="features" className="landing-section">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-100px' }}
          variants={fadeUp}
        >
          <h2>Everything a control room needs, in one place</h2>
          <p className="section-sub">
            Built around the North East's real operating conditions, not a generic logistics template.
          </p>
        </motion.div>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08, ease: 'easeOut' }}
            >
              <TiltCard>
                <div className="feature-card-inner">
                  <div className="feature-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </section>

      <motion.section
        className="landing-section"
        style={{ textAlign: 'center' }}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-100px' }}
        variants={fadeUp}
      >
        <h2>Ready to see the map?</h2>
        <p className="section-sub">Sign in as a driver, field reporter, or authority to get started.</p>
        <Link to="/login" className="btn-hero-primary">Sign in / Create account</Link>
      </motion.section>

      <footer className="landing-footer">
        NER Logistics Accessibility Intelligence Platform — built for the North Eastern Region.
      </footer>
    </div>
  );
}
