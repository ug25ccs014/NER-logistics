import React from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useChat } from '../context/ChatContext.jsx';

function partnerEmoji(role) {
  return role === 'field_official' ? '👮' : role === 'authority' ? '🏛️' : role === 'driver' ? '🚚' : '💬';
}

// Pops when a new chat message arrives and that thread isn't already
// open -- separate from NotificationsWatcher's one-shot "Notify"
// toast, since this is for the threaded Chat system.
export default function ChatMessageNotifyToast() {
  const { t } = useLanguage();
  const { notifyQueue, dismissNotify, replyFromNotify } = useChat();
  if (notifyQueue.length === 0) return null;
  const n = notifyQueue[0];

  return (
    <div
      style={{
        position: 'fixed', top: 200, right: 20, zIndex: 2075,
        background: '#173A59', border: '2px solid var(--good)', borderRadius: 10,
        padding: 14, maxWidth: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        color: '#FFFFE3',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#9FE4D2', marginBottom: 6 }}>{t('new_message')}</div>
      <div>
        <b>{partnerEmoji(n.other_role)} {n.other_name || 'Someone'}</b>
        <br />
        {(n.last_message || '').slice(0, 120)}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button className="btn btn-primary" style={{ margin: 0 }} onClick={replyFromNotify}>{t('reply')}</button>
        <button className="btn" style={{ margin: 0, background: '#3a3a4a', color: '#fff' }} onClick={dismissNotify}>{t('dismiss_btn')}</button>
      </div>
    </div>
  );
}
