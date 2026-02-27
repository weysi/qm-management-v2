# RAG Pipeline — How It Works

> Bu doküman, projenin RAG (Retrieval-Augmented Generation) yapısını basit bir şekilde açıklar.

---

## RAG Nedir?

**RAG = Retrieval-Augmented Generation** — Yapay zekanın soruları cevaplarken "kendi bilgisini uydurmak" yerine **gerçek dokümanlardan bilgi bulup** cevap vermesi.

Basit analoji:

- **RAG olmadan**: Birisi sana soru soruyor, sen aklındakilerden cevap veriyorsun (hallüsinasyon riski yüksek)
- **RAG ile**: Birisi soru soruyor, sen önce kütüphanedeki kitapları karıştırıp ilgili sayfaları buluyorsun, sonra o sayfalara bakarak cevap veriyorsun

---

## Sistem Mimarisi

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐
│   Next.js    │────▶│   Django     │────▶│  PostgreSQL  │     │   Redis    │
│  (Frontend)  │     │   (API)      │     │  + pgvector  │     │  (Queue)   │
│  port 3000   │     │  port 8001   │     │  port 5432   │     │ port 6379  │
└─────────────┘     └──────┬───────┘     └──────────────┘     └─────┬──────┘
                           │                                        │
                           │         ┌──────────────┐               │
                           ├────────▶│   OpenAI API  │               │
                           │         │  (Embedding   │               │
                           │         │   + Chat)     │               │
                           │         └──────────────┘               │
                           │                                        │
                           └────────────────────────────────────────┘
                                     Celery (async tasks)
```

### Docker Servisleri

| Servis       | Image                    | Rolü                                               |
| ------------ | ------------------------ | -------------------------------------------------- |
| **postgres** | `pgvector/pgvector:pg16` | Veritabanı + vektör araması (embedding'ler burada) |
| **redis**    | `redis:7-alpine`         | Celery mesaj kuyruğu                               |
| **django**   | Python 3.12              | API sunucusu (port 8001)                           |
| **celery**   | Aynı image               | Arka plan görevleri (ingest, plan, generate)       |

---

## Pipeline Adımları

### Adım 1: INGEST (Doküman Yükleme + İndeksleme)

```
Dosya Yükleme → Text Çıkarma → Chunk'lara Bölme → Embedding → Veritabanına Yazma
```

**Ne yapıyor?**

1. **Dosya yüklenir** (PDF, DOCX, PPTX, XLSX desteklenir)
2. **Text çıkarılır** — Her dosya formatına göre farklı kütüphane kullanılır:
   - PDF → `pypdf`
   - DOCX → `python-docx`
   - PPTX → `python-pptx`
   - XLSX → `openpyxl`
3. **Chunk'lara bölünür** — Büyük metinler ~2400 karakterlik parçalara bölünür (300 char overlap ile)
4. **Embedding oluşturulur** — OpenAI `text-embedding-3-small` modeli ile her chunk 1536 boyutlu bir vektöre dönüştürülür
5. **Veritabanına yazılır** — Hem vektör (HNSW index) hem de full-text search index (GIN) oluşturulur

**Neden chunk'lara bölüyoruz?**

- AI modelleri sınırlı context window'a sahip
- Küçük parçalar daha doğru arama sonuçları verir
- Overlap sayesinde paragraf sınırlarındaki bilgi kaybolmaz

### Adım 2: RETRIEVAL (Bilgi Getirme) — Hybrid Search

Soru sorulduğunda iki farklı arama birlikte çalışır:

```
Kullanıcı Sorusu
       │
       ├──▶ Vector Search (Anlam bazlı)
       │    Soru → embedding → cosine similarity → En yakın chunk'lar
       │
       ├──▶ Full-Text Search (Kelime bazlı)
       │    Soru → tsquery → PostgreSQL GIN index → Eşleşen chunk'lar
       │
       └──▶ RRF Merge (Birleştirme)
            İki sonucu Reciprocal Rank Fusion ile birleştirir
            → En iyi top-N chunk'ı döndürür
```

**Neden iki arama?**

- **Vector search**: "Kalite yönetimi" sorusunda "quality management" içeren chunk'ları da bulur (anlamsal benzerlik)
- **Full-text search**: Tam eşleşme gereken terimler için daha iyi (ISO numaraları, isimler, vb.)
- **RRF**: İkisinin en iyisini alır

### Adım 3: GENERATION (Cevap Üretme)

```
Bulunan Chunk'lar + Kullanıcı Sorusu → GPT-4o-mini → Cevap + Kaynaklar
```

1. **Router** — Önce sorunun türü sınıflandırılır (genel soru, şablon sorusu, şirket sorusu...)
2. **Context oluşturulur** — Bulunan chunk'lar bir prompt'a eklenir
3. **GPT-4o-mini** — Chunks context ile birlikte cevap üretir
4. **Citations** — Hangi chunk'lardan yararlandığını belirtir (kaynak gösterme)

---

## Veritabanı Modelleri (Basitleştirilmiş)

```
RagTenant (Müşteri/Kiracı)
  └── RagManual (Handbuch)
        ├── RagAsset (Dosya: template, referans, output)
        │     ├── RagDocumentChunk (Text parçaları + embedding + FTS)
        │     └── RagTemplatePlaceholder ({{TOKEN}} bulunanlar)
        ├── RagVariableKey (Değişken tanımları)
        ├── RagVariableValue (Çözülmüş değerler)
        └── RagRun (Çalıştırma logları)
              └── RagRunEvent (Detaylı log events)
