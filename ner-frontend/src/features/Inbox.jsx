import React from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useChat } from '../context/ChatContext.jsx';

function partnerEmoji(role) {
  return role === 'field_official' ? '👮' : role === 'authority' ? '🏛️' : role === 'driver' ? '🚚' : '💬';
}

// Sidebar "Messages" section -- available to Driver, Field Reporter,
// AND Authority (the only truly shared section across all three roles).
export default function Inbox() {
  const { t } = useLanguage();
  const { name, setName } = useAuth();
  const { convos, unreadTotal, openChat } = useChat();

  return (
    <div>
      <div className="section-title">
        💬 {t('messages')}{' '}
        {unreadTotal > 0 && (
          <span style={{ background: 'var(--danger)', color: 'white', borderRadius: 999, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
            {unreadTotal}
          </span>
        )}
      </div>
      <input
        className="text-input"
        placeholder={t('chat_name_ph')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {convos.length === 0 && <div className="status-line">{t('no_conversations')}</div>}
      {convos.map((c) => (
        <div className="card" key={c.other_session_id} onClick={() => openChat(c.other_session_id, c.other_name, c.other_role)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ overflow: 'hidden' }}>
              <b>{partnerEmoji(c.other_role)} {c.other_name || 'Unknown'}</b>
              <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.last_message}
              </div>
            </div>
            {c.unread_count > 0 && (
              <span style={{ background: 'var(--danger)', color: 'white', borderRadius: 999, padding: '2px 7px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {c.unread_count}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
