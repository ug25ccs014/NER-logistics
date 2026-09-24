import React, { useEffect } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { NavigationProvider, useNavigation } from './context/NavigationContext.jsx';
import { MapProvider } from './context/MapContext.jsx';
import { SegmentsProvider } from './context/SegmentsContext.jsx';
import { ActiveRouteProvider } from './context/ActiveRouteContext.jsx';
import { ChatProvider } from './context/ChatContext.jsx';
import { api } from './api.js';
import TopBar from './components/TopBar.jsx';
import ToolLauncher from './components/ToolLauncher.jsx';
import Workspace from './components/Workspace.jsx';
import NotificationsWatcher from './components/NotificationsWatcher.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import ChatMessageNotifyToast from './components/ChatMessageNotifyToast.jsx';
import RoadNamingPrompt from './components/RoadNamingPrompt.jsx';
import { LocationTrackingProvider } from './context/LocationTrackingContext.jsx';

// Roles that share live-location / SOS features also receive direct
// notifications (the "Notify" buttons elsewhere in the app send to
// these). Authority doesn't participate in that system -- but DOES
// get Chat/Inbox, which all three roles share.
const NOTIFIED_ROLES = new Set(['driver', 'field_reporter', 'authority']);

// Home screen (ToolLauncher: HeroBanner + tool grid) when no tool is
// selected, that tool's own Workspace (panel, +map if needsMap) once
// one is -- Workspace itself returns null when activeTool is null,
// so this is the single place that picks between the two.
function MainArea() {
  const { activeTool } = useNavigation();
  return activeTool ? <Workspace /> : <ToolLauncher />;
}

// AppRouter's ProtectedApp only renders this component once
// isAuthenticated is true, so `role` is guaranteed to be set here --
// no login overlay to fall back to anymore (that's the /login route).
export default function App() {
  const { role, sessionId } = useAuth();

  // "Presence" heartbeat for the AI dashcam's auto-alert targeting.
  // /ai/session (db.register_ai_session) upserts session_id+account_id
  // +role+last_seen_at, and _notify_ai_incident's
  // fetch_ai_sessions_for_roles(['field_official','authority']) only
  // ever finds people in THAT table, active in the last 5 minutes.
  // LiveDashcamAI.jsx already calls this once when someone opens the
  // dashcam tool itself -- but a field officer or authority user
  // never opens the driver's dashcam, so they never appeared there at
  // all, and every AI alert had nobody to actually notify. Calling it
  // here instead, at the app shell level, means ANYONE logged in --
  // on any tool, not just the dashcam -- keeps a fresh presence
  // record, so they're a valid alert target as long as the app is
  // open in a tab somewhere.
  useEffect(() => {
    if (!sessionId) return;
    const heartbeat = () => api.registerAISession(sessionId).catch(() => {});
    heartbeat();
    const id = setInterval(heartbeat, 120000); // comfortably inside the 5-minute "active" window
    return () => clearInterval(id);
  }, [sessionId]);

  return (
    <LocationTrackingProvider>
      <NavigationProvider role={role}>
      <SegmentsProvider>
        <ChatProvider>
          <MapProvider>
            <ActiveRouteProvider>
              <div className="app-shell">
                <TopBar />
                <MainArea />
                {NOTIFIED_ROLES.has(role) && <NotificationsWatcher />}
                <ChatMessageNotifyToast />
                <RoadNamingPrompt />
                <ChatPanel />
              </div>
            </ActiveRouteProvider>
          </MapProvider>
        </ChatProvider>
      </SegmentsProvider>
      </NavigationProvider>
    </LocationTrackingProvider>
  );
}
