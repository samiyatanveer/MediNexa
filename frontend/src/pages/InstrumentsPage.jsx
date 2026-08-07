// frontend/src/pages/InstrumentsPage.jsx
import KBPage from './KBPage.jsx';

const FIELDS = {
  id:      'instrument_id',
  primary: 'name',
  preview: [
    { key: 'category',   label: 'Category' },
    { key: 'department', label: 'Department' },
    { key: 'location',   label: 'Location' },
  ],
  detail: [
    { key: 'last_calibration', label: 'Last Calibration' },
    { key: 'next_calibration', label: 'Next Calibration' },
  ],
  status: 'operational_status',
};

export default function InstrumentsPage() {
  return <KBPage category="instruments" title="Instruments" singularLabel="instrument" fields={FIELDS} />;
}
