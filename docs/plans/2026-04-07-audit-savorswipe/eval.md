---
type: repo-eval
date: 2026-04-07
role_level: Senior Developer
focus_areas: balanced
pillar_overrides: none
---

## HIRE EVALUATION — The Pragmatist

### VERDICT
- **Decision:** HIRE
- **Overall Grade:** A
- **One-Line:** Senior-grade full-stack work — type-rigorous frontend, defensively-coded backend with optimistic locking and structured observability — held back from S only by a 1,580-line god-module Lambda entry point.

### SCORECARD
| Pillar | Score | Evidence |
|---|---|---|
| Problem-Solution Fit | 9/10 | `frontend/services/ImageQueueService.ts:8-14`, `backend/lambda_function.py:12-37` |
| Architecture | 8/10 | `backend/embeddings.py:106-137`, `frontend/types/index.ts:14-28`; deduction: `backend/lambda_function.py:1-1580` god module |
| Code Quality | 9/10 | `backend/embeddings.py:33-104`, `frontend/services/ImageQueueService.ts:46-63`; only 8 `any` uses in frontend |
| Creativity | 9/10 | `backend/embeddings.py:118-137` ETag optimistic concurrency, `backend/lambda_function.py:100-120` title similarity + cosine dedup |

### HIGHLIGHTS
- Branded nominal types (`RecipeKey`, `JobId`) prevent ID confusion — `frontend/types/index.ts:14-28`.
- Discriminated unions for 4 ingredient/direction shapes — `frontend/types/index.ts:34-66`.
- S3 ETag-based optimistic locking + backoff — `backend/embeddings.py:106-137`.
- Structured logger (229 calls, 9 modules).
- `Promise.allSettled` with per-key failure tracking — `frontend/services/ImageQueueService.ts:46-63`.
- Honest, reasoned auth omission — `backend/lambda_function.py:12-37`.

### REMEDIATION TARGETS
**Architecture 8 → 9** — Split `backend/lambda_function.py` into `routes/`, `services/recipe_completeness.py`, `services/title_similarity.py`. Keep `lambda_function.py` as a thin dispatcher (<200 lines). Complexity: Medium.

---

## STRESS EVALUATION — The Oncall Engineer

### VERDICT
SHIPPABLE for single-user/personal scope. Biggest 3am risks: the 1,580-line monolithic Lambda handler, the async-invoke handoff that can silently lose jobs, and defensive gaps in the embedding/upload pipeline.

### SCORECARD
| Pillar | Score | Evidence |
|---|---|---|
| Pragmatism | 7/10 | `backend/lambda_function.py:1-1580` god file; reasonable SAM defaults `backend/template.yaml:103-138` |
| Defensiveness | 8/10 | SSRF hardened `backend/image_uploader.py:112-193`, `backend/lambda_function.py:679-724`; ETag locking + orphan cleanup `backend/lambda_function.py:929-1075`; idempotent delete `backend/lambda_function.py:636-650` |
| Performance | 6/10 | `ThreadPoolExecutor(max_workers=3)` `backend/lambda_function.py:1361`; OpenAI 120s × 3 within 600s Lambda timeout `backend/ocr.py:128`/`backend/template.yaml:112`; per-request `boto3.client('s3')` re-instantiation ~12 sites |
| Type Rigor | 9/10 | Branded types + discriminated unions; 8 `any` total in frontend; typed Python returns `backend/lambda_function.py:210-263` |

### CRITICAL FAILURE POINTS
1. Async invoke fire-and-forget loses jobs silently — `backend/lambda_function.py:1140-1191`. No DLQ in `backend/template.yaml:103-138`, no `OnFailure`.
2. Monolithic handler — 1,580 lines, nested try/except 5+ levels deep in retry loop.
3. `process_upload_files` swallows ParseJSON failure — `backend/lambda_function.py:1349-1351`; recipes may silently vanish.
4. Position→key mapping fragility — `backend/lambda_function.py:1467-1473`; silent miss degrades dedup.
5. SSRF check TOCTOU at entry — `backend/lambda_function.py:679-724`; mitigated only by `_PinnedHostnameAdapter`.
6. CORS `'*'` in dev mode — `backend/template.yaml:149-156`; no deploy-time guardrail.
7. ThrottlingRateLimit 1000 — `backend/template.yaml:175`; no `ReservedConcurrentExecutions`; OpenAI bill blast radius.

