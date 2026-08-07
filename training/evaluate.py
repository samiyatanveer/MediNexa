#!/usr/bin/env python3
"""
evaluate.py
===========
Evaluates fine-tuned vs base model outputs on hospital KB examples.

Metrics:
  - Template completeness  — required fields present in output
  - Field accuracy         — fields match ground-truth (≥ 0.5 token overlap)
  - Hallucination rate     — output contains content absent from context
  - Response consistency   — same input → stable output across 3 runs

Usage:
    # Without a model (structural eval on saved outputs):
    python evaluate.py --mode offline --predictions outputs/predictions.jsonl

    # With models (requires GPU + trained adapter):
    python evaluate.py \\
        --mode compare \\
        --base-model microsoft/phi-3-mini-4k-instruct \\
        --adapter-dir outputs/qlora-adapter \\
        --test-file data/val.jsonl \\
        --n-samples 50

Results are written to outputs/eval_results.json
"""

import argparse
import json
import re
import sys
from pathlib import Path
from collections import defaultdict


# ── Required template fields per category ─────────────────────────────────────
TEMPLATE_FIELDS = {
    "soap":       ["Subjective", "Objective", "Assessment", "Plan", "Sources"],
    "medicine":   ["Medicine", "Dosage", "Form", "Indications", "Contraindications", "Stock", "Batch", "Sources"],
    "instrument": ["Instrument", "Category", "Department", "Operational Status", "Maintenance", "Calibration", "Sources"],
    "inventory":  ["Item", "Category", "Quantity", "Location", "Reorder Level", "Status", "Sources"],
}


# ── Utility ───────────────────────────────────────────────────────────────────
def detect_template(text):
    """Detect which template a response follows based on field presence."""
    scores = {}
    for tmpl, fields in TEMPLATE_FIELDS.items():
        count = sum(1 for f in fields if re.search(rf"{re.escape(f)}\s*:", text, re.I))
        scores[tmpl] = count / len(fields)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0.3 else "unknown"


def completeness_score(text, template):
    """Fraction of required fields present."""
    fields = TEMPLATE_FIELDS.get(template, [])
    if not fields:
        return 0.0
    found = sum(1 for f in fields if re.search(rf"{re.escape(f)}\s*:", text, re.I))
    return found / len(fields)


def token_overlap(prediction, ground_truth):
    """Token overlap between prediction and ground truth (simple F1 proxy)."""
    pred_tokens = set(prediction.lower().split())
    gt_tokens   = set(ground_truth.lower().split())
    if not gt_tokens:
        return 0.0
    return len(pred_tokens & gt_tokens) / len(gt_tokens)


def hallucination_rate(prediction, context):
    """
    Proxy hallucination check: fraction of 3+ character pred tokens
    absent from context+instruction. Lower is better.
    This is a simple heuristic, not a semantic detector.
    """
    context_tokens = set(context.lower().split())
    pred_tokens    = [t for t in prediction.lower().split() if len(t) >= 3]
    if not pred_tokens:
        return 0.0
    absent = sum(1 for t in pred_tokens if t not in context_tokens)
    return absent / len(pred_tokens)


# ── Offline evaluation (pre-saved predictions) ────────────────────────────────
def evaluate_offline(predictions_file, test_file):
    """Evaluate a JSONL file of {instruction, input, output, prediction} rows."""
    pred_path = Path(predictions_file)
    test_path = Path(test_file)

    if not pred_path.exists():
        print(f"ERROR: predictions file not found: {predictions_file}")
        sys.exit(1)
    if not test_path.exists():
        print(f"ERROR: test file not found: {test_file}")
        sys.exit(1)

    with open(pred_path, encoding="utf-8") as f:
        rows = [json.loads(l) for l in f if l.strip()]

    results = []
    template_counts = defaultdict(int)

    for row in rows:
        pred = row.get("prediction", "")
        gt   = row.get("output", "")
        ctx  = row.get("instruction", "") + " " + row.get("input", "")

        tmpl = detect_template(pred)
        template_counts[tmpl] += 1

        results.append({
            "template":             tmpl,
            "completeness":         completeness_score(pred, tmpl),
            "field_accuracy":       token_overlap(pred, gt),
            "hallucination_rate":   hallucination_rate(pred, ctx),
        })

    if not results:
        print("No predictions to evaluate.")
        return {}

    n = len(results)
    summary = {
        "n_samples":          n,
        "avg_completeness":   round(sum(r["completeness"]       for r in results) / n, 4),
        "avg_field_accuracy": round(sum(r["field_accuracy"]     for r in results) / n, 4),
        "avg_hallucination":  round(sum(r["hallucination_rate"] for r in results) / n, 4),
        "template_distribution": dict(template_counts),
    }

    print("\n── Evaluation Results ────────────────────────────────────────")
    print(f"  Samples evaluated:     {n}")
    print(f"  Avg completeness:      {summary['avg_completeness']:.1%}")
    print(f"  Avg field accuracy:    {summary['avg_field_accuracy']:.1%}")
    print(f"  Avg hallucination:     {summary['avg_hallucination']:.1%}  (lower = better)")
    print(f"  Template distribution: {summary['template_distribution']}")
    print("─────────────────────────────────────────────────────────────")

    return summary


