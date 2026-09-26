import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useSpring } from 'framer-motion';
import TiltCard from '../components/TiltCard.jsx';
import Counter from '../components/Counter.jsx';
import { useLanguage, LANGUAGES } from '../context/LanguageContext.jsx';
import '../styles/landing.css';

// Keys resolved through t() at render time, not literal copy -- so this
// list re-translates automatically whenever the language changes.
const FEATURES = [
  { icon: '🗺️', titleKey: 'feat_map_title', descKey: 'feat_map_desc' },
  { icon: '🌧️', titleKey: 'feat_predict_title', descKey: 'feat_predict_desc' },
  { icon: '🧭', titleKey: 'feat_route_title', descKey: 'feat_route_desc' },
  { icon: '📍', titleKey: 'feat_field_title', descKey: 'feat_field_desc' },
  { icon: '🚚', titleKey: 'feat_gps_title', descKey: 'feat_gps_desc' },
  { icon: '🌐', titleKey: 'feat_offline_title', descKey: 'feat_offline_desc' },
];

const STATS = [
  { value: 12000, suffix: '+', labelKey: 'stat_segments' },
  { value: 3, labelKey: 'stat_languages' },
  { value: 24, suffix: '/7', labelKey: 'stat_monitoring' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

export default function LandingPage() {
  const { lang, setLang, t } = useLanguage();
  const { scrollYProgress } = useScroll();
  const scrollBar = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.2 });

  return (
    <div className="landing">
      <motion.div className="scroll-progress" style={{ scaleX: scrollBar }} />
      <div className="landing-terrain" />
      <div className="landing-glow" />

      <nav className="landing-nav">
        <span className="brand">🛣️ {t('brand_name')}</span>
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
          <Link to="/login" className="cta-link">{t('sign_in')}</Link>
        </div>
      </nav>

      <motion.header
        className="landing-hero"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <span className="eyebrow">{t('eyebrow')}</span>
        <h1>
          {t('hero_title_start')} <span className="accent-text">{t('hero_title_accent')}</span>
        </h1>

        {/* Signature move: a route being traced across the hero, the
            one bespoke interaction unique to this page. Pure SVG/CSS,
            no extra assets or libraries. */}
        <svg className="hero-route" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="hero-route-track"
            d="M0,45 C 90,10 150,50 220,28 C 300,2 360,44 430,22 C 490,4 540,30 600,14"
          />
          <path
            className="hero-route-line"
            d="M0,45 C 90,10 150,50 220,28 C 300,2 360,44 430,22 C 490,4 540,30 600,14"
          />
          <circle className="hero-route-dot" r="5">
            <animateMotion
              dur="6s"
              repeatCount="indefinite"
              path="M0,45 C 90,10 150,50 220,28 C 300,2 360,44 430,22 C 490,4 540,30 600,14"
            />
          </circle>
        </svg>

        <p>{t('hero_desc')}</p>
        <div className="hero-ctas">
          <Link to="/login" className="btn-hero-primary">{t('get_started')}</Link>
          <a href="#features" className="btn-hero-secondary">{t('see_how')}</a>
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
            <div className="stat-block" key={s.labelKey}>
              <span className="stat-number">
                <Counter value={s.value} suffix={s.suffix || ''} />
              </span>
              <span className="stat-label">{t(s.labelKey)}</span>
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
          <h2>{t('features_heading')}</h2>
          <p className="section-sub">{t('features_sub')}</p>
        </motion.div>

        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.titleKey}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.08, ease: 'easeOut' }}
            >
              <TiltCard>
                <div className="feature-card-inner">
                  <div className="feature-icon">{f.icon}</div>
                  <h3>{t(f.titleKey)}</h3>
                  <p>{t(f.descKey)}</p>
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
        <h2>{t('ready_heading')}</h2>
        <p className="section-sub">{t('ready_sub')}</p>
        <Link to="/login" className="btn-hero-primary">{t('sign_in_create')}</Link>
      </motion.section>

      <footer className="landing-footer">
        {t('footer_text')}
      </footer>
    </div>
  );
}
