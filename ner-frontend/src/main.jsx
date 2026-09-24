import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './AppRouter.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import { flushQueue } from './utils/offlineQueue.js';
import './styles/theme.css';

// Send anything captured while offline as soon as we have a connection
// -- on first load (in case the tab was left open through a dead zone)
// and again every time the browser fires 'online'.
flushQueue();
window.addEventListener('online', flushQueue);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
