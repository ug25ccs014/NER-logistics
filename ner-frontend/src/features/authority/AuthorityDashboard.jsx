import React from 'react';
import AllSegmentsLayer from './AllSegmentsLayer.jsx';
import DistrictStatus from './DistrictStatus.jsx';
import ReviewQueue from './ReviewQueue.jsx';
import Inbox from '../Inbox.jsx';
import AlertManagement from './AlertManagement.jsx';
import TripsOversight from './TripsOversight.jsx';

// Authority never sees driver/field-reporter panels -- except Chat/
// Inbox, which is the one section genuinely shared across all three
// roles (an authority user can message a stuck driver directly).
export default function AuthorityDashboard() {
  return (
    <>
      <AllSegmentsLayer />
      <DistrictStatus />
      <ReviewQueue />
      <Inbox />
      <AlertManagement />
      <TripsOversight />
    </>
  );
}
