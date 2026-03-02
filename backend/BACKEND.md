# QM RAG Backend — Detailed Technical Documentation

> This file comprehensively explains all layers, data flows, service architecture, and API contracts of the backend system. It serves as a reference for AI agents and developers.

---

## 1. Overview

The backend is a **RAG (Retrieval-Augmented Generation)** pipeline designed to generate ISO compliance handbooks. Core tasks:

1. **Package management** — Manages template/reference files for standards like ISO9001, SSCP, ISO14007
2. **File indexing** — Parses DOCX/PPTX/XLSX/PDF files, chunks them, creates embeddings
3. **Placeholder management** — Detects and resolves variables in `{{TOKEN}}` format
4. **AI planning** — Plans how templates will be filled
5. **AI generation** — Produces output files by filling placeholders with client data and AI outputs
6. **RAG Chat** — Q&A over indexed documents
7. **Run tracking** — Event-level monitoring of each pipeline step

---

## 2. Technology Stack

| Layer        | Technology                                | Version        |
| ------------ | ----------------------------------------- | -------------- |
| Framework    | Django + DRF                              | 5.2            |
| Database     | PostgreSQL + pgvector                     | pg16           |
| Queue        | Celery + Redis                            | 5.4 / 7-alpine |
| AI           | OpenAI SDK (Chat + Embeddings)            | >=1.50         |
| File Parsing | python-docx, python-pptx, openpyxl, pypdf | —              |
| Container    | Docker Compose                            | —              |

### Environment Variables

| Variable                  | Description                     | Default                                                |
| ------------------------- | ------------------------------- | ------------------------------------------------------ |
| `DATABASE_URL`            | PostgreSQL connection URL       | `postgresql://postgres:postgres@localhost:5432/qm_rag` |
| `OPENAI_API_KEY`          | OpenAI API key                  | From `.env.local`                                      |
| `OPENAI_CHAT_MODEL`       | Chat Completions model          | `gpt-4o-mini`                                          |
| `OPENAI_ROUTER_MODEL`     | Router (intent detection) model | `gpt-4o-mini`                                          |
| `OPENAI_EMBED_MODEL`      | Embedding model                 | `text-embedding-3-small`                               |
| `CELERY_BROKER_URL`       | Redis broker URL                | `redis://localhost:6379/0`                             |
| `RAG_DATA_ROOT`           | File storage root directory     | `<PROJECT_ROOT>/data`                                  |
| `NEXTJS_INTERNAL_API_URL` | Frontend internal URL           | `http://localhost:3000`                                |

---

## 3. Directory Structure & Module Map

```
backend/
├── config/                    # Django configuration
│   ├── settings.py            # All settings, env() helpers
│   ├── api_urls.py            # All URLs under /api/v1/
│   ├── urls.py                # Root URL config (/health, /admin, /api/v1/)
│   └── celery.py              # Celery app configuration
│
├── common/                    # Shared utility modules
│   ├── openai_client.py       # OpenAI client (singleton) + chat_json + embed_texts
│   ├── chunking.py            # Deterministic text splitting (split_text_deterministic)
│   ├── hashing.py             # SHA-256 hash functions
│   └── placeholders.py        # {{TOKEN}} regex engines
│
├── packages/                  # Package catalog and variable schemas
│   ├── catalog.py             # STANDARD_PACKAGES dict + get_package_config()
│   ├── services.py            # load_variable_schema, load_playbook, seed_variable_keys
│   ├── handbooks/             # JSON playbook files (ISO9001_v1, SSCP_v1, ISO14007_v1)
│   └── schemas/               # JSON variable schemas (token definitions)
│
├── assets/                    # File upload, listing, download
│   ├── views.py               # API endpoints (upload, list, download, binary)
│   ├── urls.py                # URL definitions
│   └── services/storage.py    # LocalStorage (filesystem) abstraction
│
├── indexing/                  # File indexing and embedding
│   ├── tasks.py               # Celery tasks (ingest_manual_task, ingest_asset_task)
│   └── services/
│       ├── ingestion.py       # Main indexing pipeline
│       └── extract.py         # Text extraction (PDF, DOCX, PPTX, XLSX, OOXML)
│
├── generation/                # AI planning and file generation
│   ├── views.py               # API endpoints (start-package, ingest, plan, generate)
│   ├── urls.py                # URL definitions
│   ├── tasks.py               # Celery tasks (plan_manual_task, generate_manual_task)
│   └── services/
│       ├── manuals.py         # ensure_manual() — manual/tenant creation
│       ├── planning.py        # build_generation_plan() — AI plan creation
│       ├── execution.py       # execute_generation() — file generation orchestrator
│       ├── variables.py       # resolve_required_variables() — variable resolution
│       └── template_apply.py  # OOXML placeholder replacement
│
├── rag/                       # RAG retrieval and chat service
│   ├── models.py              # ALL database models (main data layer)
│   ├── views.py               # Chat API endpoint
│   ├── urls.py                # URL definitions
│   └── services/
│       ├── retrieval.py       # Hybrid search (vector + FTS + RRF merge)
│       └── chat.py            # Router → Retrieval → Answer pipeline
│
├── runs/                      # Pipeline monitoring and event logging
│   ├── views.py               # Run detail endpoint
│   ├── urls.py                # URL definitions
│   └── services/run_logger.py # create_run, mark_run_*, emit_event
│
├── prompts/                   # AI system prompts (versioned .md files)
│   ├── registry.py            # get_prompt(name, version) — prompt loader
│   ├── plan_v1.md             # Planning prompt
│   ├── router_v1.md           # Chat intent routing prompt
│   ├── chat_answer_v1.md      # Chat answering prompt
│   ├── infer_variables_v1.md  # Variable inference prompt
│   └── draft_variables_v1.md  # Variable draft creation prompt
│
└── Dockerfile                 # Python 3.12-slim container
```

