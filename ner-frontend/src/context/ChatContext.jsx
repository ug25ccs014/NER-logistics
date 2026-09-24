import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

// Ported from the original app's Chat / Inbox system: a WhatsApp-style
// threaded conversation between any two sessions (driver, field
// officer, or authority), plus a shared inbox list and a "new
// message" toast. Centralized here so the inbox poll (every 10s) is
// the single source of truth for both the sidebar list and the toast
// -- avoids double-polling the same endpoint from two components.
const ChatContext = createContext(null);

function roleLabel(role) {
  return role === 'field_official' ? 'Field Official' : role === 'authority' ? 'Authority / Government' : 'Driver';
}

export function ChatProvider({ children }) {
  const { sessionId, role, apiRole } = useAuth();
  const chatRole = role === 'authority' ? 'authority' : apiRole || 'driver';

  const [convos, setConvos] = useState([]);
  const [partner, setPartner] = useState(null); // { session_id, name, role }
  const [notifyQueue, setNotifyQueue] = useState([]);
  const lastNotifiedAtRef = useRef({}); // other_session_id -> last last_message_at we've already toasted

  const unreadTotal = convos.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  const pollInbox = useCallback(async () => {
    try {
      const data = await api.chatInbox(sessionId);
      setConvos(data);

      // Toast the first time we see a new unread message from someone
      // whose thread isn't already open (opening a thread is what
      // marks it read, same as a phone).
      data.forEach((c) => {
        if (c.unread_count <= 0 || !c.last_message_at) return;
        if (lastNotifiedAtRef.current[c.other_session_id] === c.last_message_at) return;
        lastNotifiedAtRef.current[c.other_session_id] = c.last_message_at;
        if (partner && partner.session_id === c.other_session_id) return;
        setNotifyQueue((q) => [...q, c]);
      });
    } catch {
      // best-effort background polling
    }
  }, [sessionId, partner]);

  useEffect(() => {
    pollInbox();
    const id = setInterval(pollInbox, 10000);
    return () => clearInterval(id);
  }, [pollInbox]);

  const openChat = (otherSessionId, name, otherRole) => {
    if (!otherSessionId) return;
    setPartner({ session_id: otherSessionId, name: name || 'Unknown', role: otherRole });
  };

  const closeChat = () => {
    setPartner(null);
    pollInbox(); // refresh unread counts now that this thread was just read
  };

  const dismissNotify = () => setNotifyQueue((q) => q.slice(1));
  const replyFromNotify = () => {
    const n = notifyQueue[0];
    if (!n) return;
    setNotifyQueue((q) => q.slice(1));
    openChat(n.other_session_id, n.other_name, n.other_role);
  };

  const value = {
    sessionId,
    chatRole,
    convos,
    unreadTotal,
    partner,
    openChat,
    closeChat,
    notifyQueue,
    dismissNotify,
    replyFromNotify,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>');
  return ctx;
}

export { roleLabel };