### HIGHLIGHTS
- Defense in depth on image fetching (HTTPS-only, public-IP enforcement, pinned TLS SNI, no redirects).
- Timeouts on every external call.
- Excellent type rigor (branded, exhaustive discriminated unions).

### REMEDIATION TARGETS
1. Add Lambda async DLQ / `OnFailure` + janitor for stale `upload-pending/`.
2. Split `backend/lambda_function.py` into `routes/`, `pipeline/process_upload.py`, thin dispatcher.
3. Module-scope boto3 clients (~12 call sites).
4. Add `ReservedConcurrentExecutions` + tighter `ThrottlingRateLimit` (~5 rps).
5. Tighten error accounting in `process_upload_files` (ParseJSON failures → file_errors).
6. Deploy-time guard blocking `IsDevMode=true` in prod stack.
7. Per-recipe wall-clock budget in `ThreadPoolExecutor` path.

---

## DAY 2 EVALUATION — The Team Lead

### VERDICT
Strong onboarding posture. Monorepo with clear conventions, conventional commits, husky pre-commit, working CI with path filtering, ~25 frontend + 12 backend test files. Key gaps: no Dockerfile/devcontainer, no Python lockfile, tests skew unit-heavy with limited true e2e.

### SCORECARD
| Pillar | Score | Evidence |
|---|---|---|
| Test Value | 7/10 | 25 frontend tests across `frontend/components/__tests__/`, `frontend/services/__tests__/`, `frontend/hooks/__tests__/`; 12 backend pytest files using moto; `tests/integration/upload-flow.test.ts` et al.; ~80/20/0 unit/integration/e2e; sequential+concurrent hook scenarios show race-condition thought |
| Reproducibility | 6/10 | `package-lock.json` committed; `backend/requirements.txt` only (no `uv.lock` despite CLAUDE.md mandating `uv pip`); no `Dockerfile` or `.devcontainer/`; `.env.example` present; CI pins Node 24 / Python 3.13 (`ci.yml:54,82`); deploy is interactive |
| Git Hygiene | 9/10 | Conventional commits + commitlint + Husky; recent 30 all conform; PRs squash-merged per `CONTRIBUTING.md:51`; dependabot with auto-merge gating |
| Onboarding | 8/10 | `README.md` Prerequisites + Quick Start; `CONTRIBUTING.md` covers process; `CLAUDE.md` excellent architecture map; `.env.example` annotated. Missing: troubleshooting, architecture diagram, first-issue pointers, local SAM invoke docs |

### RED FLAGS
- No Python lockfile despite `uv` policy — runtime drift risk.
- No Dockerfile/devcontainer — bare-metal onboarding.
- Zero true e2e tests (no Detox/Playwright) for swipe+upload+OCR.
- `npm run deploy` interactive-only; no CI deploy path.
- Verify `jest` `testPathIgnorePatterns` excludes `node_modules`.

### HIGHLIGHTS
- `CLAUDE.md` doubles as senior-quality onboarding doc.
- CI uses `dorny/paths-filter` + `status-check` aggregator (`ci.yml:100-119`).
- `npm run check` aggregates lint + type-check + FE/BE tests.
- moto fixtures in `tests/backend/conftest.py`, `mocks.py`.
- Dependabot auto-merge with major-version skip.

### REMEDIATION TARGETS
1. Add `backend/uv.lock` (or locked `pyproject.toml`) and CI `uv sync`.
2. Add `Dockerfile` or `.devcontainer/devcontainer.json`.
3. Add ≥1 Detox/Playwright e2e for swipe+upload happy path.
4. Document `sam local invoke` + non-interactive `deploy:ci` script.
5. Add `docs/ARCHITECTURE.md` with flow diagram.
6. Audit `jest.config` `testPathIgnorePatterns`.
7. "Good first issue" convention + 2-3 starter issues.
