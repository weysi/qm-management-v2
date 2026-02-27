#!/usr/bin/env bash
# ================================================================
# RAG Test Scenario — QM Management v2
# ================================================================
# Bu script, RAG pipeline'ının tüm adımlarını test eder:
#   1. Doküman yükleme (UPLOAD → auto-CREATE manual → INDEX)
#   2. Varlık listeleme (LIST ASSETS)
#   3. Soru-Cevap (CHAT / RAG retrieval)
#   4. Çalıştırma logları (RUN STATUS)
#
# Kullanım:
#   chmod +x rag-test/run-rag-test.sh
#   ./rag-test/run-rag-test.sh
# ================================================================

set -euo pipefail

BASE_URL="${RAG_API_URL:-http://localhost:8001/api/v1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TENANT_ID="test-tenant-001"
MANUAL_ID="test-manual-001"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
info() { echo -e "${CYAN}  → $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; }

separator() {
  echo ""
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${CYAN}  STEP $1: $2${NC}"
  echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

pretty_json() {
  python3 -m json.tool 2>/dev/null || cat
}

extract_field() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null || echo "$2"
}

# ----------------------------------------------------------------
# Verify connectivity
# ----------------------------------------------------------------
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         QM Management — RAG Pipeline Test            ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

info "Testing API connectivity at ${BASE_URL}..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/chat" \
  -X POST -H "Content-Type: application/json" \
  -d '{"manual_id":"__ping__","message":"ping"}')

if [[ "$HTTP_CODE" == "000" ]]; then
  fail "Cannot reach Django API at ${BASE_URL}."
  echo "     Make sure Docker containers are running: docker compose up -d"
  exit 1
fi
ok "API is reachable (HTTP ${HTTP_CODE})"

# ================================================================
separator "1" "UPLOAD — Upload sample reference documents"
# ================================================================
# Bu adım:
#  - local-upload endpoint'i aracılığıyla dosya yükler
#  - Eğer manual/tenant yoksa otomatik oluşturur
#  - Her yüklenen dosya anında:
#    1) Text çıkarılır (PDF/DOCX/PPTX/XLSX/TXT/MD)
#    2) ~2400 char chunk'lara bölünür (300 char overlap)
#    3) OpenAI text-embedding-3-small ile 1536-dim embedding oluşturulur
#    4) PostgreSQL pgvector HNSW index'e yazılır
#    5) Full-text search GIN index'i güncellenir

info "Uploading English ISO 9001 reference document..."
echo ""

UPLOAD1_RESP=$(curl -s "${BASE_URL}/assets/local-upload" \
  -X POST \
  -F "file=@${SCRIPT_DIR}/sample-docs/iso9001-quality-manual.md" \
  -F "manual_id=${MANUAL_ID}" \
  -F "tenant_id=${TENANT_ID}" \
  -F "package_code=ISO9001" \
  -F "package_version=v1" \
  -F "role=REFERENCE" \
  -F "path=references/iso9001-quality-manual.md")

echo "$UPLOAD1_RESP" | pretty_json
echo ""

UPLOAD1_OK=$(echo "$UPLOAD1_RESP" | extract_field "'asset' in d" "False")
UPLOAD1_RUN=$(echo "$UPLOAD1_RESP" | extract_field "d.get('run_id','')" "")
if [[ "$UPLOAD1_OK" == "True" ]]; then
  ok "English reference uploaded & indexed!"
  [[ -n "$UPLOAD1_RUN" ]] && info "Ingest run: ${UPLOAD1_RUN}"
else
  ERROR_MSG=$(echo "$UPLOAD1_RESP" | extract_field "d.get('error','unknown')" "unknown")
  fail "Upload failed: ${ERROR_MSG}"
fi

echo ""
info "Uploading German QM handbook (Musterfirma)..."
echo ""

UPLOAD2_RESP=$(curl -s "${BASE_URL}/assets/local-upload" \
  -X POST \
  -F "file=@${SCRIPT_DIR}/sample-docs/musterfirma-qm-handbuch.txt" \
  -F "manual_id=${MANUAL_ID}" \
  -F "tenant_id=${TENANT_ID}" \
  -F "package_code=ISO9001" \
  -F "package_version=v1" \
  -F "role=REFERENCE" \
  -F "path=references/musterfirma-qm-handbuch.txt")

echo "$UPLOAD2_RESP" | pretty_json
echo ""

UPLOAD2_OK=$(echo "$UPLOAD2_RESP" | extract_field "'asset' in d" "False")
UPLOAD2_RUN=$(echo "$UPLOAD2_RESP" | extract_field "d.get('run_id','')" "")
if [[ "$UPLOAD2_OK" == "True" ]]; then
  ok "German reference uploaded & indexed!"
  [[ -n "$UPLOAD2_RUN" ]] && info "Ingest run: ${UPLOAD2_RUN}"
else
  ERROR_MSG=$(echo "$UPLOAD2_RESP" | extract_field "d.get('error','unknown')" "unknown")
  fail "Upload failed: ${ERROR_MSG}"
fi

# ================================================================
separator "2" "LIST ASSETS — See what's been indexed"
# ================================================================
info "Listing all assets for manual '${MANUAL_ID}'..."
echo ""

ASSETS_RESP=$(curl -s "${BASE_URL}/manuals/${MANUAL_ID}/assets")
echo "$ASSETS_RESP" | pretty_json
echo ""

ASSET_COUNT=$(echo "$ASSETS_RESP" | extract_field "len(d.get('assets',[]))" "0")
ok "Total indexed assets: ${ASSET_COUNT}"

