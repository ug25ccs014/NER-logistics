import React, { useRef } from 'react';
import FieldReportForm from './FieldReportForm.jsx';
import FieldReportsList from './FieldReportsList.jsx';

export default function FieldReports() {
  const listRef = useRef(null);
  return (
    <>
      <FieldReportForm onSubmitted={() => listRef.current?.reload()} />
      <FieldReportsList ref={listRef} />
    </>
  );
}
