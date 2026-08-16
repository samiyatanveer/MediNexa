# MediNexa Hospital RAG Assistant

MediNexa is an internal hospital knowledge assistant that retrieves relevant information from a hospital knowledge base and generates source-grounded responses using **Groq**.

It supports queries across:

* 👤 Patients
* 💊 Medicines
* 🏥 Instruments
* 📦 Inventory

The system uses retrieval to find relevant records and Groq to generate structured responses while preserving retrieved source IDs.

## Live Demo

**Frontend:** https://medi-nexa-five.vercel.app/

**Backend API:** https://medinexa-production.up.railway.app/

## System Architecture

```text
User
  ↓
React + Vite Frontend
  ↓
Express Backend API
  ↓
Query Classification & Retrieval
  ↓
Hospital Knowledge Base
  ↓
Retrieved Context
  ↓
Groq LLM
  ↓
Response Validation & Formatting
  ↓
Structured Hospital AI Response
```

## RAG Flow

```text
User Query
    ↓
Category Detection
    ↓
Keyword / ID Based Retrieval
    ↓
Relevant Patient / Medicine / Instrument / Inventory Records
    ↓
Context Injection
    ↓
Groq (Llama 3.1 8B Instant)
    ↓
Response Validation
    ↓
Structured Response + Source IDs
```

For patient queries, the system can generate structured **SOAP-style responses** containing:

* Subjective
* Objective
* Assessment
* Plan
* Sources

For medicine, instrument, and inventory queries, the system returns category-specific structured information.

## Key Features

* 🔎 Knowledge-base retrieval
* 🤖 Groq-powered response generation
* 👤 Patient record retrieval
* 💊 Medicine information and stock queries
* 🏥 Instrument maintenance and calibration queries
* 📦 Inventory information
* 🧾 Source ID tracking
* 🩺 SOAP-format patient responses
* 🛡️ Response validation and fallback handling
* 💬 Persistent chat history
* 🌙 Dark mode
* 🔐 Backend-only API key handling

## Technology Stack

### Frontend

* React
* Vite
* JavaScript
* CSS

### Backend

* Node.js
* Express.js
* PostgreSQL

### AI / RAG

* Groq API
* Llama 3.1 8B Instant
* Keyword-based retrieval
* Structured prompt generation
* Response validation

### Deployment

* **Frontend:** Vercel
* **Backend:** Railway

## Example Queries

### Patient

```text
What is the complete medical record of patient PAT-294c88c86812?
```

### Medicine

```text
Which medicines have stock below 100 units?
```

### Instrument

```text
What is the maintenance status of instrument INS-5cf1ce657bde?
```

### Inventory

```text
Which inventory items are currently low in stock?
```

## Reliability & Fallback

MediNexa separates **retrieval from generation**.

The system first retrieves relevant records from the knowledge base and then provides that context to Groq. Retrieved source IDs are preserved in the final response for traceability.

If Groq is unavailable, the system can fall back to retrieval-based responses instead of completely failing.

## Security

The `GROQ_API_KEY` is stored on the backend and is **never exposed to the frontend**.

No `VITE_` variable is used for the Groq API key.

## Project Status

**Deployed and operational.**

* ✅ React frontend deployed on Vercel
* ✅ Express backend deployed on Railway
* ✅ PostgreSQL persistence
* ✅ RAG retrieval pipeline
* ✅ Groq integration
* ✅ Patient SOAP responses
* ✅ Medicine queries
* ✅ Instrument queries
* ✅ Inventory queries
* ✅ Source tracking
* ✅ Response validation
* ✅ Dark mode
