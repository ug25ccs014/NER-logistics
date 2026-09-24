import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useChat, roleLabel } from '../context/ChatContext.jsx';

const QUICK_REPLIES = [
  '🆘 I need help',
  '📍 Sharing my location',
  "✅ I'm safe now",
  '⏳ On my way',
  '📞 Please call me',
  '🚧 Road blocked ahead',
];

export default function ChatPanel() {
  const { sessionId, name, setName } = useAuth();
  const { partner, closeChat, chatRole } = useChat();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const threadRef = useRef(null);
  const pollRef = useRef(null);

  const loadThread = async () => {
    if (!partner) return;
    try {
      const data = await api.chatThread(sessionId, partner.session_id);
      const el = threadRef.current;
      const wasAtBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 40 : true;
      setMessages(data);
      requestAnimationFrame(() => {
        if (wasAtBottom && threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
      });
    } catch {
      // best-effort background polling
    }
  };

  useEffect(() => {
    if (!partner) return;
    loadThread();
    pollRef.current = setInterval(loadThread, 5000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner]);

  if (!partner) return null;

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await api.chatSend({
        from_session_id: sessionId,
        from_name: name || 'Someone',
        from_role: chatRole,
        to_session_id: partner.session_id,
        to_name: partner.name,
        message: trimmed,
      });
      await loadThread();
    } catch (err) {
      alert(`Could not send message: ${err.message}`);
    }
  };

  const sendFromInput = () => {
    if (!input.trim()) return;
    const text = input;
    setInput('');
    send(text);
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 320, zIndex: 3500,
        background: 'var(--panel)', borderLeft: '2px solid var(--good)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 'bold' }}>{partner.name}</div>
          <div className="status-line">{roleLabel(partner.role)}</div>
        </div>
        <button onClick={closeChat} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
      </div>

      <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {messages.length === 0 && <div className="status-line">No messages yet -- say hello, or use a quick reply below.</div>}
        {messages.map((m, i) => {
          const mine = m.from_session_id === sessionId;
          const time = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          return (
            <div
              key={i}
              style={{
                padding: '6px 10px', borderRadius: 12, maxWidth: '80%', fontSize: 13, wordWrap: 'break-word',
                alignSelf: mine ? 'flex-end' : 'flex-start',
                background: mine ? 'var(--good)' : '#334155',
                color: mine ? '#0f172a' : 'var(--text)',
              }}
            >
              {m.message}
              <span style={{ display: 'block', fontSize: 10, opacity: 0.7, marginTop: 2 }}>{time}</span>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '8px 10px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            onClick={() => send(q)}
            style={{ background: '#334155', color: 'var(--text)', border: 'none', borderRadius: 999, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            {q}
          </button>
        ))}
      </div>

      <div style={{ padding: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <input
          className="text-input"
          style={{ flex: 1, marginBottom: 0 }}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendFromInput()}
        />
        <button className="btn btn-primary" style={{ width: 'auto', marginTop: 0, padding: '8px 14px', whiteSpace: 'nowrap' }} onClick={sendFromInput}>
          Send
        </button>
      </div>
    </div>
  );
}
