# SavorSwipe Architecture

One-page system overview. For deployment mechanics see
[DEPLOYMENT.md](DEPLOYMENT.md); for contributor workflow see
[../CONTRIBUTING.md](../CONTRIBUTING.md).

## Component Diagram

```mermaid
flowchart LR
    subgraph Client[Frontend - Expo Router]
        UI[Swipe / Search / Detail screens]
        Ctx[RecipeContext]
        IQ[ImageQueueService<br/>useImageQueue]
        RS[RecipeService]
        US[UploadService]
        UI --> Ctx
        Ctx --> RS
        Ctx --> IQ
        UI --> US
    end

    subgraph AWS[AWS]
        APIGW[API Gateway v2]
        Lambda[Lambda dispatcher<br/>lambda_function.py]
        OCR[ocr.py]
        Search[search_image.py]
        Upload[upload.py]
        Embed[embeddings.py +<br/>duplicate_detector.py]
        S3[(S3 bucket)]
        CF[CloudFront CDN]
        Lambda --> OCR
        Lambda --> Search
        Lambda --> Upload
        Upload --> Embed
        Lambda --> S3
        S3 --> CF
    end

    OpenAI[(OpenAI Vision +<br/>Embeddings)]
    Google[(Google Custom<br/>Search)]

    RS -->|GET /recipes<br/>DELETE /recipe/:id<br/>POST /recipe/:id/image<br/>GET /upload/status/:jobId| APIGW
    US -->|POST /recipe/upload| APIGW
    APIGW --> Lambda
    OCR --> OpenAI
    Embed --> OpenAI
    Search --> Google
    IQ -->|image fetch| CF
```

## Upload Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend (UploadService)
    participant GW as API Gateway
    participant L as Lambda dispatcher
    participant OCR as ocr.py / OpenAI
    participant E as embeddings.py
    participant S3 as S3

    U->>FE: Pick images / PDFs
    FE->>FE: Queue + persist (AsyncStorage)
    FE->>GW: POST /recipe/upload (batch)
    GW->>L: Invoke
    L->>L: Async self-invoke for long jobs
    par Parallel OCR (3 workers)
        L->>OCR: Extract recipe text
        OCR-->>L: Structured recipe
    end
    L->>E: Generate embedding
    E->>S3: Read embeddings + ETag
    E->>E: Cosine similarity vs corpus (>=0.85 = duplicate)
    L->>S3: Atomic write combined_data.json (ETag CAS, retry MAX_RETRIES)
    L->>S3: Write upload-status/{jobId}.json
    FE->>GW: GET /upload/status/{jobId} (poll)
    GW->>L: Invoke
    L->>S3: Read status
    L-->>FE: success
    FE->>FE: useImageQueue injects new recipe at swipe pos 2
```

## S3 Data Layout

| Key | Purpose | Notes |
|---|---|---|
| `jsondata/combined_data.json` | All recipe metadata | Single document, ETag-locked writes |
| `jsondata/recipe_embeddings.json` | 1536-dim vectors | Used for duplicate detection |
| `images/{key}.jpg` | Recipe images | Served via CloudFront |
| `upload-status/{jobId}.json` | Async job completion flags | 7-day lifecycle TTL |
| `upload-pending/{jobId}.json` | Pending async job payloads | Cleared on completion |

## Boundaries and Invariants

- Frontend never talks to S3 directly for writes; all mutations go through
  API Gateway -> Lambda.
- Lambda constructs `boto3` clients at module scope (cold-start optimization).
- Routing uses an explicit dispatch table keyed on `(method, path_pattern)`;
  no substring matching.
- All backend responses use the envelope `{success, error?, data?}`.
- Recipe data is normalized via `normalizeRecipe()` before consumption;
  downstream code branches on the `kind` discriminant.