---

## 4. Database Models (rag/models.py)

All models operate under the `rag` schema (`search_path=rag,public`).

### 4.1 RagTenant

The basic unit of multi-tenancy.

| Field        | Type             | Description                                 |
| ------------ | ---------------- | ------------------------------------------- |
| `id`         | CharField(64) PK | Tenant identifier (e.g. `"default-tenant"`) |
| `name`       | CharField(255)   | Display name                                |
| `created_at` | DateTimeField    | Creation time                               |

### 4.2 RagManual

A handbook project. Linked to a tenant and a package.

| Field             | Type              | Description                                  |
| ----------------- | ----------------- | -------------------------------------------- |
| `id`              | CharField(128) PK | Manual ID (e.g. `"manual-0001"`)             |
| `tenant`          | FK → RagTenant    | Tenant                                       |
| `package_code`    | CharField(64)     | Package code (e.g. `"ISO9001"`)              |
| `package_version` | CharField(32)     | Package version (e.g. `"v1"`)                |
| `status`          | CharField(32)     | `DRAFT` / `IN_PROGRESS` / `READY` / `FAILED` |

### 4.3 RagAsset

Every file uploaded or generated in the system.

| Field              | Type                 | Description                                                          |
| ------------------ | -------------------- | -------------------------------------------------------------------- |
| `id`               | UUID PK              | Auto UUID                                                            |
| `tenant`           | FK → RagTenant       | Tenant                                                               |
| `manual`           | FK → RagManual       | Linked manual                                                        |
| `source_asset`     | FK → self (nullable) | Source template (for generated files)                                |
| `role`             | CharField            | `TEMPLATE` / `REFERENCE` / `CUSTOMER_REFERENCE` / `GENERATED_OUTPUT` |
| `source`           | CharField            | `PACKAGE_VAULT` / `CUSTOMER_UPLOAD` / `AI_GENERATED`                 |
| `local_path`       | TextField            | Full path on disk                                                    |
| `sha256`           | CharField(64)        | Content hash                                                         |
| `mime`             | TextField            | MIME type                                                            |
| `file_ext`         | CharField(16)        | File extension                                                       |
| `package_rel_path` | TextField            | Path relative to package root                                        |

**Unique Constraint:** `(manual, package_rel_path, sha256)`

**Role explanations:**

- `TEMPLATE`: Template files containing placeholders (DOCX/PPTX/XLSX)
- `REFERENCE`: Norm/standard reference documents (PDF/DOCX/DOC)
- `CUSTOMER_REFERENCE`: Customer-uploaded reference materials
- `GENERATED_OUTPUT`: AI-generated output files

### 4.4 RagDocumentChunk

Indexed text chunk. Supports both vector and full-text search.

| Field         | Type              | Description                                         |
| ------------- | ----------------- | --------------------------------------------------- |
| `id`          | CharField(64) PK  | Deterministic hash-based ID                         |
| `asset`       | FK → RagAsset     | Source file                                         |
| `chunk_index` | IntegerField      | Sequence number                                     |
| `text`        | TextField         | Chunk text                                          |
| `token_count` | IntegerField      | Estimated token count                               |
| `tsv`         | SearchVectorField | PostgreSQL FTS vector                               |
| `embedding`   | VectorField(1536) | OpenAI embedding vector                             |
| `metadata`    | JSONField         | Rich metadata (package, language, role, path, etc.) |

**Indexes:**

- `GinIndex` on `tsv` — Full-text search
- `HnswIndex` on `embedding` — Vector similarity search (cosine, m=16, ef=64)

### 4.5 RagTemplatePlaceholder

`{{TOKEN}}` definitions found in template files.

| Field         | Type             | Description                                     |
| ------------- | ---------------- | ----------------------------------------------- |
| `id`          | CharField(64) PK | Hash-based ID                                   |
| `asset`       | FK → RagAsset    | Template file                                   |
| `token`       | CharField(255)   | Token name (e.g. `"COMPANY_NAME"`)              |
| `occurrences` | IntegerField     | Number of occurrences in the file               |
| `status`      | CharField        | `KNOWN` (exists in variable schema) / `UNKNOWN` |