```

---

## API Endpoints

| Endpoint                                | Method | Açıklama                                   |
| --------------------------------------- | ------ | ------------------------------------------ |
| `/api/v1/manuals/<id>/start-package`    | POST   | Manual oluştur + paket dosyalarını indexle |
| `/api/v1/manuals/<id>/ingest`           | POST   | Mevcut manual'ı yeniden indexle            |
| `/api/v1/assets/local-upload`           | POST   | Dosya yükle (anında indexlenir)            |
| `/api/v1/manuals/<id>/assets`           | GET    | İndexlenmiş dosyaları listele              |
| `/api/v1/chat`                          | POST   | **RAG Chat — Soru sor, cevap al**          |
| `/api/v1/manuals/<id>/plan`             | POST   | Template doldurmak için plan oluştur       |
| `/api/v1/manuals/<id>/generate`         | POST   | Template'leri doldur (AI + deterministic)  |
| `/api/v1/manuals/<id>/runs/<id>`        | GET    | Çalıştırma durumu + loglar                 |
| `/api/v1/assets/<id>/binary`            | GET    | Dosya indir                                |
| `/api/v1/manuals/<id>/outputs/download` | POST   | ZIP olarak output'ları indir               |

---

## Test Nasıl Çalıştırılır?

### Ön Koşullar

1. Docker container'ları çalışıyor olmalı:

   ```bash
   docker compose up -d
   ```

2. Celery worker (opsiyonel — test script'i `sync=true` kullanır):

   ```bash
   docker compose up -d celery
   ```

3. `.env.local` dosyasında `OPENAI_API_KEY` olmalı

### Test'i Çalıştırma

```bash
cd /Users/veysiocak/Desktop/qm-management-v2
./rag-test/run-rag-test.sh
```

### Test Script'i Ne Yapıyor?

| Adım | İşlem              | Açıklama                                        |
| ---- | ------------------ | ----------------------------------------------- |
| 1    | `start-package`    | Manual oluşturur, ISO9001 paketini yükler       |
| 2    | `local-upload` × 2 | 2 örnek doküman yükler (EN + DE)                |
| 3    | `list assets`      | İndexlenmiş dosyaları gösterir                  |
| 4    | `chat` × 3         | 3 farklı soru sorar ve RAG cevaplarını gösterir |
| 5    | `runs`             | Çalıştırma loglarını kontrol eder               |

### Manuel Test (curl ile)

Kendi sorunuzu sormak için:

```bash
curl http://localhost:8001/api/v1/chat \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "manual_id": "test-manual-001",
    "message": "What are the quality objectives?",
    "session_id": "my-session"
  }'
```

Dosya yüklemek için:

```bash
curl http://localhost:8001/api/v1/assets/local-upload \
  -X POST \
  -F "file=@my-document.pdf" \
  -F "manual_id=test-manual-001" \
  -F "tenant_id=test-tenant-001" \
  -F "role=REFERENCE"
```

---

## Konfigürasyon

Tüm ayarlar `docker-compose.yml` environment değişkenlerinden gelir:

| Değişken             | Değer                    | Açıklama                        |
| -------------------- | ------------------------ | ------------------------------- |
| `OPENAI_CHAT_MODEL`  | `gpt-4o-mini`            | Chat ve cevap üretimi           |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | Embedding modeli (1536 dim)     |
| `RAG_DATA_ROOT`      | `/app/data`              | Dosyaların saklandığı kök dizin |
| `DATABASE_URL`       | `postgresql://...`       | PostgreSQL+pgvector bağlantısı  |
| `CELERY_BROKER_URL`  | `redis://...`            | Async task kuyruğu              |

---

## Dosya Yapısı (Sadece RAG ile ilgili)

```
backend/
├── rag/                          # RAG çekirdeği
│   ├── models.py                 # 9 veritabanı modeli
│   ├── views.py                  # Chat endpoint
│   └── services/
│       ├── chat.py               # Router → Retrieval → Answer
│       └── retrieval.py          # Hybrid search (vector + FTS + RRF)
│
├── indexing/                     # Doküman işleme
│   ├── tasks.py                  # Celery task'ları
│   └── services/
│       ├── ingestion.py          # Ana pipeline (copy → extract → chunk → embed)
│       └── extract.py            # PDF/DOCX/PPTX/XLSX text çıkarma
│
├── generation/                   # Template doldurmak
│   ├── views.py                  # start-package, ingest, plan, generate endpoints
│   ├── tasks.py                  # Celery task'ları
│   └── services/
│       ├── planning.py           # AI plan oluşturma
│       ├── execution.py          # Template uygulama
│       ├── variables.py          # Değişken çözümleme (deterministic → AI)
│       └── template_apply.py     # OOXML {{TOKEN}} replacement
│
├── assets/                       # Dosya yönetimi
│   ├── views.py                  # Upload, download, list endpoints
│   └── services/storage.py       # Dosya sistemi (LocalStorage)
│
├── packages/                     # Paket sistemi
│   ├── catalog.py                # ISO9001, SSCP, ISO14007 config
│   ├── schemas/                  # Variable tanımları (JSON)
│   └── playbooks/                # Üretim planı (JSON)
│
├── prompts/                      # AI prompt'ları
│   ├── router_v1.md              # Soru sınıflandırma
│   ├── chat_answer_v1.md         # Cevap üretme
│   ├── plan_v1.md                # Plan oluşturma
│   ├── infer_variables_v1.md     # Değişken çıkarma
│   └── draft_variables_v1.md     # Değişken taslağı (RAG ile)
│
├── common/                       # Ortak yardımcılar
│   ├── openai_client.py          # OpenAI API client
│   ├── chunking.py               # Text bölme
│   ├── hashing.py                # SHA-256
│   └── placeholders.py           # {{TOKEN}} regex
│
└── runs/                         # Çalıştırma logları
    ├── views.py                  # Run detay endpoint
    └── services/run_logger.py    # Run lifecycle yönetimi
```
