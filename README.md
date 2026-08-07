# Hospital RAG Chatbot

A production-ready **internal hospital knowledge assistant** that retrieves patient, medicine, and equipment data using Retrieval-Augmented Generation (RAG) and generates SOAP-formatted clinical responses.

**Status:** Ready for deployment on Oracle Cloud Always Free tier.

---

## **Quick Start**

### **1. Setup Environment**

```bash
# Clone + navigate
git clone <repo>
cd hospital-rag

# Install dependencies
cd backend && npm install
cd ../data-gen && pip install -r requirements.txt
cd ../fine-tuning && pip install -r requirements.txt
```

### **2. Configure Secrets**

Create `backend/.env`:
```
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_key_here
OLLAMA_BASE_URL=http://localhost:11434
DATABASE_URL=postgresql://hospital_user:hospital_pass@localhost:5432/hospital_db
PINECONE_API_KEY=your_pinecone_key_here
PINECONE_INDEX=hospital-kb
PORT=3000
NODE_ENV=production
```

### **3. Generate Data + Setup Databases**

```bash
# Start PostgreSQL
cd backend
docker-compose up -d

# Generate synthetic data
cd ../data-gen
python synthetic_data.py  # → kb_data/patients.json, medicines.json, equipment.json

# Seed PostgreSQL + index Pinecone
python seed_db.py
python index_pinecone.py
```

### **4. Start Backend**

```bash
cd backend
npm run dev
# Server running on http://localhost:3000
```

### **5. Start Frontend**

```bash
cd frontend
npm install
npm run dev
# UI running on http://localhost:5173
```

---

## **Architecture**

### **System Flow**

```
User Query
    ↓
[React Frontend]
    ↓
[Express API]
    ↓
[Hybrid Retriever]
├── PostgreSQL (keyword search)
└── chromaDB (vector search)
    ↓
[Merge + Rank Results]
    ↓
[LLM Factory]
├── Groq API (primary)
└── Ollama 2.3B (fallback)
    ↓
[Response Generator]
    ↓
[SOAP Formatter]
├── Subjective
├── Objective
├── Assessment
└── Plan
    ↓
[Display in UI]
```

### **Backend Structure (SRP Pattern)**

| Layer | Purpose |
|-------|---------|
| **Config** | Load env vars, PostgreSQL, chromaDB |
| **Services** | Business logic (LLM, retrieval, formatting, generation) |
| **Repositories** | Database access (DRY CRUD) |
| **Routes** | API endpoints (chat, patients, medicines, equipment) |
| **Middleware** | Error handling, validation, logging |
| **Utils** | Validators, logger, constants |

### **Data**

- **PostgreSQL:** Structured data (300 patients, 150 medicines, 100 equipment)
- **Pinecone:** Vector embeddings (384-dim, 550 total vectors)
- **All PII:** Hashed with SHA256 (anonymized at ingestion)

---

## **API Endpoints**

### **Chat (RAG)**
```
POST /chat
{
  "query": "Tell me about patient P_0001",
  "category": "patient" (optional)
}

Response:
{
  "response": {
    "subjective": "...",
    "objective": "...",
    "assessment": "...",
    "plan": "..."
  },
  "sources": [
    { "id": "P_0001", "snippet": "..." }
  ]
}
```

### **Search Data**
```
GET /patients?search=hypertension
GET /medicines?filter=diabetes
GET /equipment?location=ICU
GET /health  (service status)
```

---

## **Features**

✅ **Hybrid Retrieval**
- Keyword matching on PostgreSQL (fast, exact)
- Vector similarity on Pinecone (semantic)
- Merged results (top-5)

✅ **Flexible LLM**
- Groq API by default (free tier, fast)
- Fallback to Ollama 2.3B (local, no API calls)
- Switch with `LLM_PROVIDER` env var

✅ **Clinical Formatting**
- SOAP responses for patient queries (Subjective/Objective/Assessment/Plan)
- Medicine responses (name, dosage, indications)
- Equipment responses (location, status, quantity)

✅ **PII Masking**
- All IDs hashed at ingestion (SHA256)
- No plain identifiers in responses
- Production-safe synthetic data

✅ **Error Handling**
- Try-catch on all LLM calls
- Graceful fallback (Groq → Ollama)
- User-friendly error messages

✅ **Logging**
- All requests logged (method, path, latency)
- Error stack traces captured
- Query + response tracked

---

## **Technology Stack**

