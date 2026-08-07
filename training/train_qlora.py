#!/usr/bin/env python3
"""
train_qlora.py
==============
QLoRA fine-tuning for the HospitalRAG assistant.

All parameters are configurable via CLI flags. Does NOT automatically download
models or start training — requires explicit --run flag.

Usage:
    # Dry run (validates config only):
    python train_qlora.py --model microsoft/phi-3-mini-4k-instruct --dry-run

    # Full training:
    python train_qlora.py \\
        --model microsoft/phi-3-mini-4k-instruct \\
        --train-file data/train.jsonl \\
        --val-file   data/val.jsonl \\
        --output-dir outputs/qlora-adapter \\
        --lora-r 16 --lora-alpha 32 --lora-dropout 0.1 \\
        --epochs 3 --batch-size 4 --grad-accum 4 \\
        --lr 2e-4 --max-seq-len 512 \\
        --logging-steps 10 --save-steps 100 \\
        --run

Hardware requirements:
    - Minimum 16 GB VRAM (GPU) for phi-3-mini-4k
    - Minimum 24 GB VRAM for Llama-3.2-3B
    - CPU-only mode is extremely slow; not recommended for production training
    - Tested on: NVIDIA RTX 3090, A100 80GB
"""

import argparse
import os
import sys
from pathlib import Path


# ── Argument parsing ──────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(description="QLoRA fine-tuning — HospitalRAG")

    # Model
    p.add_argument("--model",         default="microsoft/phi-3-mini-4k-instruct",
                   help="HuggingFace model ID (base model — NOT the adapter)")
    p.add_argument("--model-revision", default="main",
                   help="Model revision/branch")

    # Data
    p.add_argument("--train-file",    default="data/train.jsonl",
                   help="Path to training JSONL")
    p.add_argument("--val-file",      default="data/val.jsonl",
                   help="Path to validation JSONL")

    # Output
    p.add_argument("--output-dir",    default="outputs/qlora-adapter",
                   help="Directory for saved LoRA adapter (does NOT overwrite base model)")

    # LoRA config
    p.add_argument("--lora-r",        default=16,   type=int,   help="LoRA rank")
    p.add_argument("--lora-alpha",    default=32,   type=int,   help="LoRA alpha")
    p.add_argument("--lora-dropout",  default=0.1,  type=float, help="LoRA dropout")
    p.add_argument("--target-modules", default="all-linear",
                   help="Target modules for LoRA (comma-separated or 'all-linear')")

    # Training hyperparameters
    p.add_argument("--epochs",        default=3,    type=int,   help="Training epochs")
    p.add_argument("--batch-size",    default=4,    type=int,   help="Per-device batch size")
    p.add_argument("--grad-accum",    default=4,    type=int,   help="Gradient accumulation steps")
    p.add_argument("--lr",            default=2e-4, type=float, help="Learning rate")
    p.add_argument("--max-seq-len",   default=512,  type=int,   help="Maximum sequence length")
    p.add_argument("--warmup-ratio",  default=0.03, type=float, help="LR warmup ratio")
    p.add_argument("--weight-decay",  default=0.001,type=float, help="Weight decay")

    # Quantisation
    p.add_argument("--quant-type",    default="nf4", choices=["nf4", "fp4"],
                   help="BitsAndBytes quantisation type")
    p.add_argument("--compute-dtype", default="bfloat16",
                   choices=["bfloat16", "float16", "float32"],
                   help="Compute dtype for 4-bit layers")

    # Logging / saving
    p.add_argument("--logging-steps", default=10,  type=int,   help="Log every N steps")
    p.add_argument("--save-steps",    default=100, type=int,   help="Save checkpoint every N steps")
    p.add_argument("--eval-steps",    default=100, type=int,   help="Evaluate every N steps")

    # Control
    p.add_argument("--run",      action="store_true",
                   help="Actually start training (safety flag — prevents accidental runs)")
    p.add_argument("--dry-run",  action="store_true",
                   help="Validate config and data without training")
    p.add_argument("--resume-from", default=None,
                   help="Resume from checkpoint directory")

    return p.parse_args()


# ── Config printer ────────────────────────────────────────────────────────────
def print_config(args):
    print("\n" + "=" * 60)
    print("HospitalRAG QLoRA Fine-tuning Configuration")
    print("=" * 60)
    print(f"  Base model:       {args.model}")
    print(f"  Train data:       {args.train_file}")
    print(f"  Val data:         {args.val_file}")
    print(f"  Output dir:       {args.output_dir}  (adapter only)")
    print(f"  LoRA r/alpha:     {args.lora_r} / {args.lora_alpha}")
    print(f"  LoRA dropout:     {args.lora_dropout}")
    print(f"  Target modules:   {args.target_modules}")
    print(f"  Quantisation:     4-bit {args.quant_type} ({args.compute_dtype})")
    print(f"  Epochs:           {args.epochs}")
    print(f"  Batch size:       {args.batch_size} × grad_accum {args.grad_accum} "
          f"= effective {args.batch_size * args.grad_accum}")
    print(f"  Learning rate:    {args.lr}")
    print(f"  Max seq length:   {args.max_seq_len}")
    print(f"  Warmup ratio:     {args.warmup_ratio}")
    print("=" * 60)


