#!/usr/bin/env python3
"""
export_model.py
===============
Merges the LoRA adapter into the base model and optionally converts to GGUF.

The base model checkpoint is NEVER modified.

Usage:
    python export_model.py \\
        --base-model microsoft/phi-3-mini-4k-instruct \\
        --adapter-dir outputs/qlora-adapter \\
        --output-dir  outputs/merged \\
        [--gguf]       # also convert to GGUF via llama.cpp
"""

import argparse
import sys
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser(description="Merge LoRA adapter and export model")
    p.add_argument("--base-model",   default="microsoft/phi-3-mini-4k-instruct")
    p.add_argument("--adapter-dir",  default="outputs/qlora-adapter")
    p.add_argument("--output-dir",   default="outputs/merged")
    p.add_argument("--gguf",         action="store_true",
                   help="Convert merged model to GGUF via llama.cpp (requires llama.cpp in PATH)")
    p.add_argument("--gguf-output",  default="outputs/gguf",
                   help="Output directory for GGUF file")
    p.add_argument("--gguf-quantize",default="q4_k_m",
                   help="GGUF quantisation type (e.g. q4_k_m, q8_0, f16)")
    return p.parse_args()


def main():
    args = parse_args()

    adapter_dir = Path(args.adapter_dir)
    output_dir  = Path(args.output_dir)

    if not adapter_dir.exists():
        print(f"ERROR: adapter directory not found: {adapter_dir}")
        print("Run training first: python train_qlora.py --run")
        sys.exit(1)

    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel
        import torch
    except ImportError as e:
        print(f"ERROR: Missing dependency: {e}")
        print("Install: pip install -r requirements.txt")
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading base model: {args.base_model}")
    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)

    base = AutoModelForCausalLM.from_pretrained(
        args.base_model,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
    )

    print(f"Loading LoRA adapter: {adapter_dir}")
    model = PeftModel.from_pretrained(base, str(adapter_dir))

    print("Merging adapter into base model (this does NOT modify the original base checkpoint)…")
    merged = model.merge_and_unload()

    print(f"Saving merged model to: {output_dir}")
    merged.save_pretrained(str(output_dir), safe_serialization=True)
    tokenizer.save_pretrained(str(output_dir))
    print("Merged model saved.")

    if args.gguf:
        import subprocess
        gguf_dir = Path(args.gguf_output)
        gguf_dir.mkdir(parents=True, exist_ok=True)

        gguf_f32 = gguf_dir / "hospital-rag.f32.gguf"

        print("\nConverting to GGUF via llama.cpp…")
        try:
            subprocess.run(
                ["python", "convert_hf_to_gguf.py",
                 str(output_dir),
                 "--outfile", str(gguf_f32),
                 "--outtype", "f32"],
                check=True,
            )

            # Quantise
            gguf_quantised = gguf_dir / f"hospital-rag.{args.gguf_quantize}.gguf"
            print(f"Quantising to {args.gguf_quantize}…")
            subprocess.run(
                ["llama-quantize", str(gguf_f32), str(gguf_quantised), args.gguf_quantize],
                check=True,
            )
            print(f"GGUF saved to: {gguf_quantised}")
        except FileNotFoundError:
            print("WARNING: llama.cpp tools not found in PATH.")
            print("  Install llama.cpp and ensure 'convert_hf_to_gguf.py' and 'llama-quantize' are available.")
            print(f"  Merged HF model saved to {output_dir} — use that directly with Ollama ≥ 0.4")

    print("\nDone.")
    print(f"  Merged model: {output_dir}")
    print("Next: bash register_ollama.sh")


if __name__ == "__main__":
    main()
