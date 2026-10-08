import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { pendingCount, flushQueue } from '../utils/offlineQueue.js';

// Small floating status pill (bottom-centre, above the map) that tells the
// person, honestly, what state the app is in:
//   - offline / server unreachable -> "showing saved data from <time>"
//   - field reports waiting on this device -> count + "Send now"
//   - reports just delivered -> brief confirmation
// Colours are explicit (not theme variables) so it's readable on any theme.
const fmt = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—');

export default function OfflineStatus() {
  const { t } = useLanguage();
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [data, setData] = useState({ stale: false, savedAt: null });
  const [pending, setPending] = useState(pendingCount());
  const [justSent, setJustSent] = useState(0);
  const [sending, setSending] = useState(false);

  const sync = useCallback(async () => {
    if (!pendingCount() || sending) return;
    setSending(true);
    try {
      const { sent } = await flushQueue();
      if (sent > 0) { setJustSent(sent); setTimeout(() => setJustSent(0), 5000); }
    } finally {
      setSending(false);
      setPending(pendingCount());
    }
  }, [sending]);

  useEffect(() => {
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    const onQueue = (e) => setPending(e.detail?.pending ?? pendingCount());
    const onData = (e) => setData(e.detail || {});
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    window.addEventListener('ner-queue-changed', onQueue);
    window.addEventListener('ner-data-status', onData);
    // "online" can be true with no real connection (weak hill signal), so retry on a timer too.
    const id = setInterval(() => { if (navigator.onLine && pendingCount()) sync(); }, 30000);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      window.removeEventListener('ner-queue-changed', onQueue);
      window.removeEventListener('ner-data-status', onData);
      clearInterval(id);
    };
  }, [sync]);

  const offline = !online || data.stale;
  if (!offline && !pending && !justSent) return null;

  const base = {
    position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 14, zIndex: 3000,
    maxWidth: 'min(560px, calc(100vw - 24px))', padding: '9px 14px', borderRadius: 12,
    fontSize: 13, fontWeight: 600, lineHeight: 1.35, boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
  };
  const look = offline
    ? { background: '#7A4B00', color: '#FFFFFF', border: '1px solid #F5B942' }
    : justSent
      ? { background: '#14532D', color: '#FFFFFF', border: '1px solid #4ADE80' }
      : { background: '#1E3A5F', color: '#FFFFFF', border: '1px solid #7DB7FF' };

  return (
    <div role="status" aria-live="polite" style={{ ...base, ...look }}>
      {offline && (
        <span>
          📴 {(online ? t('off_server_unreachable') : t('off_offline_msg')).replace('{time}', fmt(data.savedAt))}
        </span>
      )}
      {pending > 0 && (
        <span>
          {offline ? '' : '⏳ '}{t('off_pending').replace('{n}', pending)}
        </span>
      )}
      {!offline && justSent > 0 && pending === 0 && <span>✓ {t('off_synced').replace('{n}', justSent)}</span>}
      {pending > 0 && online && (
        <button
          type="button" onClick={sync} disabled={sending}
          style={{ background: '#FFFFFF', color: '#18324A', border: 0, borderRadius: 8, padding: '4px 10px', fontWeight: 700, cursor: 'pointer' }}
        >
          {sending ? '…' : t('off_send_now')}
        </button>
      )}
    </div>
  );
}