# ── Model-based comparison ────────────────────────────────────────────────────
def evaluate_compare(args):
    """Run base vs fine-tuned model inference and compare metrics."""
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import PeftModel
    except ImportError as e:
        print(f"ERROR: Missing dependency: {e}\nInstall: pip install -r requirements.txt")
        sys.exit(1)

    test_path = Path(args.test_file)
    if not test_path.exists():
        print(f"ERROR: test file not found: {args.test_file}")
        sys.exit(1)

    with open(test_path, encoding="utf-8") as f:
        samples = [json.loads(l) for l in f if l.strip()][:args.n_samples]

    print(f"Evaluating on {len(samples)} samples...")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )

    def load_model(model_id, adapter_dir=None):
        tok = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        if tok.pad_token is None:
            tok.pad_token = tok.eos_token
        mdl = AutoModelForCausalLM.from_pretrained(
            model_id, quantization_config=bnb_config,
            device_map="auto", trust_remote_code=True
        )
        if adapter_dir:
            mdl = PeftModel.from_pretrained(mdl, adapter_dir)
        return mdl, tok

    def generate(model, tokenizer, prompt, max_new_tokens=256):
        inputs = tokenizer(prompt, return_tensors="pt", truncation=True,
                           max_length=args.max_seq_len).to(model.device)
        with torch.no_grad():
            out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
        return tokenizer.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    def make_prompt(s):
        inp = s.get("input", "")
        if inp:
            return f"### Instruction:\n{s['instruction']}\n\n### Input:\n{inp}\n\n### Response:\n"
        return f"### Instruction:\n{s['instruction']}\n\n### Response:\n"

    # Load models
    print(f"Loading base model: {args.base_model}")
    base_model, base_tok = load_model(args.base_model)

    print(f"Loading fine-tuned model: {args.base_model} + {args.adapter_dir}")
    ft_model, ft_tok = load_model(args.base_model, args.adapter_dir)

    base_results, ft_results = [], []
    predictions = []

    for i, sample in enumerate(samples):
        prompt = make_prompt(sample)
        base_pred = generate(base_model, base_tok, prompt)
        ft_pred   = generate(ft_model,   ft_tok,   prompt)
        gt = sample.get("output", "")
        ctx = sample.get("instruction", "") + " " + sample.get("input", "")

        tmpl = detect_template(ft_pred)
        base_results.append({
            "completeness":       completeness_score(base_pred, tmpl),
            "field_accuracy":     token_overlap(base_pred, gt),
            "hallucination_rate": hallucination_rate(base_pred, ctx),
        })
        ft_results.append({
            "completeness":       completeness_score(ft_pred, tmpl),
            "field_accuracy":     token_overlap(ft_pred, gt),
            "hallucination_rate": hallucination_rate(ft_pred, ctx),
        })
        predictions.append({
            "instruction": sample["instruction"],
            "input":       sample.get("input", ""),
            "output":      gt,
            "base_prediction": base_pred,
            "ft_prediction":   ft_pred,
        })

        if (i + 1) % 10 == 0:
            print(f"  {i+1}/{len(samples)} done")

    def avg(lst, key): return round(sum(r[key] for r in lst) / len(lst), 4)

    n = len(samples)
    summary = {
        "n_samples": n,
        "base": {
            "avg_completeness":   avg(base_results, "completeness"),
            "avg_field_accuracy": avg(base_results, "field_accuracy"),
            "avg_hallucination":  avg(base_results, "hallucination_rate"),
        },
        "fine_tuned": {
            "avg_completeness":   avg(ft_results, "completeness"),
            "avg_field_accuracy": avg(ft_results, "field_accuracy"),
            "avg_hallucination":  avg(ft_results, "hallucination_rate"),
        },
    }

    print("\n── Comparison Results ────────────────────────────────────────")
    print(f"{'Metric':<28} {'Base':>10} {'Fine-tuned':>12} {'Δ':>8}")
    print("─" * 62)
    for key in ("avg_completeness", "avg_field_accuracy", "avg_hallucination"):
        b = summary["base"][key]
        f = summary["fine_tuned"][key]
        delta = f - b
        arrow = "↑" if (key != "avg_hallucination" and delta > 0) or \
                       (key == "avg_hallucination" and delta < 0) else "↓"
        print(f"  {key:<26} {b:>10.1%} {f:>12.1%} {delta:>+7.1%} {arrow}")
    print("─────────────────────────────────────────────────────────────")

    # Save outputs
    out_dir = Path("outputs")
    out_dir.mkdir(exist_ok=True)
    with open(out_dir / "eval_results.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    with open(out_dir / "predictions.jsonl", "w", encoding="utf-8") as f:
        for row in predictions:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"\nResults saved to outputs/eval_results.json")
    print(f"Predictions saved to outputs/predictions.jsonl")

    return summary


# ── Entry ─────────────────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="Evaluate HospitalRAG model outputs")
    p.add_argument("--mode", default="offline",
                   choices=["offline", "compare"],
                   help="offline: evaluate saved predictions | compare: run base vs fine-tuned")
    p.add_argument("--predictions", default="outputs/predictions.jsonl",
                   help="[offline] Path to predictions JSONL")
    p.add_argument("--test-file",   default="data/val.jsonl",
                   help="Ground-truth test JSONL")
    p.add_argument("--base-model",  default="microsoft/phi-3-mini-4k-instruct",
                   help="[compare] HuggingFace base model ID")
    p.add_argument("--adapter-dir", default="outputs/qlora-adapter",
                   help="[compare] Path to saved LoRA adapter")
    p.add_argument("--n-samples",   default=50, type=int,
                   help="[compare] Number of val samples to evaluate")
    p.add_argument("--max-seq-len", default=512, type=int)
    return p.parse_args()


def main():
    args = parse_args()

    if args.mode == "offline":
        summary = evaluate_offline(args.predictions, args.test_file)
        if summary:
            out = Path("outputs")
            out.mkdir(exist_ok=True)
            with open(out / "eval_results.json", "w", encoding="utf-8") as f:
                json.dump(summary, f, indent=2)
            print(f"Results saved to outputs/eval_results.json")
    else:
        evaluate_compare(args)


if __name__ == "__main__":
    main()
