import React from 'react';
import AllSegmentsLayer from './AllSegmentsLayer.jsx';
import DistrictStatus from './DistrictStatus.jsx';

// AllSegmentsLayer renders nothing itself -- it just draws the whole
// monitored network onto the map -- so it's paired here with
// DistrictStatus, which is the actual sidebar content for this tile.
export default function NetworkOverview() {
  return (
    <>
      <AllSegmentsLayer />
      <DistrictStatus />
    </>
  );
}