# ── Data validation ───────────────────────────────────────────────────────────
def validate_data(train_file, val_file):
    import json

    errors = 0
    for label, path in [("train", train_file), ("val", val_file)]:
        p = Path(path)
        if not p.exists():
            print(f"  ERROR: {label} file not found: {path}")
            print(f"         Run: python prepare_dataset.py  first")
            errors += 1
            continue

        with open(p, encoding="utf-8") as f:
            lines = f.readlines()

        if not lines:
            print(f"  ERROR: {label} file is empty")
            errors += 1
            continue

        for i, line in enumerate(lines[:5]):
            try:
                row = json.loads(line)
                for field in ("instruction", "input", "output"):
                    if not row.get(field):
                        print(f"  ERROR: {label}:{i} missing '{field}'")
                        errors += 1
            except json.JSONDecodeError as e:
                print(f"  ERROR: {label}:{i} invalid JSON: {e}")
                errors += 1

        print(f"  {label}: {len(lines)} pairs  ✓")

    return errors == 0


# ── Alpaca prompt formatter ───────────────────────────────────────────────────
def format_alpaca(example):
    """Convert Alpaca-format record into a single training prompt."""
    if example.get("input"):
        return (
            f"### Instruction:\n{example['instruction']}\n\n"
            f"### Input:\n{example['input']}\n\n"
            f"### Response:\n{example['output']}"
        )
    return (
        f"### Instruction:\n{example['instruction']}\n\n"
        f"### Response:\n{example['output']}"
    )


# ── Training ──────────────────────────────────────────────────────────────────
def run_training(args):
    try:
        import torch
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, TaskType
        from trl import SFTTrainer, SFTConfig
        from datasets import load_dataset
    except ImportError as e:
        print(f"\nERROR: Missing dependency: {e}")
        print("Install requirements first:")
        print("  pip install -r requirements.txt")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\nDevice: {device}")
    if device == "cpu":
        print("WARNING: CPU training is very slow. A GPU with ≥16 GB VRAM is strongly recommended.")

    # 4-bit quantisation
    compute_dtype = getattr(torch, args.compute_dtype)
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type=args.quant_type,
        bnb_4bit_compute_dtype=compute_dtype,
        bnb_4bit_use_double_quant=True,
    )

    print(f"\nLoading tokenizer: {args.model}")
    tokenizer = AutoTokenizer.from_pretrained(
        args.model,
        revision=args.model_revision,
        trust_remote_code=True,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    print(f"Loading model: {args.model}")
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        revision=args.model_revision,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model.config.use_cache = False
    model.config.pretraining_tp = 1

    # LoRA config
    target_modules = (
        None if args.target_modules == "all-linear"
        else [m.strip() for m in args.target_modules.split(",")]
    )
    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=args.lora_dropout,
        task_type=TaskType.CAUSAL_LM,
        target_modules=target_modules,
        bias="none",
    )

    # Dataset
    dataset = load_dataset(
        "json",
        data_files={"train": args.train_file, "validation": args.val_file},
    )
    dataset = dataset.map(lambda ex: {"text": format_alpaca(ex)})

    # Training config
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    sft_config = SFTConfig(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        max_seq_length=args.max_seq_len,
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        logging_steps=args.logging_steps,
        save_steps=args.save_steps,
        eval_steps=args.eval_steps,
        eval_strategy="steps",
        save_strategy="steps",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        fp16=(args.compute_dtype == "float16"),
        bf16=(args.compute_dtype == "bfloat16"),
        report_to="none",
        resume_from_checkpoint=args.resume_from,
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        peft_config=lora_config,
        processing_class=tokenizer,
    )

    print("\nStarting training...")
    trainer.train(resume_from_checkpoint=args.resume_from)

    print(f"\nSaving LoRA adapter to {output_dir}")
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))

    print("\nTraining complete.")
    print(f"Adapter saved to: {output_dir}")
    print("Base model is NOT modified.")
    print("\nNext steps:")
    print("  python evaluate.py")
    print("  python export_model.py")


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    args = parse_args()
    print_config(args)

    # Always validate data
    print("\nValidating training data...")
    ok = validate_data(args.train_file, args.val_file)

    if args.dry_run:
        if ok:
            print("\nDry run complete. Configuration and data are valid.")
            print("Run with --run to start training.")
        else:
            print("\nDry run failed. Fix errors above before training.")
            sys.exit(1)
        return

    if not args.run:
        print("\nSafety check: --run flag not set.")
        print("Add --run to start training, or --dry-run to validate only.")
        print("\nExample:")
        print("  python train_qlora.py --model microsoft/phi-3-mini-4k-instruct --dry-run")
        print("  python train_qlora.py --model microsoft/phi-3-mini-4k-instruct --run")
        sys.exit(0)

    if not ok:
        print("\nERROR: Training data validation failed. Fix errors before running.")
        sys.exit(1)

    run_training(args)


if __name__ == "__main__":
    main()
