# data-generator/pii_mask.py
# PII masking utilities — all masking happens at generation time.
# No real PII enters the pipeline.

import hashlib
import re


class PIIMasker:
    """
    Apply SHA-256-based masking to hospital record identifiers.
    All underlying data is already synthetic, but masking is applied
    as a real-world PII handling practice, as required by the brief.
    """

    @staticmethod
    def hash_id(value: str, prefix: str = "", length: int = 12) -> str:
        """Return a fixed-length hex digest prefixed with a category code."""
        digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:length]
        return f"{prefix}{digest}" if prefix else digest

    @staticmethod
    def mask_patient(raw_id: str) -> str:
        return PIIMasker.hash_id(raw_id, prefix="PAT-")

    @staticmethod
    def mask_medicine(raw_id: str) -> str:
        return PIIMasker.hash_id(raw_id, prefix="MED-")

    @staticmethod
    def mask_instrument(raw_id: str) -> str:
        return PIIMasker.hash_id(raw_id, prefix="INS-")

    @staticmethod
    def mask_inventory(raw_id: str) -> str:
        return PIIMasker.hash_id(raw_id, prefix="INV-")

    @staticmethod
    def scrub_names(text: str) -> str:
        """Remove patterns that look like real names (Firstname Lastname)."""
        # Simple heuristic: two capitalised words in sequence → replace
        return re.sub(r'\b[A-Z][a-z]+\s[A-Z][a-z]+\b', '[REDACTED]', text)

    @staticmethod
    def validate_no_pii(record: dict, forbidden_keys=None) -> list:
        """
        Return a list of violations found in a record dict.
        Checks for forbidden key names and obvious PII patterns in values.
        'name' is intentionally NOT forbidden — it refers to medicine/instrument names,
        not person names. Person-identifying keys use the full-name forms below.
        """
        if forbidden_keys is None:
            # Only keys that unambiguously identify a real person
            forbidden_keys = {"ssn", "social_security", "full_name",
                              "first_name", "last_name", "phone", "address",
                              "email", "dob", "date_of_birth", "national_id",
                              "passport", "driver_license", "credit_card"}
        violations = []
        ssn_pattern = re.compile(r'\d{3}-\d{2}-\d{4}')
        phone_pattern = re.compile(r'\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}')

        def _check(obj, path=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    key_lower = k.lower().replace(" ", "_")
                    if key_lower in forbidden_keys:
                        violations.append(f"Forbidden key at {path}.{k}")
                    _check(v, f"{path}.{k}")
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    _check(item, f"{path}[{i}]")
            elif isinstance(obj, str):
                if ssn_pattern.search(obj):
                    violations.append(f"SSN pattern at {path}: {obj[:20]}")
                if phone_pattern.search(obj):
                    violations.append(f"Phone pattern at {path}: {obj[:20]}")

        _check(record)
        return violations