### **Frontend**
- React 18 + Vite (fast builds)
- Tailwind CSS (styling)
- shadcn/ui (components)
- Axios (API calls)

### **Backend**
- Node.js + Express
- PostgreSQL (structured data)
- chromaDB (vector DB)
- Groq SDK (LLM)

### **Data**
- Python (Faker for synthetic data)
- sentence-transformers (embeddings)

### **Deployment**
- Docker Compose (PostgreSQL + Ollama)
- Oracle Cloud Always Free VM

---

## **Configuration**

### **Environment Variables**

| Variable | Purpose | Example |
|----------|---------|---------|
| `LLM_PROVIDER` | Primary LLM | `groq` or `ollama` |
| `GROQ_API_KEY` | Groq authentication | `gsk_...` |
| `OLLAMA_BASE_URL` | Local LLM endpoint | `http://localhost:11434` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db` |
| `PORT` | Backend port | `3000` |

### **Database Setup**

**PostgreSQL Tables:**

```sql
patients (
  id, patient_masked_id, age, gender, blood_type,
  diagnoses[], vitals{}, medications[], visit_history[], keywords[]
)

medicines (
  id, medicine_masked_id, name, dosage, form,
  indications[], contraindications[], stock, batch_id, keywords[]
)

equipment (
  id, equipment_masked_id, name, category, quantity,
  location, maintenance_status, calibration_date, keywords[]
)
```

## **Development**

### **Project Layout**

```
hospital-rag/
├── backend/          # Node.js + Express
├── frontend/         # React + Vite
├── data-gen/         # Python scripts (synthetic data)
├── fine-tuning/      # QLoRA (optional)
└── README.md         # This file
```

### **Running Tests**

```bash
# Test RAG pipeline (E2E)
cd backend
npm run test

# Test synthetic data generation
cd ../data-gen
python synthetic_data.py

# Test fine-tuning (optional)
cd ../fine-tuning
python evaluate.py
```

### **Debugging**

**Backend:**
```bash
# Check PostgreSQL connection
psql postgresql://hospital_user:hospital_pass@localhost:5432/hospital_db

# Check Groq API
curl https://api.groq.com/openai/v1/models \
  -H "Authorization: Bearer $GROQ_API_KEY"
```

**Frontend:**
```bash
# Clear cache + reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

---

## **Deployment**

### **Oracle Cloud Always Free**

1. **Create VM** (2GB RAM, 1 CPU - free tier)
2. **SSH in** + clone repo
3. **Setup Docker** (if not installed)
4. **Run Docker Compose:**
   ```bash
   docker-compose up -d
   ```
5. **Run seed scripts:**
   ```bash
   python seed_db.py
   python index_pinecone.py
   ```
6. **Start backend:**
   ```bash
   npm install && npm start
   ```
7. **Build + serve frontend:**
   ```bash
   npm run build
   # Serve dist/ via Nginx on port 80
   ```

### **Firewall Rules**
- Allow :80 (HTTP)
- Allow :443 (HTTPS, optional)
- Internal: :5432 (PostgreSQL), :11434 (Ollama)

---

## **Performance Notes**

- **Query latency:** ~2-3s (Groq) or ~5-8s (Ollama)
- **Vector search:** <100ms (Pinecone)
- **Keyword search:** <50ms (PostgreSQL)
- **Response format:** Validation <10ms

Bottleneck: LLM inference time (unavoidable).

---

## **Known Limitations**

- Synthetic data only (no real patient records)
- Single-turn chat (no conversation history)
- English language support only
- 550 vector limit (free Pinecone tier)

---

## **Optional: Fine-tuning**

For improved SOAP format consistency, fine-tune Llama 2 3B with QLoRA:

```bash
cd fine-tuning
python prepare_dataset.py    # Extract SOAP examples
python train_qlora.py        # Fine-tune model
python evaluate.py           # Compare with baseline
```

Update `LLM_PROVIDER=ollama` in .env to use fine-tuned model.

---

## **Contributing**

1. Follow SRP (Single Responsibility Principle)
2. Each service file has one job
3. Add tests for new features
4. Document complex logic

---

## **License**

MIT

---

## **Support**

For issues or questions:
1. Check `.env` configuration (most common)
2. Verify PostgreSQL + Pinecone connection
3. Check logs: `backend/src/utils/logger.js`

---

**Built with ❤️ for healthcare AI. Ready to deploy.**