### 4.6 RagVariableKey

Package variable definitions. Seeded from JSON schema file.

| Field               | Type                 | Description                                         |
| ------------------- | -------------------- | --------------------------------------------------- |
| `id`                | UUID PK              | Auto UUID                                           |
| `package_code`      | CharField(64)        | Package code                                        |
| `package_version`   | CharField(32)        | Package version                                     |
| `token`             | CharField(255)       | Token name                                          |
| `type`              | CharField            | `string` / `number` / `date` / `enum` / `rich_text` |
| `required`          | BooleanField         | Is it required?                                     |
| `description`       | TextField            | Description                                         |
| `examples`          | JSONField            | List of example values                              |
| `default_value`     | TextField (nullable) | Default value                                       |
| `generation_policy` | CharField            | `DETERMINISTIC` / `AI_INFER` / `AI_DRAFT`           |

**generation_policy explanations:**

- `DETERMINISTIC`: Taken directly from customer profile or default value
- `AI_INFER`: AI infers value in customer profile context (e.g. manager name)
- `AI_DRAFT`: AI drafts value using RAG retrieval (e.g. quality policy)

### 4.7 RagVariableValue

Resolved variable values for a manual.

| Field        | Type                  | Description                                                                    |
| ------------ | --------------------- | ------------------------------------------------------------------------------ |
| `id`         | UUID PK               | Auto UUID                                                                      |
| `manual`     | FK → RagManual        | Manual                                                                         |
| `token`      | CharField(255)        | Token name                                                                     |
| `value`      | TextField             | Resolved value                                                                 |
| `source`     | CharField             | `CUSTOMER_INPUT` / `DEFAULT` / `AI_INFERRED` / `AI_DRAFTED` / `HUMAN_OVERRIDE` |
| `confidence` | FloatField (nullable) | AI confidence score (0-1)                                                      |
| `provenance` | JSONField             | Source info (model, prompt, chunk_ids, etc.)                                   |

**Unique Constraint:** `(manual, token)` — Each manual-token pair is unique.

### 4.8 RagRun

Pipeline execution record.

| Field            | Type           | Description                                                 |
| ---------------- | -------------- | ----------------------------------------------------------- |
| `id`             | UUID PK        | Auto UUID                                                   |
| `manual`         | FK → RagManual | Manual                                                      |
| `kind`           | CharField      | `INGEST` / `PLAN` / `GENERATE` / `CHAT`                     |
| `status`         | CharField      | `QUEUED` / `RUNNING` / `SUCCEEDED` / `FAILED` / `CANCELLED` |
| `prompt_version` | CharField      | Used prompt version                                         |
| `model`          | CharField      | Used AI model                                               |
| `metrics`        | JSONField      | Result metrics                                              |
| `started_at`     | DateTimeField  | Start time                                                  |
| `finished_at`    | DateTimeField  | End time                                                    |

### 4.9 RagRunEvent

Granular event logs for a run.

| Field     | Type          | Description                         |
| --------- | ------------- | ----------------------------------- |
| `id`      | UUID PK       | Auto UUID                           |
| `run`     | FK → RagRun   | Related run                         |
| `ts`      | DateTimeField | Event time                          |
| `level`   | CharField     | `DEBUG` / `INFO` / `WARN` / `ERROR` |
| `message` | TextField     | Event message                       |
| `payload` | JSONField     | Structured data                     |

---

## 5. API Endpoints

All endpoints are under the `/api/v1/` prefix.

### 5.1 Asset Management (`assets/urls.py`)

#### `POST /api/v1/assets/local-upload`

Uploads, indexes, and creates embedding for a file.

**Request:** `multipart/form-data`
| Field | Required | Description |
|------------|----------|-------------------|
| `file` | Yes | File to upload |
| `manual_id`| Yes | Manual ID |
| `tenant_id`| No | Tenant ID (default: `"default-tenant"`) |
| `package_code` | No | Package code (default: `"ISO9001"`) |
| `package_version` | No| Package version (default: `"v1"`) |
| `role` | No | File role: `TEMPLATE`, `REFERENCE`, `CUSTOMER_REFERENCE` |
| `path` | No | Relative file path |

**Flow:**

1. `ensure_manual()` creates or fetches manual/tenant
2. File is written under `RAG_TENANT_ROOT/<tenant>/<manual>/<role_folder>/`
3. SHA-256 hash is calculated, `RagAsset` record is created
4. `ingest_single_asset()` is called → text is extracted → chunked → embedding created
5. Success: `201` + `{ asset, run_id }`
6. Indexing error: `500` + `{ error, asset_id }` (file remains saved)

#### `GET /api/v1/manuals/<manual_id>/assets`

Lists all assets for the specified manual.

**Query params:** `?role=TEMPLATE` (optional filter)

