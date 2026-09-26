import React from 'react';
import FieldReports from '../FieldReports.jsx';
import LiveLocationSos from '../LiveLocationSos.jsx';
import Inbox from '../Inbox.jsx';
import AlertsList from '../AlertsList.jsx';

// Same feature set as Driver minus route search (field reporters ground
// coordinate; they don't plan long-haul routes). LiveLocationSos reads
// apiRole from context, so it posts as 'field_official' automatically --
// no dropdown, no chance to mis-select.
export default function FieldReporterDashboard() {
  return (
    <>
      <FieldReports />
      <LiveLocationSos />
      <Inbox />
      <AlertsList />
    </>
  );
}
