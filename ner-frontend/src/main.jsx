import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './AppRouter.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { flushQueue } from './utils/offlineQueue.js';
import OfflineStatus from './components/OfflineStatus.jsx';
import './styles/theme.css';

// Send anything captured while offline as soon as we have a connection
// -- on first load (in case the tab was left open through a dead zone)
// and again every time the browser fires 'online'.
flushQueue();
window.addEventListener('online', flushQueue);

// Service worker: makes the app installable and lets it open with no signal.
// Production only -- in dev it would cache stale modules and confuse hot reload.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <AppRouter />
        <OfflineStatus />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
