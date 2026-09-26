import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Counter from '../components/Counter.jsx';
import { useLanguage, LANGUAGES } from '../context/LanguageContext.jsx';
import '../styles/landing.css';

const FEATURES = [
  ['feat_map_title', 'feat_map_desc', '◈'],
  ['feat_predict_title', 'feat_predict_desc', '⌁'],
  ['feat_route_title', 'feat_route_desc', '↗'],
  ['feat_reports_title', 'feat_reports_desc', '⊙'],
  ['feat_tracking_title', 'feat_tracking_desc', '▣'],
  ['feat_offline_title', 'feat_offline_desc', '◎'],
];

const STATS = [
  ['stat_segments', 12000, '+'],
  ['stat_languages', 3, ''],
  ['stat_monitoring', 24, '/7'],
];

export default function LandingPage() {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className="landing">
      <div className="landing-noise" />
      <nav className="landing-nav">
        <Link to="/" className="brand-lockup">
          <span className="brand-mark">NER</span>
          <span><strong>{t('brand_name')}</strong><small>{t('brand_tagline')}</small></span>
        </Link>
        <div className="landing-nav-right">
          <label className="language-control">
            <span>文</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
          </label>
          <Link to="/login" className="nav-signin">{t('sign_in')} <span>↗</span></Link>
        </div>
      </nav>

      <main>
        <section className="landing-hero">
          <div className="hero-image" />
          <div className="hero-vignette" />
          <div className="hero-grid" />
          <motion.div className="hero-content"
            initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: .8, ease: [0.22,1,0.36,1] }}>
            <div className="eyebrow"><span className="pulse-dot" /> {t('eyebrow')}</div>
            <h1>{t('hero_title_start')} <em>{t('hero_title_accent')}</em></h1>
            <p>{t('hero_desc')}</p>
            <div className="hero-ctas">
              <Link to="/login" className="btn-hero-primary">{t('get_started')} <span>→</span></Link>
              <a href="#features" className="btn-hero-secondary">{t('see_how')} <span>↓</span></a>
            </div>
          </motion.div>
          <div className="hero-route-line"><span className="route-node node-a" /><span className="route-node node-b" /><span className="route-node node-c" /></div>
          <div className="hero-scroll">{t('landing_scroll')} <span>↓</span></div>
        </section>

        <section className="landing-section stats-section">
          <div className="section-kicker">{t('landing_network_label')}</div>
          <div className="stats-row">
            {STATS.map(([label, value, suffix]) => (
              <div className="stat-block" key={label}>
                <strong><Counter value={value} suffix={suffix} /></strong>
                <span>{t(label)}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="landing-section feature-section">
          <div className="section-heading">
            <div className="section-kicker">{t('landing_platform_label')}</div>
            <h2>{t('features_heading')}</h2>
            <p>{t('features_sub')}</p>
          </div>
          <div className="feature-story-image" aria-label="Live Northeast logistics network visualization">
            <div className="terrain-label"><span /> {t('landing_live_network')}</div>
            <div className="terrain-route">
              <i className="network-ping ping-a" />
              <i className="network-ping ping-b" />
              <i className="network-ping ping-c" />
              <span className="network-vehicle">◆</span>
            </div>
            <div className="network-rain rain-a" /><div className="network-rain rain-b" /><div className="network-rain rain-c" />
            <div className="network-legend"><span><i className="legend-dot safe"/> {t('landing_clear_corridor')}</span><span><i className="legend-dot watch"/> {t('landing_risk_watch')}</span><span><i className="legend-dot route"/> {t('landing_active_route')}</span></div>
          </div>
          <div className="feature-grid">
            {FEATURES.map(([titleKey, descKey, icon], i) => (
              <motion.article key={titleKey} className="feature-card"
                initial={{ opacity: 0, y: 35 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: .2 }} transition={{ duration: .55, delay: (i % 3) * .08 }}>
                <div className="feature-index">0{i + 1}</div>
                <div className="feature-icon">{icon}</div>
                <h3>{t(titleKey)}</h3>
                <p>{t(descKey)}</p>
                <span className="feature-arrow">↗</span>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="landing-section closing-section">
          <div className="closing-image" />
          <div className="closing-overlay" />
          <div className="closing-content">
            <div className="section-kicker">{t('landing_operate_label')}</div>
            <h2>{t('ready_heading')}</h2>
            <p>{t('ready_sub')}</p>
            <Link to="/login" className="btn-hero-primary">{t('sign_in_create')} <span>→</span></Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">{t('footer_text')} <span>•</span> {t('landing_ai_gis_field')}</footer>
    </div>
  );
}
