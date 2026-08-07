"""
tests/test_account1.py
Account 1 validation tests:
  - Dataset counts and record integrity
  - JSON validity
  - No real PII / masked IDs
  - Schema SQL files exist
  - Migration files exist in correct order
  - Backend package.json is valid ES-module config
Run: python -m pytest tests/test_account1.py -v
"""

import json
import sys
import re
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "data"
BACKEND_DIR = ROOT / "backend"
MIGRATIONS_DIR = BACKEND_DIR / "database" / "migrations"
GENERATOR_DIR = ROOT / "data-generator"

# ── Helpers ────────────────────────────────────────────────────────────────────

def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestDatasetCounts:
    def test_patients_count(self):
        records = load_json(DATA_DIR / "patients.json")
        assert len(records) == 600, f"Expected 600 patients, got {len(records)}"

    def test_medicines_count(self):
        records = load_json(DATA_DIR / "medicines.json")
        assert len(records) == 250, f"Expected 250 medicines, got {len(records)}"

    def test_instruments_count(self):
        records = load_json(DATA_DIR / "instruments.json")
        assert len(records) == 175, f"Expected 175 instruments, got {len(records)}"

    def test_inventory_count(self):
        records = load_json(DATA_DIR / "inventory.json")
        assert len(records) == 175, f"Expected 175 inventory items, got {len(records)}"

    def test_total_records(self):
        total = sum(
            len(load_json(DATA_DIR / f))
            for f in ["patients.json", "medicines.json", "instruments.json", "inventory.json"]
        )
        assert total == 1200, f"Expected 1200 total records, got {total}"


class TestJSONValidity:
    def test_patients_valid_json(self):
        assert isinstance(load_json(DATA_DIR / "patients.json"), list)

    def test_medicines_valid_json(self):
        assert isinstance(load_json(DATA_DIR / "medicines.json"), list)

    def test_instruments_valid_json(self):
        assert isinstance(load_json(DATA_DIR / "instruments.json"), list)

    def test_inventory_valid_json(self):
        assert isinstance(load_json(DATA_DIR / "inventory.json"), list)


class TestRequiredFields:
    def test_patient_required_fields(self):
        required = ["patient_id", "age", "gender", "blood_type", "diagnoses",
                    "symptoms", "vitals", "medications", "visit_history", "keywords"]
        for rec in load_json(DATA_DIR / "patients.json"):
            for f in required:
                assert f in rec, f"Patient missing field: {f}"

    def test_medicine_required_fields(self):
        required = ["medicine_id", "name", "dosage", "form", "indications",
                    "contraindications", "stock_units", "batch_id", "keywords"]
        for rec in load_json(DATA_DIR / "medicines.json"):
            for f in required:
                assert f in rec, f"Medicine missing field: {f}"

    def test_instrument_required_fields(self):
        required = ["instrument_id", "name", "category", "department", "location",
                    "operational_status", "maintenance_status", "keywords"]
        for rec in load_json(DATA_DIR / "instruments.json"):
            for f in required:
                assert f in rec, f"Instrument missing field: {f}"

    def test_inventory_required_fields(self):
        required = ["item_id", "item_name", "category", "quantity", "unit",
                    "location", "reorder_level", "status", "keywords"]
        for rec in load_json(DATA_DIR / "inventory.json"):
            for f in required:
                assert f in rec, f"Inventory item missing field: {f}"


class TestMaskedIDs:
    def test_patient_ids_masked(self):
        for rec in load_json(DATA_DIR / "patients.json"):
            pid = rec["patient_id"]
            assert pid.startswith("PAT-"), f"Patient ID not masked: {pid}"
            assert "P_" not in pid, f"Raw patient ID found: {pid}"

    def test_medicine_ids_masked(self):
        for rec in load_json(DATA_DIR / "medicines.json"):
            mid = rec["medicine_id"]
            assert mid.startswith("MED-"), f"Medicine ID not masked: {mid}"

    def test_instrument_ids_masked(self):
        for rec in load_json(DATA_DIR / "instruments.json"):
            iid = rec["instrument_id"]
            assert iid.startswith("INS-"), f"Instrument ID not masked: {iid}"

    def test_inventory_ids_masked(self):
        for rec in load_json(DATA_DIR / "inventory.json"):
            iid = rec["item_id"]
            assert iid.startswith("INV-"), f"Inventory ID not masked: {iid}"


