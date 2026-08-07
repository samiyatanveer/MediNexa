#!/usr/bin/env python3
"""
prepare_dataset.py
==================
Reads the 4 hospital KB JSON files and generates Alpaca-format instruction-response
JSONL pairs for QLoRA fine-tuning.

Usage:
    python prepare_dataset.py [--data-dir ../data] [--output-dir data] [--seed 42]

Outputs:
    data/train.jsonl  — 90% split
    data/val.jsonl    — 10% split
"""

import argparse
import json
import random
import os
from pathlib import Path


# ── Argument parsing ──────────────────────────────────────────────────────────
def parse_args():
    parser = argparse.ArgumentParser(description="Prepare QLoRA fine-tuning dataset")
    parser.add_argument("--data-dir",   default="../data",   help="Path to KB JSON files")
    parser.add_argument("--output-dir", default="data",      help="Output directory for JSONL files")
    parser.add_argument("--seed",       default=42, type=int, help="Random seed")
    parser.add_argument("--train-split", default=0.9, type=float, help="Training fraction")
    parser.add_argument("--min-pairs",   default=1000, type=int,  help="Minimum pairs required")
    return parser.parse_args()


# ── Loaders ───────────────────────────────────────────────────────────────────
def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ── Patient → SOAP pairs ─────────────────────────────────────────────────────
def patient_pairs(records):
    pairs = []
    for r in records:
        pid = r.get("patient_id", "unknown")
        age = r.get("age", "unknown")
        gender = r.get("gender", "unknown")
        bt = r.get("blood_type", "unknown")
        diagnoses = ", ".join(r.get("diagnoses", [])) or "none documented"
        symptoms  = ", ".join(r.get("symptoms",  [])) or "none documented"
        meds      = ", ".join(r.get("medications", [])) or "none"
        vitals    = r.get("vitals", {})
        bp   = f"{vitals.get('systolic_bp','?')}/{vitals.get('diastolic_bp','?')} mmHg"
        hr   = vitals.get("heart_rate", "?")
        temp = vitals.get("temperature_c", "?")
        spo2 = vitals.get("spo2_percent", "?")

        input_text = (
            f"Patient ID: {pid}\n"
            f"Age: {age} | Gender: {gender} | Blood Type: {bt}\n"
            f"Diagnoses: {diagnoses}\n"
            f"Symptoms: {symptoms}\n"
            f"Vitals: BP {bp} | HR {hr} bpm | Temp {temp}°C | SpO2 {spo2}%\n"
            f"Current Medications: {meds}"
        )

        output_text = (
            f"Subjective: {gender} patient, age {age}, blood type {bt}, "
            f"presenting with {symptoms}.\n"
            f"Objective: Blood pressure {bp}, heart rate {hr} bpm, "
            f"temperature {temp}°C, oxygen saturation {spo2}%.\n"
            f"Assessment: Primary diagnoses include {diagnoses}. "
            f"Patient is currently on {meds}.\n"
            f"Plan: Continue current medication regimen. Monitor vital signs. "
            f"Follow up with attending physician for further evaluation.\n"
            f"Sources: {pid}"
        )

        pairs.append({
            "instruction": "Generate a SOAP clinical note for the following patient profile:",
            "input":  input_text,
            "output": output_text,
        })

        # Second pair: symptom query
        if r.get("symptoms"):
            pairs.append({
                "instruction": "What diagnoses are associated with the following symptoms?",
                "input":  f"Symptoms: {symptoms}",
                "output": (
                    f"Based on the hospital records, patients presenting with {symptoms} "
                    f"have been diagnosed with {diagnoses}. "
                    f"Relevant medications include {meds}. Source: {pid}"
                ),
            })

    return pairs


# ── Medicine → prescribing info pairs ────────────────────────────────────────
def medicine_pairs(records):
    pairs = []
    for r in records:
        mid  = r.get("medicine_id", "unknown")
        name = r.get("name", "Unknown Drug")
        dosage = r.get("dosage", "unspecified")
        form   = r.get("form", "unspecified")
        indications      = ", ".join(r.get("indications", [])) or "none documented"
        contraindications = ", ".join(r.get("contraindications", [])) or "none documented"
        stock   = r.get("stock_units", "?")
        batch   = r.get("batch_id", "?")
        expiry  = r.get("expiry_date", "?")

        pairs.append({
            "instruction": "Provide complete prescribing information for the following medication:",
            "input":  f"Medication: {name} | Dosage: {dosage} | Form: {form}",
            "output": (
                f"Medicine: {name}\n"
                f"Dosage: {dosage}\n"
                f"Form: {form}\n"
                f"Indications: {indications}\n"
                f"Contraindications: {contraindications}\n"
                f"Stock: {stock} units\n"
                f"Batch: {batch}\n"
                f"Sources: {mid}"
            ),
        })

        # Second pair: contraindication query
        pairs.append({
            "instruction": "What are the contraindications for the following medication?",
            "input":  f"Medication: {name} ({dosage}, {form})",
            "output": (
                f"The contraindications for {name} ({dosage} {form}) include: "
                f"{contraindications}. "
                f"This medication is indicated for: {indications}. "
                f"Current stock: {stock} units (Batch: {batch}, Expiry: {expiry}). "
                f"Source: {mid}"
            ),
        })

    return pairs


