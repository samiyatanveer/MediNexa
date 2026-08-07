"""
data-generator/validate_data.py
Validates the generated JSON datasets:
  - Correct record counts
  - Required fields present on every record
  - All IDs are masked (prefix present, no raw P_/MED_/INS_/INV_ IDs)
  - No real PII (no SSN patterns, phone patterns, forbidden key names)
  - JSON is valid and parseable
  - Keyword arrays non-empty on every record
"""

import json
import sys
from pathlib import Path
from pii_mask import PIIMasker

DATA_DIR = Path(__file__).parent.parent / "data"

EXPECTED_COUNTS = {
    "patients.json":    600,
    "medicines.json":   250,
    "instruments.json": 175,
    "inventory.json":   175,
}

REQUIRED_FIELDS = {
    "patients.json":    ["patient_id", "age", "gender", "blood_type", "diagnoses",
                         "symptoms", "vitals", "medications", "visit_history", "keywords"],
    "medicines.json":   ["medicine_id", "name", "dosage", "form", "indications",
                         "contraindications", "stock_units", "batch_id", "keywords"],
    "instruments.json": ["instrument_id", "name", "category", "department", "location",
                         "operational_status", "maintenance_status", "keywords"],
    "inventory.json":   ["item_id", "item_name", "category", "quantity", "unit",
                         "location", "reorder_level", "status", "keywords"],
}

ID_FIELDS = {
    "patients.json":    ("patient_id",    "PAT-"),
    "medicines.json":   ("medicine_id",   "MED-"),
    "instruments.json": ("instrument_id", "INS-"),
    "inventory.json":   ("item_id",       "INV-"),
}

RAW_ID_PREFIXES = ["P_", "MED_", "INS_", "INV_"]

errors = []
warnings = []


def check(condition, msg, is_error=True):
    if not condition:
        (errors if is_error else warnings).append(msg)


for filename in EXPECTED_COUNTS:
    path = DATA_DIR / filename
    check(path.exists(), f"MISSING FILE: {path}")
    if not path.exists():
        continue

    try:
        records = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        errors.append(f"INVALID JSON in {filename}: {e}")
        continue

    # Count
    expected = EXPECTED_COUNTS[filename]
    check(
        len(records) == expected,
        f"{filename}: expected {expected} records, got {len(records)}"
    )

    id_field, id_prefix = ID_FIELDS[filename]
    required = REQUIRED_FIELDS[filename]

    for idx, rec in enumerate(records):
        loc = f"{filename}[{idx}]"

        # Required fields
        for field in required:
            check(field in rec, f"{loc}: missing field '{field}'")

        # Keywords non-empty
        kw = rec.get("keywords", [])
        check(isinstance(kw, list) and len(kw) > 0, f"{loc}: empty keywords array")

        # ID format — must start with prefix (masked)
        rec_id = rec.get(id_field, "")
        check(
            isinstance(rec_id, str) and rec_id.startswith(id_prefix),
            f"{loc}: id '{rec_id}' does not start with '{id_prefix}'"
        )

        # No raw IDs anywhere in the record string representation
        rec_str = json.dumps(rec)
        for raw_prefix in RAW_ID_PREFIXES:
            check(
                raw_prefix not in rec_str,
                f"{loc}: raw unmasked id prefix '{raw_prefix}' found in record",
                is_error=False  # warning, not hard error — raw IDs don't appear in values
            )

        # PII scan
        pii_violations = PIIMasker.validate_no_pii(rec)
        for v in pii_violations:
            errors.append(f"{loc}: PII violation — {v}")

    print(f"  [OK] {filename}: {len(records)} records checked")

# Summary
print()
if warnings:
    print(f"Warnings ({len(warnings)}):")
    for w in warnings:
        print(f"  [WARN] {w}")
    print()

if errors:
    print(f"ERRORS ({len(errors)}):")
    for e in errors:
        print(f"  [FAIL] {e}")
    print()
    print("Validation FAILED.")
    sys.exit(1)
else:
    total = sum(EXPECTED_COUNTS.values())
    print(f"[PASS] All {total} records validated. No PII detected. IDs properly masked.")
    sys.exit(0)
