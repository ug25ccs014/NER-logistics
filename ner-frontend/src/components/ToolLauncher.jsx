import React from 'react';
import { useNavigation } from '../context/NavigationContext.jsx';
import HeroBanner from './HeroBanner.jsx';
import ToolCard from './ToolCard.jsx';

// The new front page. No map here on purpose -- this is the "pick a
// tool" screen; the map only appears once a tool that needs it is
// open (see Workspace.jsx), the same way Google Maps shows search/
// saved-places first and only opens the full map once you commit to
// a destination.
export default function ToolLauncher() {
  const { tools, navigateTo } = useNavigation();

  return (
    <div className="launcher">
      <HeroBanner />
      <div className="launcher-grid">
        {tools.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} index={i} onOpen={() => navigateTo(tool.id)} />
        ))}
      </div>
    </div>
  );
}
