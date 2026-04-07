---
type: repo-health
date: 2026-04-07
goal: General health check — all 4 vectors
deployment_target: Serverless (Lambda)
scope: Full repo
---

## CODEBASE HEALTH AUDIT

### EXECUTIVE SUMMARY
- Overall health: FAIR
- Biggest structural risk: `backend/lambda_function.py` is a 1,580-line god module mixing routing, validation, S3 I/O, retry logic, OCR orchestration, and CloudWatch metrics for every endpoint in the application.
- Biggest operational risk: OpenAI client is invoked with the model identifier `"gpt-5.2"` (a non-existent model as of the May-2025 cutoff), and `boto3.client(...)` is re-instantiated on nearly every request path inside Lambda handlers, costing cold-start CPU and connection re-handshakes.
- Total findings: 3 critical, 7 high, 8 medium, 5 low

### TECH DEBT LEDGER

#### CRITICAL

1. **[Operational]** `backend/ocr.py:110, 341, 517` and `backend/ocr.py:128, 532`
   - **The Debt:** Three OpenAI calls hard-code `model="gpt-5.2"`, an identifier that does not exist in OpenAI's catalog. Combined with `timeout=120.0` per call inside a Lambda whose work is OCR-bounded, every upload may instantly 4xx from the API and burn the full 2-minute budget before failing.
   - **The Risk:** Production uploads almost certainly fail or fall back to error paths; cold-start cost amplified by 120 s timeouts; cost overrun risk if model name is silently aliased.

2. **[Structural Design]** `backend/lambda_function.py:1-1580`
   - **The Debt:** Single 1,580-line file holds the API router (`lambda_handler`), all endpoint handlers, the entire upload pipeline (`process_upload_files` ≈360 lines), recipe-merging heuristics, SSRF validation, ETag retry loop, CloudWatch metric publishing, and orphan-image cleanup closures. Cyclomatic complexity in `handle_post_image_request` (~370 lines) and `process_upload_files` is severe; deeply nested try/except 5+ levels.
   - **The Risk:** Any change ripples through unrelated endpoints; impossible to unit-test handlers in isolation; merge conflicts; Lambda cold-start parses 1,580 lines per init.

3. **[Operational]** `backend/lambda_function.py:387, 453, 473, 520, 613, 831, 880, 1083, 1141, 1421, 1508, 1542` (also `backend/embeddings.py:31`, `backend/upload.py:31`)
   - **The Debt:** `boto3.client('s3')` (and `lambda`, `cloudwatch`) constructed inside handler bodies on every invocation rather than at module scope. In `handle_post_image_request` the S3 client is created twice in the same request.
   - **The Risk:** Cold-start penalty (~200-400 ms per client), warm-invoke CPU waste, defeats Lambda container reuse, tail latency on paths already bearing 120 s OpenAI timeouts.

#### HIGH

4. **[Operational]** `backend/lambda_function.py:1140-1178`
   - **The Debt:** `handle_post_request` writes entire upload payload (potentially many MB of base64 PDFs) to S3 under `upload-pending/{job_id}.json`, then re-invokes itself asynchronously via `lambda_client.invoke(InvocationType='Event')`. No payload-size guard, no max files cap.
   - **The Risk:** Lambda 6 MB sync / 256 KB async limits silently fail; S3 fills with abandoned `upload-pending/*` if async invoke fails (no TTL visible).

5. **[Operational]** `backend/lambda_function.py:929-1075`
   - **The Debt:** ETag retry loop nests 4 separate try/except inside `for attempt in range(MAX_RETRIES)`, mixes `time.sleep` with synchronous Lambda execution; cleanup closure captures `s3_path` from outer scope; fall-through "should not reach here" return at 1064 is reachable.
   - **The Risk:** Sleeping inside Lambda burns billed ms; stale closure `s3_path` could be `None`; orphaned images leak silently.

6. **[Architectural]** `backend/lambda_function.py:266-350`
   - **The Debt:** Routing done by substring checks like `'/image' in request_path` and `'/upload/status/' in request_path`. No route table; dispatch intermingled with async-invoke detection.
   - **The Risk:** Substring matching accepts `/foo/image`; new endpoints require editing dispatcher; behavior diverges from `template.yaml`.

7. **[Structural Design]** `frontend/services/UploadService.ts:18-65`
   - **The Debt:** UploadService is a class of `private static` fields — global singleton in disguise. Includes test-only mutators (`_setTestApiUrl`, `_resetForTests`, `_setProcessingForTests`) shipped to production gated only by runtime `process.env.NODE_ENV`.
   - **The Risk:** Cannot run multiple upload contexts; tests share state; production bundle contains test back doors.