# ── Instrument → status pairs ─────────────────────────────────────────────────
def instrument_pairs(records):
    pairs = []
    for r in records:
        iid   = r.get("instrument_id", "unknown")
        name  = r.get("name", "Unknown Instrument")
        cat   = r.get("category", "unspecified")
        dept  = r.get("department", "unspecified")
        loc   = r.get("location", "unspecified")
        op    = r.get("operational_status", "unknown")
        maint = r.get("maintenance_status", "unknown")
        last_cal = r.get("last_calibration", "unknown")
        next_cal = r.get("next_calibration", "unknown")

        pairs.append({
            "instruction": "Summarize the operational and maintenance status of the following medical instrument:",
            "input":  f"Instrument: {name} | Category: {cat} | Department: {dept} | Location: {loc}",
            "output": (
                f"Instrument: {name}\n"
                f"Category: {cat}\n"
                f"Department: {dept}\n"
                f"Operational Status: {op}\n"
                f"Maintenance: {maint}\n"
                f"Calibration: Last {last_cal} | Next {next_cal}\n"
                f"Sources: {iid}"
            ),
        })

    return pairs


# ── Inventory → stock pairs ───────────────────────────────────────────────────
def inventory_pairs(records):
    pairs = []
    for r in records:
        iid    = r.get("item_id", "unknown")
        name   = r.get("item_name", "Unknown Item")
        cat    = r.get("category", "unspecified")
        qty    = r.get("quantity", "?")
        unit   = r.get("unit", "units")
        loc    = r.get("location", "unspecified")
        reord  = r.get("reorder_level", "?")
        status = r.get("status", "unknown")

        pairs.append({
            "instruction": "Report the current inventory status for the following hospital supply item:",
            "input":  f"Item: {name} | Category: {cat} | Location: {loc}",
            "output": (
                f"Item: {name}\n"
                f"Category: {cat}\n"
                f"Quantity: {qty} {unit}\n"
                f"Location: {loc}\n"
                f"Reorder Level: {reord}\n"
                f"Status: {status}\n"
                f"Sources: {iid}"
            ),
        })

        # Second pair: reorder alert query
        if isinstance(qty, (int, float)) and isinstance(reord, (int, float)) and qty <= reord:
            pairs.append({
                "instruction": "Which inventory items are at or below their reorder level?",
                "input":  f"Item: {name} | Quantity: {qty} {unit} | Reorder Level: {reord}",
                "output": (
                    f"{name} is at reorder threshold. "
                    f"Current stock: {qty} {unit} (reorder level: {reord}). "
                    f"Location: {loc}. Status: {status}. "
                    f"Source: {iid}"
                ),
            })

    return pairs


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    random.seed(args.seed)

    data_dir   = Path(args.data_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load all KB files
    files = {
        "patients":    "patients.json",
        "medicines":   "medicines.json",
        "instruments": "instruments.json",
        "inventory":   "inventory.json",
    }

    all_pairs = []
    for key, fname in files.items():
        path = data_dir / fname
        if not path.exists():
            print(f"WARNING: {path} not found — skipping {key}")
            continue
        records = load_json(path)
        print(f"  Loaded {len(records)} {key}")

        if key == "patients":
            all_pairs.extend(patient_pairs(records))
        elif key == "medicines":
            all_pairs.extend(medicine_pairs(records))
        elif key == "instruments":
            all_pairs.extend(instrument_pairs(records))
        elif key == "inventory":
            all_pairs.extend(inventory_pairs(records))

    print(f"\nTotal instruction pairs generated: {len(all_pairs)}")

    if len(all_pairs) < args.min_pairs:
        print(f"WARNING: only {len(all_pairs)} pairs generated (minimum {args.min_pairs}). "
              f"Check KB JSON files.")

    # Shuffle deterministically
    random.shuffle(all_pairs)

    # Train / val split
    split = int(len(all_pairs) * args.train_split)
    train_pairs = all_pairs[:split]
    val_pairs   = all_pairs[split:]

    def write_jsonl(path, records):
        with open(path, "w", encoding="utf-8") as f:
            for rec in records:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        print(f"  Wrote {len(records)} pairs -> {path}")

    write_jsonl(output_dir / "train.jsonl", train_pairs)
    write_jsonl(output_dir / "val.jsonl",   val_pairs)

    # Validation: check all required fields
    errors = 0
    for i, p in enumerate(all_pairs):
        for key in ("instruction", "input", "output"):
            if not p.get(key):
                print(f"  ERROR: pair {i} missing field '{key}'")
                errors += 1
    if errors:
        print(f"\n{errors} validation errors found.")
    else:
        print(f"\nAll {len(all_pairs)} pairs validated. Dataset ready.")

    print(f"\nSummary:")
    print(f"  Train: {len(train_pairs)} pairs  →  training/data/train.jsonl")
    print(f"  Val:   {len(val_pairs)} pairs   →  training/data/val.jsonl")
    print(f"\nNext step:")
    print(f"  pip install -r requirements.txt")
    print(f"  python train_qlora.py --model microsoft/phi-3-mini-4k-instruct")


if __name__ == "__main__":
    main()