**Response:** `{ assets: [...] }` — Each asset includes:

- `id`, `path`, `name`, `ext`, `size`, `role`, `source`
- `placeholders[]` — All detected tokens
- `unresolved_placeholders[]` — Tokens not yet resolved
- `has_generated_version` — Is there a generated version?
- `generated_asset_id` — ID of the generated file

#### `GET /api/v1/assets/<asset_id>/binary`

Returns the binary content of a file.

**Query params:** `?version=original|generated`

- `original`: Returns the original template file
- `generated`: Returns the AI-generated version

#### `POST /api/v1/manuals/<manual_id>/outputs/download`

Downloads selected files as a ZIP.

**Request body:**

```json
{
    "file_ids": ["uuid1", "uuid2"],
    "generated_only": false
}
```

### 5.2 Pipeline Management (`generation/urls.py`)

#### `POST /api/v1/manuals/<manual_id>/start-package`

Starts a new manual and indexes package files.

**Request body:**

```json
{
    "package_code": "ISO9001",
    "package_version": "v1",
    "tenant_id": "default-tenant",
    "sync": false,
    "force": false
}
```

**Flow:**

1. `ensure_manual()` creates manual
2. `ingest_manual_task` is triggered (Celery or sync)
3. Response: `202` + `{ run, manual_id, tenant_id }`

#### `POST /api/v1/manuals/<manual_id>/ingest`

Re-indexes an existing manual.

**Request body:**

```json
{
    "force": false,
    "sync": false
}
```

**`force=false` behavior:** If there is a previous successful INGEST run, returns the existing run without re-indexing (`reused: true`).

#### `POST /api/v1/manuals/<manual_id>/plan`

Creates an AI-assisted generation plan for template files.

**Request body:**

```json
{
    "sync": true,
    "selected_asset_ids": ["uuid1", "uuid2"]   // optional filter
}
```

**Response (sync):**

```json
{
    "run": { ... },
    "plan": {
        "outputs": [
            {
                "template_asset_id": "uuid",
                "output_rel_path": "outputs/filename.docx",
                "strategies": {
                    "replacement_mode": "SIMPLE_TEXT",
                    "draft_groups": [...]
                }
            }
        ],
        "required_tokens": ["COMPANY_NAME", "SCOPE", ...],
        "unknown_tokens": ["CUSTOM_TOKEN_1"]
    }
}
```

#### `POST /api/v1/manuals/<manual_id>/generate`

Fills all template files according to the plan and generates output files.

**Request body:**

```json
{
    "sync": true,
    "customer_profile": { "COMPANY_NAME": "Muster GmbH", ... },
    "selected_asset_ids": ["uuid1"],
    "global_overrides": { "SCOPE": "custom value" },
    "file_overrides_by_file": { "asset-uuid": { "TOKEN": "value" } }
}
```

**Response (sync):**

```json
{
    "run": { ... },
    "report": {
        "status": "SUCCEEDED|PARTIAL|FAILED",
        "files": [
            {
                "template_asset_id": "uuid",
                "template_path": "02 Musterhandbuch/QMH.docx",
                "output_asset_id": "uuid",
                "status": "generated|error|skipped",
                "unresolved_tokens": ["TOKEN_X"],
                "error": null
            }
        ],
        "summary": { "total": 5, "generated": 4, "failed": 1, "skipped": 0 }
    }
}
```

### 5.3 RAG Chat (`rag/urls.py`)

#### `POST /api/v1/chat`

**Request body:**

```json
{
    "manual_id": "manual-0001",
    "message": "What should the quality policy be in ISO 9001?",
    "session_id": "optional-session-id"
}
```

**Response:**

```json
{
    "answer_markdown": "The quality policy should include: ...",
    "citations": [
        { "chunk_id": "abc123", "asset_path": "01 Norm/ISO9001.pdf" }
    ],
    "suggested_followups": ["How are quality objectives defined?"],
    "run_id": "uuid"
}
```

### 5.4 Run Monitoring (`runs/urls.py`)

#### `GET /api/v1/manuals/<manual_id>/runs/<run_id>`

Returns run details and all its events.

**Response:**

```json
{
    "run": {
        "id": "uuid",
        "kind": "INGEST",
        "status": "SUCCEEDED",
        "metrics": { ... },
        "started_at": "...",
        "finished_at": "..."
    },
    "events": [
        { "ts": "...", "level": "INFO", "message": "Package scan started", "payload": { "files": 42 } }
    ]
}
```

### 5.5 Health Check

#### `GET /health/`

Simple health check. Response: `{ "status": "ok" }`

---

## 6. Pipeline Flows (Detailed)

### 6.1 Indexing Pipeline (INGEST)