8. **[Structural Design]** `frontend/hooks/useQueueState.ts:38-356`
   - **The Debt:** Hook holds 11 ref/state variables and exposes 7 internal setters/refs so other hooks can mutate them. Two `useEffect`s with `eslint-disable react-hooks/exhaustive-deps`.
   - **The Risk:** Central swipe loop; shared mutable refs across hook boundaries make data flow extremely hard to reason about; race conditions hidden behind `generationRef` checks.

9. **[Hygiene]** `backend/lambda_function.py` debug noise
   - **The Debt:** ~30 `debug_log(f"[DEBUG] ...")` calls in `process_upload_files` plus per-recipe `log.info` in inner loops. Even with DEBUG_MODE off, f-strings format eagerly.
   - **The Risk:** CloudWatch log volume + cost; per-invoke string formatting overhead; signal-to-noise problem during incidents.

10. **[Operational]** `npm audit` — `lodash <=4.17.23` (high) prototype-pollution + code-injection
    - **The Debt:** High-severity lodash advisory present with non-breaking fix available.
    - **The Risk:** Exploitability depends on usage; blocks compliance scans.

#### MEDIUM

11. **[Hygiene]** `backend/lambda_function.py:73` `DEBUG_MODE` effectively unused — `debug_log` always calls `log.debug`, making the flag pointless.
12. **[Hygiene]** Vulture: `backend/upload.py:70 to_s3`, `backend/search_image.py:257 select_unique_image_url`, `backend/config.py:17 NEW_RECIPE_HOURS` — dead code.
13. **[Hygiene]** Knip reports 38 unused exports + 29 unused exported types in frontend (`frontend/types/index.ts:21,26 asRecipeKey/asJobId`, `frontend/utils/normalizeRecipe.ts:57,111,162`, `frontend/utils/seo.ts:10,34`, `frontend/components/Menu/index.ts:2-9`, `frontend/components/Checkbox.tsx:18,76,83,89`).
14. **[Architectural]** `frontend/components/ImageGrid.tsx:430` and `frontend/services/IngredientScalingService.ts:371` trending toward god-object territory.
15. **[Operational]** `backend/lambda_function.py:1142` Lambda self-invoke uses env var `FUNCTION_NAME` with no validation — if unset, raises after pending payload already written to S3, leaking pending blobs.
16. **[Operational]** `backend/embedding_generator.py:62` and `backend/image_uploader.py:167` use `requests` without shared `Session` or retry/backoff on transient 5xx.
17. **[Structural Design]** `backend/lambda_function.py:149-207` `merge_incomplete_recipes` mutates `complete[best_match]` in place while iterating over `incomplete`; relies on separate `merged_indices` set.
18. **[Hygiene]** Knip reports `expo-router/entry` missing — stale/misconfigured manifest entry.

#### LOW

19. **[Hygiene]** `backend/lambda_function.py:266` vulture flags `lambda_handler` itself — missing allowlist.
20. **[Hygiene]** `frontend/scripts/deploy.js:432` builds SAM `--parameter-overrides` with raw interpolation of keys — no escaping for shell-special characters.
21. **[Hygiene]** `backend/lambda_function.py:344` indentation drift inside elif.
22. **[Hygiene]** Inconsistent error response shape: `{'error'}`, `{'success': false, 'error'}`, `{'returnMessage'}`. Frontend handles three contracts.
23. **[Hygiene]** `backend/ocr.py:42-47` `_repair_partial_json` naive bracket counting ignores brackets/quotes inside string literals.

### QUICK WINS
- `npm audit fix` to clear lodash high-sev advisory.
- Fix `model="gpt-5.2"` → real model identifier (3 sites in `backend/ocr.py`).
- Hoist `boto3.client('s3')` and `boto3.client('lambda')` to module scope (~12 call sites).
- Delete dead helpers (`to_s3`, `select_unique_image_url`, `NEW_RECIPE_HOURS`, `DEBUG_MODE`).
- Delete knip-flagged unused exports (38 functions + 29 types).
- Replace substring router in `lambda_handler` with a route table.

### AUTOMATED SCAN RESULTS
- **knip (frontend):** 38 unused exports, 29 unused exported types, 2 stale entry hints.
- **vulture (backend):** `config.py:17 NEW_RECIPE_HOURS`, `lambda_function.py:73 DEBUG_MODE`, `lambda_function.py:1299 recipe_idx`, `search_image.py:257 select_unique_image_url`, `upload.py:70 to_s3`.
- **npm audit:** 6 vulns (5 low, 1 high). High = `lodash <=4.17.23`; fix via `npm audit fix`. Lows are `@tootallnate/once` chain through `jest-expo`.
- **pip-audit:** No known vulnerabilities.
- **Secrets grep:** No hard-coded secrets tracked. `.env` git-ignored.
- **Git hygiene:** Clean working tree; active dependency hygiene commits; lodash advisory reintroduced or missed.
