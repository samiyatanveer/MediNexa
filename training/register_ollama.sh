#!/usr/bin/env bash
# register_ollama.sh
# Merges the LoRA adapter, converts to GGUF, and registers with Ollama.
# Run AFTER: python export_model.py

set -euo pipefail

ADAPTER_DIR="outputs/qlora-adapter"
MERGED_DIR="outputs/merged"
GGUF_DIR="outputs/gguf"
MODEL_NAME="hospitalrag-v1"
MODELFILE="outputs/Modelfile"

echo "=== HospitalRAG Ollama Registration ==="

# Step 1: ensure merged model exists
if [ ! -d "$MERGED_DIR" ]; then
  echo "ERROR: merged model not found at $MERGED_DIR"
  echo "Run: python export_model.py"
  exit 1
fi

# Step 2: check for ollama
if ! command -v ollama &>/dev/null; then
  echo "ERROR: 'ollama' not found in PATH"
  echo "Install from: https://ollama.ai/download"
  exit 1
fi

# Step 3: check for GGUF or use raw HF model path
if ls "$GGUF_DIR"/*.gguf &>/dev/null 2>&1; then
  GGUF_PATH=$(ls "$GGUF_DIR"/*.gguf | head -1)
  FROM_LINE="FROM $GGUF_PATH"
  echo "Using GGUF: $GGUF_PATH"
else
  FROM_LINE="FROM $MERGED_DIR"
  echo "No GGUF found — using HF model path (requires Ollama ≥ 0.4)"
fi

# Step 4: write Modelfile
mkdir -p "$(dirname "$MODELFILE")"
cat > "$MODELFILE" <<EOF
$FROM_LINE

PARAMETER temperature 0.3
PARAMETER num_predict 1024
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1

SYSTEM """
You are a clinical knowledge assistant for Houston Memorial Hospital.
You answer questions ONLY using retrieved hospital records.
Do not invent facts, diagnoses, or details not present in the context.
Always include Source IDs from retrieved records.
Format responses as SOAP notes for patient queries, or structured fields for medicine/instrument/inventory queries.
"""
EOF

echo "Modelfile written to $MODELFILE"

# Step 5: create Ollama model
echo "Creating Ollama model: $MODEL_NAME"
ollama create "$MODEL_NAME" -f "$MODELFILE"

echo ""
echo "=== Registration Complete ==="
echo "  Model name: $MODEL_NAME"
echo "  Test with:  ollama run $MODEL_NAME"
echo ""
echo "Update backend/.env:"
echo "  OLLAMA_MODEL=$MODEL_NAME"