```
start-package / ingest
             │
             ▼
┌──────────────────┐
│  seed_variable    │ ← Write RagVariableKey records to DB from JSON schema
│  _keys()          │
└──────────────────┘
             │
             ▼
┌──────────────────┐
│  _copy_source_    │ ← Copy files from package dir to manual dir
│  to_manual()      │   For each file: classify_asset_role() → _upsert_asset()
└──────────────────┘
             │
             ▼
┌──────────────────┐
│  index_existing_  │ ← For each asset:
│  asset()          │   1. extract_text_for_path() — extract text
│    (loop)         │   2. _store_placeholders() — find and save {{TOKEN}}
│                   │   3. _persist_chunks() — chunk text and write to DB
└──────────────────┘
             │
             ▼
┌──────────────────┐
│  _apply_          │ ← Create embedding with OpenAI text-embedding-3-small
│  embeddings()     │   Bulk update all chunks
└──────────────────┘
             │
             ▼
┌──────────────────┐
│  _apply_fts()     │ ← Update FTS index with PostgreSQL to_tsvector()
└──────────────────┘
```

**Text Extraction Support (`extract.py`):**
| Format | Library | Extracted Elements |
|--------|-------------|-----------------------------|
| PDF | pypdf | Page-by-page text |
| DOCX | python-docx | Paragraphs + table cells |
| PPTX | python-pptx | Slide texts + notes |
| XLSX | openpyxl | Row by row `[Sheet] col1 | col2` |

**Chunk Configuration:**

- `target_chars`: 2400 characters (about 600 tokens)
- `overlap_chars`: 300 characters
- Deterministic splitting by paragraph boundaries

**File Classification Rules:**

```
File path starts with "02 Musterhandbuch/" + extension docx/pptx/xlsx → TEMPLATE
File path starts with "01 Norm/" + extension pdf/docx/doc → REFERENCE
Extension in template set → TEMPLATE (unclassified=true)
Other → REFERENCE (unclassified=true)
```

### 6.2 Planning Pipeline (PLAN)

```
plan_manual
        │
        ▼
┌──────────────────┐
│  _deterministic_  │ ← Scan template assets, collect placeholders
│  plan()           │   Create a deterministic base plan
└──────────────────┘
        │
        ▼
┌──────────────────┐
│  chat_json()      │ ← Optimize plan with OpenAI Chat Completions
│  (plan prompt)    │   system: plan_v1.md prompt
│                   │   user: templates + placeholders + playbook info
└──────────────────┘
        │
        ▼
┌──────────────────┐
│  _validate_plan() │ ← Validate AI response, fallback if invalid
└──────────────────┘
```

**Plan output structure:**

```json
{
    "outputs": [
        {
            "template_asset_id": "uuid",
            "output_rel_path": "outputs/QMH.docx",
            "strategies": {
                "replacement_mode": "SIMPLE_TEXT",
                "draft_groups": [
                    { "tokens": ["QUALITY_POLICY", "SCOPE"], "retrieval_role": "REFERENCE" }
                ]
            }
        }
    ],
    "required_tokens": ["COMPANY_NAME", "SCOPE"],
    "unknown_tokens": ["CUSTOM_TOKEN"]
}
```

### 6.3 Generation Pipeline (GENERATE)

```
execute_generation()
             │
             ▼
┌──────────────────┐
│  build_generation │ ← Create plan (same as 6.2)
│  _plan()          │
└──────────────────┘
             │
             ▼
┌──────────────────────────────────────┐
│  resolve_required_variables()         │
│                                       │
│  Sequential resolution for each token:│
│  1. Is there CUSTOMER_INPUT in DB? → use   │
│  2. Is it in customer_profile? → write     │
│  3. Is there HUMAN_OVERRIDE in DB? → use   │
│  4. Is it in global_overrides? → write     │
│  5. Is there default_value? → use          │
│  6. AI_INFER policy → AI inference         │
│  7. AI_DRAFT policy → RAG + AI             │
│  8. Unresolved → WARN event                │
└──────────────────────────────────────┘
             │
             ▼
┌──────────────────────────┐
│  For each template asset:│
│                          │
│  1. Read template bytes  │
│  2. _build_effective_map │  ← merge base + global + file overrides
│  3. apply_placeholders_  │  ← {{TOKEN}} → value in OOXML XMLs
│     to_ooxml_bytes()     │
│  4. Write output file    │
│  5. _register_generated_ │  ← Create GENERATED_OUTPUT asset record
│     asset()              │
└──────────────────────────┘
```

**Variable Resolution Priority (variables.py):**

| Order | Source                           | `source` value   | Description                    |
| ----- | -------------------------------- | ---------------- | ------------------------------ |
| 1     | Existing CUSTOMER_INPUT in DB    | `CUSTOMER_INPUT` | Previously saved customer data |
| 2     | `customer_profile` request param | `CUSTOMER_INPUT` | Customer profile data          |
| 3     | Existing HUMAN_OVERRIDE in DB    | `HUMAN_OVERRIDE` | Previous manual correction     |
| 4     | `global_overrides` request param | `HUMAN_OVERRIDE` | Instant correction             |
| 5     | `RagVariableKey.default_value`   | `DEFAULT`        | Default value from schema      |
| 6     | AI_INFER policy                  | `AI_INFERRED`    | AI infers in profile context   |
| 7     | AI_DRAFT policy                  | `AI_DRAFTED`     | AI drafts using RAG context    |

