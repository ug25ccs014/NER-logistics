import React from 'react';
import RouteSearch from './RouteSearch.jsx';
import RidePanel from './RidePanel.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

// The Home screen shows one "Route & Ride" tile; behind it these are
// still the same two independent components they always were (they
// talk to each other only through ActiveRouteContext).
export default function RouteAndRide() {
  const { t } = useLanguage();
  return (
    <>
      <RouteSearch />
      <RidePanel />
    </>
  );
}
