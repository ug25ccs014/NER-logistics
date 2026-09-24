import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { TOOLS_BY_ROLE, translateTools } from '../config/tools.js';
import { useLanguage } from './LanguageContext.jsx';

// Drives the "Home screen full of tools -> pick one -> its own
// workspace opens (map only if that tool needs it)" flow, plus a
// browser-style back/forward stack so the <- / -> controls in the
// TopBar always have somewhere real to go.
//
// history is an array of tool ids, with `null` standing for Home.
// pointer is the current position in that array. Kept as one object
// so back/forward/navigate never race against each other's stale
// closures.
const NavigationContext = createContext(null);

export function NavigationProvider({ role, children }) {
  const { t } = useLanguage();
  // tool label/description are resolved through t() here so the tool
  // grid + TopBar breadcrumb re-translate whenever the language
  // changes, without ToolLauncher/ToolCard/TopBar needing to know
  // translation is happening at all -- see config/tools.js.
  const tools = useMemo(() => translateTools(TOOLS_BY_ROLE[role] || [], t), [role, t]);
  const [nav, setNav] = useState({ history: [null], pointer: 0 });

  const navigateTo = useCallback((id) => {
    setNav(({ history, pointer }) => {
      if (history[pointer] === id) return { history, pointer };
      const truncated = history.slice(0, pointer + 1);
      truncated.push(id);
      return { history: truncated, pointer: truncated.length - 1 };
    });
  }, []);

  const goHome = useCallback(() => navigateTo(null), [navigateTo]);

  const goBack = useCallback(() => {
    setNav(({ history, pointer }) => (pointer > 0 ? { history, pointer: pointer - 1 } : { history, pointer }));
  }, []);

  const goForward = useCallback(() => {
    setNav(({ history, pointer }) =>
      pointer < history.length - 1 ? { history, pointer: pointer + 1 } : { history, pointer }
    );
  }, []);

  const activeToolId = nav.history[nav.pointer];
  const activeTool = tools.find((tool) => tool.id === activeToolId) || null;
  const canGoBack = nav.pointer > 0;
  const canGoForward = nav.pointer < nav.history.length - 1;

  const value = {
    tools,
    activeTool,
    activeToolId,
    navigateTo,
    goHome,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside <NavigationProvider>');
  return ctx;
}