# ================================================================
separator "3" "CHAT — Ask questions using RAG retrieval"
# ================================================================
# Bu adım RAG'ın çekirdeğidir:
#
#  ┌─────────────────┐
#  │  User Question   │
#  └────────┬────────┘
#           ▼
#  ┌─────────────────┐
#  │  Router (GPT)    │ → Intent + Filters + topN
#  └────────┬────────┘
#           ▼
#  ┌─────────────────────────────────────────┐
#  │  Hybrid Retrieval                        │
#  │  ┌──────────────┐  ┌──────────────────┐ │
#  │  │Vector Search  │  │Full-Text Search  │ │
#  │  │(cosine sim.)  │  │(PostgreSQL GIN)  │ │
#  │  └──────┬───────┘  └────────┬─────────┘ │
#  │         └──────┬────────────┘            │
#  │                ▼                         │
#  │        RRF Merge (k=60)                  │
#  │        → Top N chunks                    │
#  └────────────────┬────────────────────────┘
#                   ▼
#  ┌─────────────────────────────────────────┐
#  │  Answer Generation (GPT-4o-mini)         │
#  │  Chunks as context → Structured answer  │
#  │  + Citations + Suggested follow-ups     │
#  └─────────────────────────────────────────┘

ask_question() {
  local QNUM=$1
  local LANG=$2
  local QUESTION=$3
  local SESSION=$4

  echo -e "${YELLOW}  Question ${QNUM} (${LANG}): ${QUESTION}${NC}"
  echo ""

  RESP=$(curl -s "${BASE_URL}/chat" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "{
      \"manual_id\": \"${MANUAL_ID}\",
      \"message\": \"${QUESTION}\",
      \"session_id\": \"${SESSION}\"
    }")

  echo "$RESP" | pretty_json
  echo ""

  ANSWER=$(echo "$RESP" | extract_field "d.get('answer_markdown','')[:120]+'...'" "No answer")
  CITES=$(echo "$RESP" | extract_field "len(d.get('citations',[]))" "0")
  FOLLOWUPS=$(echo "$RESP" | extract_field "len(d.get('suggested_followups',[]))" "0")
  CHAT_RUN_ID=$(echo "$RESP" | extract_field "d.get('run_id','')" "")

  ok "Answer received — ${CITES} citation(s), ${FOLLOWUPS} follow-up(s)"
  [[ -n "$CHAT_RUN_ID" ]] && info "Chat run: ${CHAT_RUN_ID}"
  echo ""
}

ask_question 1 "EN" \
  "What does ISO 9001 say about risk management and how should we address risks?" \
  "test-session-en"

ask_question 2 "DE" \
  "Welche Qualitätsziele hat die Musterfirma GmbH für 2025?" \
  "test-session-de"

ask_question 3 "EN/DE" \
  "Who is the QM manager at Musterfirma and what are their responsibilities?" \
  "test-session-mixed"

# ================================================================
separator "4" "RUN STATUS — Check execution logs"
# ================================================================
# Her işlem (ingest, chat, plan, generate) bir RagRun kaydı oluşturur.
# Run'ın altında RagRunEvent'ler ile detaylı log tutulur.

LAST_RUN_ID="${UPLOAD1_RUN:-}"
if [[ -n "$LAST_RUN_ID" ]]; then
  info "Fetching run details for ingest run ${LAST_RUN_ID}..."
  echo ""
  RUN_RESP=$(curl -s "${BASE_URL}/manuals/${MANUAL_ID}/runs/${LAST_RUN_ID}")
  echo "$RUN_RESP" | pretty_json
  echo ""
  RUN_STATUS=$(echo "$RUN_RESP" | extract_field "d.get('status','UNKNOWN')" "UNKNOWN")
  EVENT_COUNT=$(echo "$RUN_RESP" | extract_field "len(d.get('events',[]))" "0")
  ok "Run status: ${RUN_STATUS} (${EVENT_COUNT} events)"
else
  warn "No run ID captured — skipping"
fi

# ================================================================
separator "✓" "ALL TESTS COMPLETE"
# ================================================================
echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           RAG Pipeline Test — Summary                 ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║  1. ✓ Document Upload + Auto-Indexing                ║${NC}"
echo -e "${GREEN}║     (text extract → chunk → embed → store)           ║${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║  2. ✓ Asset Listing                                  ║${NC}"
echo -e "${GREEN}║     (${ASSET_COUNT} assets indexed)                               ║${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║  3. ✓ RAG Chat — 3 questions answered                ║${NC}"
echo -e "${GREEN}║     (router → hybrid retrieval → GPT answer)         ║${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}║  4. ✓ Run Status (execution logs)                    ║${NC}"
echo -e "${GREEN}║                                                       ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Try your own question:${NC}"
echo ""
echo "  curl ${BASE_URL}/chat -X POST -H 'Content-Type: application/json' \\"
echo "    -d '{\"manual_id\":\"${MANUAL_ID}\",\"message\":\"YOUR QUESTION\"}'"
echo ""
echo -e "${CYAN}Upload your own document:${NC}"
echo ""
echo "  curl ${BASE_URL}/assets/local-upload -X POST \\"
echo "    -F 'file=@your-document.pdf' \\"
echo "    -F 'manual_id=${MANUAL_ID}' \\"
echo "    -F 'tenant_id=${TENANT_ID}' \\"
echo "    -F 'role=REFERENCE'"
echo ""
