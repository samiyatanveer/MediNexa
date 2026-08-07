// frontend/src/pages/InventoryPage.jsx
import KBPage from './KBPage.jsx';

const FIELDS = {
  id:      'item_id',
  primary: 'item_name',
  preview: [
    { key: 'category', label: 'Category' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unit',     label: 'Unit' },
    { key: 'location', label: 'Location' },
  ],
  detail: [
    { key: 'reorder_level', label: 'Reorder Level' },
  ],
  status: 'status',
};

export default function InventoryPage() {
  return <KBPage category="inventory" title="Inventory" singularLabel="inventory" fields={FIELDS} />;
}
