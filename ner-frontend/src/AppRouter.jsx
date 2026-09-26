import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import App from './App.jsx';
import { useAuth } from './context/AuthContext.jsx';

// Simple auth gate: renders the dashboard only if login()/register()
// has actually set a token + role. Anyone hitting /app directly
// without one is bounced to /login rather than seeing a broken shell.
function ProtectedApp() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <App />;
}

// Mirror image of ProtectedApp: the landing page and login form are
// only useful to someone who ISN'T logged in. If a "Remember me"
// session is already sitting in localStorage/sessionStorage (see
// AuthContext.jsx), send them straight to the dashboard instead --
// that's the whole point of remembering them.
function PublicOnly({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/app" element={<ProtectedApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