**OOXML Placeholder Replacement (`template_apply.py`):**

1. Source file (DOCX/PPTX/XLSX) is opened as ZIP
2. Relevant XML parts are detected:
   - DOCX: `word/*.xml`
   - PPTX: `ppt/*.xml`
   - XLSX: `xl/*.xml`
3. `{{TOKEN}}` patterns in each XML are replaced via regex
4. New ZIP file is written
5. Unresolved tokens are reported

### 6.4 RAG Chat Pipeline

```
chat request
         │
         ▼
┌────────────────┐
│  Router LLM    │ ← Determine intent and filters (router_v1.md)
│  chat_json()   │   Output: { intent, filters: { role, language }, topN }
└────────────────┘
         │
         ▼
┌────────────────┐
│  retrieve_     │ ← Hybrid search:
│  context()     │   1. embed_texts([query]) → query vector
│                │   2. _fetch_vector_rows() → cosine similarity
│                │   3. _fetch_fts_rows() → PostgreSQL FTS
│                │   4. rrf_merge() → Reciprocal Rank Fusion
└────────────────┘
         │
         ▼
┌────────────────┐
│  Answer LLM    │ ← Generate answer with context chunks (chat_answer_v1.md)
│  chat_json()   │   Output: { answer_markdown, citations, suggested_followups }
└────────────────┘
```

**RRF (Reciprocal Rank Fusion) Merge:**

```python
score(chunk) = Σ 1/(k + rank_i)  # k=60
```

Vector and FTS results are merged with RRF to return the most relevant `top_n` chunks.

---

## 7. Package System

### 7.1 Package Catalog (`packages/catalog.py`)

Supported packages are defined in the `STANDARD_PACKAGES` dictionary:

| Package    | Version | Lang | FTS Config | Description                        |
| ---------- | ------- | ---- | ---------- | ---------------------------------- |
| `ISO9001`  | `v1`    | de   | simple     | ISO 9001 Quality Management System |
| `SSCP`     | `v1`    | en   | english    | SSCP Compliance Package            |
| `ISO14007` | `v1`    | en   | english    | ISO 14007 Environmental Management |

### 7.2 Package Configuration Fields

```python
{
        "source_local_prefix": "./data/packages/ISO9001/v1/",  # Source files
        "classification_rules": {                              # File classification
                "reference_prefixes": ["01 Norm", "03 Diverse"],
                "template_prefixes": ["02 Musterhandbuch"],
        },
        "languages": ["de"],
        "fts_config": "simple",                                # PostgreSQL FTS config
        "template_file_exts": ["docx", "pptx", "xlsx"],
        "reference_file_exts": ["pdf", "docx", "doc"],
        "variable_schema_path": "backend/packages/schemas/ISO9001_v1_variables.json",
        "handbook_path": "backend/packages/handbooks/ISO9001_v1_playbook.json",
        "chunking": {"target_chars": 2400, "overlap_chars": 300},
}
```

### 7.3 Variable Schema (`schemas/*.json`)

Variable definitions for each package are stored in a JSON file:

```json
{
    "package_code": "ISO9001",
    "package_version": "v1",
    "variables": [
        {
            "token": "COMPANY_NAME",
            "type": "string",
            "required": true,
            "description": "Legal company name",
            "examples": ["Muster GmbH"],
            "default_value": null,
            "generation_policy": "DETERMINISTIC"
        },
        {
            "token": "QUALITY_POLICY",
            "type": "rich_text",
            "required": true,
            "description": "Quality policy section",
            "default_value": null,
            "generation_policy": "AI_DRAFT"
        }
    ]
}
```

### 7.4 Playbook (`handbooks/*.json`)

Defines the generation strategy:

```json
{
    "package_code": "ISO9001",
    "package_version": "v1",
    "default_output_folder": "outputs",
    "replacement_mode": "SIMPLE_TEXT",
    "draft_groups": [
        {
            "name": "quality_policy",
            "tokens": ["QUALITY_POLICY", "SCOPE"],
            "retrieval_role": "REFERENCE"
        }
    ]
}
```

---

## 8. AI Prompt System

### 8.1 Prompt Registry (`prompts/registry.py`)

All prompts are stored as versioned `.md` files:

| Prompt            | Version | File                    | Usage Area              |
| ----------------- | ------- | ----------------------- | ----------------------- |
| `plan`            | v1      | `plan_v1.md`            | Planning pipeline       |
| `router`          | v1      | `router_v1.md`          | Chat intent routing     |
| `chat_answer`     | v1      | `chat_answer_v1.md`     | Chat answering          |
| `infer_variables` | v1      | `infer_variables_v1.md` | Variable inference      |
| `draft_variables` | v1      | `draft_variables_v1.md` | Variable draft creation |

