import React from 'react';
import RouteSearch from '../RouteSearch.jsx';
import RidePanel from '../RidePanel.jsx';
import FieldReports from '../FieldReports.jsx';
import LiveLocationSos from '../LiveLocationSos.jsx';
import Inbox from '../Inbox.jsx';
import ShipmentBoard from '../ShipmentBoard.jsx';
import NearbyAccommodations from '../NearbyAccommodations.jsx';
import AlertsList from '../AlertsList.jsx';

// Full Driver feature set, ported from the original app's
// data-roles="driver" / "driver,field_reporter" sections -- but as a
// dedicated component tree instead of shared markup with bits hidden.
export default function DriverDashboard() {
  return (
    <>
      <RouteSearch />
      <RidePanel />
      <FieldReports />
      <LiveLocationSos />
      <Inbox />
      <ShipmentBoard />
      <NearbyAccommodations />
      <AlertsList />
    </>
  );
}