class TestNoPII:
    SSN_PATTERN = re.compile(r'\d{3}-\d{2}-\d{4}')
    PHONE_PATTERN = re.compile(r'\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}')
    FORBIDDEN_KEYS = {"ssn", "social_security", "full_name", "first_name",
                      "last_name", "phone", "address", "email", "dob",
                      "date_of_birth", "national_id", "passport"}

    def _check_record(self, rec, source):
        rec_str = json.dumps(rec)
        assert not self.SSN_PATTERN.search(rec_str), f"SSN pattern in {source}"
        assert not self.PHONE_PATTERN.search(rec_str), f"Phone pattern in {source}"
        for k in rec.keys():
            assert k.lower() not in self.FORBIDDEN_KEYS, f"PII key '{k}' in {source}"

    def test_patients_no_pii(self):
        for i, rec in enumerate(load_json(DATA_DIR / "patients.json")):
            self._check_record(rec, f"patients[{i}]")

    def test_medicines_no_pii(self):
        for i, rec in enumerate(load_json(DATA_DIR / "medicines.json")):
            self._check_record(rec, f"medicines[{i}]")

    def test_instruments_no_pii(self):
        for i, rec in enumerate(load_json(DATA_DIR / "instruments.json")):
            self._check_record(rec, f"instruments[{i}]")

    def test_inventory_no_pii(self):
        for i, rec in enumerate(load_json(DATA_DIR / "inventory.json")):
            self._check_record(rec, f"inventory[{i}]")


class TestKeywords:
    def test_patients_have_keywords(self):
        for i, rec in enumerate(load_json(DATA_DIR / "patients.json")):
            kw = rec.get("keywords", [])
            assert isinstance(kw, list) and len(kw) > 0, f"patients[{i}] empty keywords"

    def test_medicines_have_keywords(self):
        for i, rec in enumerate(load_json(DATA_DIR / "medicines.json")):
            kw = rec.get("keywords", [])
            assert isinstance(kw, list) and len(kw) > 0, f"medicines[{i}] empty keywords"

    def test_instruments_have_keywords(self):
        for i, rec in enumerate(load_json(DATA_DIR / "instruments.json")):
            kw = rec.get("keywords", [])
            assert isinstance(kw, list) and len(kw) > 0, f"instruments[{i}] empty keywords"

    def test_inventory_have_keywords(self):
        for i, rec in enumerate(load_json(DATA_DIR / "inventory.json")):
            kw = rec.get("keywords", [])
            assert isinstance(kw, list) and len(kw) > 0, f"inventory[{i}] empty keywords"


class TestSchemaFiles:
    def test_schema_sql_exists(self):
        path = BACKEND_DIR / "database" / "schema.sql"
        assert path.exists(), "schema.sql not found"
        content = path.read_text(encoding="utf-8")
        assert "CREATE TABLE" in content
        assert "users" in content
        assert "chat_sessions" in content
        assert "chat_messages" in content
        assert "audit_logs" in content

    def test_seed_sql_exists(self):
        assert (BACKEND_DIR / "database" / "seed.sql").exists()

    def test_migrations_exist(self):
        expected = [
            "001_create_users.sql",
            "002_create_chat_sessions.sql",
            "003_create_chat_messages.sql",
            "004_create_audit_logs.sql",
        ]
        for f in expected:
            path = MIGRATIONS_DIR / f
            assert path.exists(), f"Migration not found: {f}"
            assert path.stat().st_size > 0, f"Migration empty: {f}"

    def test_migrations_ordered(self):
        files = sorted(p.name for p in MIGRATIONS_DIR.glob("*.sql"))
        for i, f in enumerate(files, 1):
            prefix = f"{i:03d}_"
            assert f.startswith(prefix), f"Migration ordering issue: {f}"


class TestBackendStructure:
    def test_package_json_exists(self):
        path = BACKEND_DIR / "package.json"
        assert path.exists()
        pkg = load_json(path)
        assert pkg.get("type") == "module", "Backend must use ES modules"
        assert "express" in pkg.get("dependencies", {})
        assert "pg" in pkg.get("dependencies", {})

    def test_env_example_exists(self):
        assert (BACKEND_DIR / ".env.example").exists()

    def test_app_js_exists(self):
        assert (BACKEND_DIR / "src" / "app.js").exists()

    def test_db_config_exists(self):
        assert (BACKEND_DIR / "src" / "config" / "db.js").exists()

    def test_migrations_runner_exists(self):
        assert (BACKEND_DIR / "src" / "database" / "migrate.js").exists()


class TestGeneratorFiles:
    def test_generate_data_exists(self):
        assert (GENERATOR_DIR / "generate_data.py").exists()

    def test_pii_mask_exists(self):
        assert (GENERATOR_DIR / "pii_mask.py").exists()

    def test_validate_data_exists(self):
        assert (GENERATOR_DIR / "validate_data.py").exists()

    def test_requirements_txt_exists(self):
        assert (GENERATOR_DIR / "requirements.txt").exists()