### 8.2 `chat_json()` Function

All AI calls are made via `chat_json()` in `common/openai_client.py`:

```python
def chat_json(
        model: str,           # e.g. "gpt-4o-mini"
        system_prompt: str,   # Prompt .md file content
        user_prompt: str,     # Dynamic user data
        temperature: float,   # 0 = deterministic
        max_tokens: int,      # Default 2000
        retries: int,         # Retry on JSON parse error
) -> ChatJsonResult
```

**Important:** All AI responses are parsed as JSON. If there is a markdown fence (`\`\`\``), it is automatically stripped. If parsing fails, it is retried.

### 8.3 `embed_texts()` Function

```python
def embed_texts(texts: list[str], model: str) -> tuple[list[list[float]], str]
```

Creates batch embeddings. Returns 1536-dimensional vectors.

---

## 9. File Storage Architecture

### 9.1 Directory Structure

```
data/
├── packages/                          # Source package files (read-only)
│   ├── ISO9001/v1/
│   │   ├── 01 Norm/                   # Reference documents
│   │   ├── 02 Musterhandbuch/         # Template files
│   │   └── 03 Diverse Unterlagen/     # Other materials
│   ├── SSCP/v1/
│   └── ISO14007/v1/
│
└── tenants/                           # Tenant data
        └── <tenant_id>/
                └── manuals/
                        └── <manual_id>/
                                ├── templates/         # Copied/uploaded templates
                                ├── references/        # Copied reference files
                                ├── customer/          # Customer uploads
                                └── outputs/           # AI generation outputs
```

### 9.2 LocalStorage Abstraction

`assets/services/storage.py` contains the base `Storage` class and `LocalStorage` implementation:

| Method                    | Description                                  |
| ------------------------- | -------------------------------------------- |
| `list_files(prefix)`      | Recursively lists all files in a directory   |
| `read_bytes(path)`        | Reads file content as bytes                  |
| `write_bytes(path, data)` | Writes file, auto-creates parent directories |
| `copy_tree(src, dst)`     | Copies directory tree                        |
| `ensure_dir(path)`        | Creates directory if it does not exist       |

> **TODO:** S3Storage implementation is planned but not yet done.

---

## 10. Celery Task Architecture

### 10.1 Tasks

| Task                   | Module                | Retry       | Description               |
| ---------------------- | --------------------- | ----------- | ------------------------- |
| `ingest_manual_task`   | `indexing/tasks.py`   | 2x, backoff | Indexes the entire manual |
| `ingest_asset_task`    | `indexing/tasks.py`   | No          | Indexes a single asset    |
| `plan_manual_task`     | `generation/tasks.py` | No          | Creates generation plan   |
| `generate_manual_task` | `generation/tasks.py` | No          | Runs file generation      |

### 10.2 Sync/Async Model

The `_run_task()` helper is used in the views layer:

```python
def _run_task(task, *, sync: bool, args: list, kwargs: dict | None = None):
        if sync:
                return task.apply(args=args, kwargs=kwargs).get()  # Run synchronously
        task.delay(*args, **kwargs)  # Send to Celery worker
```

- `sync=true`: HTTP response waits, task runs inline
- `sync=false`: Task is queued, returns `202 Accepted` immediately

### 10.3 Run Lifecycle

```
QUEUED → RUNNING → SUCCEEDED
                                 → FAILED
                                 → CANCELLED
```

Each task:

1. Creates a QUEUED run with `create_run()`
2. `mark_run_started()` → RUNNING
3. Writes granular logs with `emit_event()` during processing
4. Success: `mark_run_succeeded(metrics={...})`  
   Failure: `mark_run_failed(metrics={error: "..."})`

---

## 11. Common Modules

### 11.1 Placeholder Engine (`common/placeholders.py`)

```python
PLACEHOLDER_PATTERN = re.compile(r"\{\{([A-Z0-9_]+)\}\}")

extract_placeholder_tokens(text) → list[str]      # Finds {{TOKEN}}
count_placeholder_tokens(text) → Counter[str]     # Counts
replace_placeholders(text, values) → (text, unresolved[])  # Replaces
```

### 11.2 Chunking (`common/chunking.py`)

```python
split_text_deterministic(text, config) → list[str]
```

- Splits by paragraph boundaries (`\n\n`)
- Merges paragraphs until `target_chars` is reached
- Large paragraphs become their own chunk
- Deterministic: Same input → same chunks

### 11.3 Hashing (`common/hashing.py`)

```python
sha256_bytes(value: bytes) → str
sha256_text(value: str) → str
file_sha256(path: Path) → str     # Stream hash with 1MB chunks
```

Chunk and placeholder IDs are generated as deterministic hashes:

- Chunk ID: `sha256(f"{asset_id}:{index}:{sha256(chunk_text)}")`
- Placeholder ID: `sha256(f"{asset_id}:{token}")`

