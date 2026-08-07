// frontend/src/pages/MedicinesPage.jsx
import KBPage from './KBPage.jsx';

const FIELDS = {
  id:      'medicine_id',
  primary: 'name',
  preview: [
    { key: 'dosage',    label: 'Dosage' },
    { key: 'form',      label: 'Form' },
    { key: 'indications', label: 'Indications' },
  ],
  detail: [
    { key: 'contraindications', label: 'Contraindications' },
    { key: 'stock_units',       label: 'Stock' },
    { key: 'expiry_date',       label: 'Expiry' },
  ],
  status: null,
};

export default function MedicinesPage() {
  return <KBPage category="medicines" title="Medicines" singularLabel="medicine" fields={FIELDS} />;
}
