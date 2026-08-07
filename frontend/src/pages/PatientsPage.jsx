// frontend/src/pages/PatientsPage.jsx
import KBPage from './KBPage.jsx';

const FIELDS = {
  id:      'patient_id',
  primary: null,
  preview: [
    { key: 'age',    label: 'Age' },
    { key: 'gender', label: 'Gender' },
    { key: 'blood_type', label: 'Blood Type' },
    { key: 'diagnoses',  label: 'Diagnoses' },
  ],
  detail: [
    { key: 'symptoms',    label: 'Symptoms' },
    { key: 'medications', label: 'Medications' },
  ],
  status: null,
};

export default function PatientsPage() {
  return <KBPage category="patients" title="Patients" singularLabel="patient" fields={FIELDS} />;
}