---

## 12. Docker Infrastructure

### 12.1 Services

| Service    | Container         | Port | Purpose                          |
| ---------- | ----------------- | ---- | -------------------------------- |
| `postgres` | `qm-rag-postgres` | 5432 | PostgreSQL with pgvector         |
| `redis`    | `qm-rag-redis`    | 6379 | Celery broker and result backend |
| `django`   | `qm-rag-django`   | 8001 | API server                       |
| `celery`   | `qm-rag-celery`   | —    | Background task worker           |

### 12.2 Startup Commands

```bash
# Django: migrate → runserver
sh -c "python manage.py migrate && python manage.py runserver 0.0.0.0:8001"

# Celery: migrate → worker
sh -c "python manage.py migrate && celery -A config worker -l info"
```

### 12.3 Volume Mounting

```yaml
volumes:
    - .:/app                 # Main project dir → /app (live reload)
    - qm_rag_pg:...          # PostgreSQL data persistence
```

---

## 13. Important Implementation Details

### 13.1 Deduplication

- Assets are protected by the unique constraint `(manual, package_rel_path, sha256)`
- If the same content is uploaded again, it does not create a new record, but updates the existing one

### 13.2 Embedding Batch Processing

- `_apply_embeddings()` processes all chunks in a single OpenAI API call
- Written to DB in bulk with `bulk_update()`

### 13.3 Placeholder Sensitivity

- Placeholder detection in template files is done on raw OOXML XML (`extract_raw_ooxml_text`)
- This is to catch cases where python-docx/pptx splits `{{TOKEN}}` strings into XML runs
- Normal text extraction (`extract_text_for_path`) is used for chunking

### 13.4 Error Handling

- Pipeline errors are logged with `emit_event(level="ERROR")`
- Runs are marked as failed with `mark_run_failed()`
- Manual status is updated to `FAILED`
- Celery auto-retry is only active for `ingest_manual_task` (max 2, exponential backoff)

### 13.5 Data Isolation

- PostgreSQL schema: `search_path=rag,public`
- Files are stored in isolated directories per tenant/manual
- Each variable value is linked to a manual (different clients can have different values for the same token)

---

## 14. Developer Commands

```bash
# Start containers
docker compose up -d

# Django container logs
docker logs qm-rag-django --tail 50

# Celery container logs
docker logs qm-rag-celery --tail 50

# Restart containers (after code change)
docker restart qm-rag-django qm-rag-celery

# Recreate containers (after .env.local change)
docker compose up -d django celery

# Django shell (inside container)
docker exec -it qm-rag-django python manage.py shell

# Create migration
docker exec -it qm-rag-django python manage.py makemigrations

# API test (curl)
curl -s http://localhost:8001/health/
curl -s http://localhost:8001/api/v1/manuals/<id>/assets | python3 -m json.tool
```

---

## 15. Agent Guide — Common Tasks

### Adding a new package:

1. Add new package to `STANDARD_PACKAGES` in `packages/catalog.py`
2. Create new `_variables.json` file in `packages/schemas/`
3. Create new `_playbook.json` file in `packages/handbooks/`
4. Place source files under `data/packages/<CODE>/<VERSION>/`

### Adding a new variable:

1. Add token to the relevant `schemas/<PACKAGE>_<VERSION>_variables.json` file
2. Choose `generation_policy`: `DETERMINISTIC`, `AI_INFER`, or `AI_DRAFT`
3. Add `{{TOKEN}}` to relevant template files

### Adding a new prompt version:

1. Create new `.md` file in `prompts/` (e.g. `plan_v2.md`)
2. Add version to `PROMPT_REGISTRY` in `prompts/registry.py`
3. Update `get_prompt("plan", "v2")` call in the relevant service file

### Adding a new API endpoint:

1. Add view function to the relevant app's `views.py`
2. Add URL pattern to `urls.py`
3. In the view: payload validation, 400/404 responses
4. Write business logic in the service layer (not in views)

### Adding a frontend proxy route:

1. Create Next.js route handler under `src/app/api/`
2. Proxy to Django endpoint with `fetchRag()`
3. Add the relevant React Query hook under `src/hooks/`

---

## 16. Known Limitations and TODOs

| Topic            | Status   | Description                                            |
| ---------------- | -------- | ------------------------------------------------------ |
| S3 Storage       | TODO     | LocalStorage exists, S3Storage is planned but not done |
| Presign Upload   | 501 stub | S3 presign endpoints exist as stubs                    |
| Authentication   | NONE     | No auth/token mechanism in API                         |
| Rate Limiting    | NONE     | No OpenAI rate limit management                        |
| Chunk overlap    | Basic    | Overlap is char-based only, no semantic boundary       |
| OOXML split runs | Partial  | Split placeholders in XML runs can be problematic      |
| Test coverage    | Low      | Unit test files exist but most are empty               |
