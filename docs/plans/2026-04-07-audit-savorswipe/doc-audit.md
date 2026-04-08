---
type: doc-health
date: 2026-04-07
scope: All docs
language_stack: JS/TS + Python
prevention_tooling: markdownlint + lychee
---

## DOCUMENTATION AUDIT

### SUMMARY
- Docs scanned: 7 (README.md, CLAUDE.md, CONTRIBUTING.md, CHANGELOG.md, docs/README.md, docs/DEPLOYMENT.md)
- Code modules scanned: backend/ (15 .py files), frontend/ (app, services, scripts), package.json, template.yaml, .env.example
- Total findings: 6 drift, 4 gaps, 2 stale, 0 broken links

### DRIFT

1. **Expo version mismatch** — `README.md:7` / `docs/README.md:16` claim "Expo 54" but `package.json` declares `"expo": "^55.0.8"` and all expo-* packages are `~55.x`.
2. **Node version recommendation** — `README.md:30` says "v24 LTS recommended" but v24 is not LTS; v22 is current LTS.
3. **Backend install instructions wrong** — `CONTRIBUTING.md:11-13` uses bare `pip install`, contradicting `CLAUDE.md` policy mandating `uv pip`/`uvx`.
4. **Stack name inconsistency** — `docs/DEPLOYMENT.md:134,178,184,188-189` uses `savorswipe-lambda`, default is `savorswipe` (`README.md:56`).
5. **AWS region inconsistency** — `docs/DEPLOYMENT.md:81,134` shows `us-west-2`, default is `us-east-1`.
6. **`npm test` description** — `CLAUDE.md` says "watch mode" but `package.json` defines `"test": "jest --forceExit"` (no watch).

### GAPS

1. **Undocumented backend env vars**:
   - `DEBUG_MODE` (`lambda_function.py:73`, `logger.py:38`)
   - `SIMILARITY_THRESHOLD` (`config.py:11`)
   - `PDF_MAX_PAGES` (`config.py:14`)
   - `NEW_RECIPE_HOURS` (`config.py:17`)
   - `MAX_RETRIES` (`config.py:20`)
   - `FUNCTION_NAME` (`lambda_function.py:1170`)
2. **Undocumented frontend env var** — `EXPO_PUBLIC_UPLOAD_URL` read at `frontend/services/RecipeService.ts:168`, absent from docs/`.env.example`.
3. **`/upload/status/{jobId}` route undocumented in DEPLOYMENT.md** — exists `lambda_function.py:335`, omitted at `docs/DEPLOYMENT.md:280-284`.
4. **`npm run sitemap` / `sitemap:api`** — `package.json:20-21`, never mentioned in docs.

### STALE

1. **CHANGELOG `[1.0.0]` "Centralized config module"** — accurate, but new env vars never propagated to deployment docs.
2. **`docs/DEPLOYMENT.md:198-208`** — references `backend/deploy.sh` as "original"; verify still functional or mark deprecated.

### BROKEN LINKS
None found.

### STALE CODE EXAMPLES
1. **CONTRIBIGUTING.md backend install** — `pip install -r requirements.txt && pip install -e ".[dev]"` violates uv policy; redundant between `requirements.txt` and `pyproject.toml [dev]`.
2. **DEPLOYMENT.md:152** — `pip install aws-sam-cli` should use `uv pip`/`uvx`.

### CONFIG DRIFT
- **CLAUDE.md backend env vars** list only `API_KEY`, `SEARCH_ID`, `SEARCH_KEY`, `S3_BUCKET` — missing 6 vars from Gaps #1.
- **`docs/DEPLOYMENT.md` example `.env`** uses `us-west-2` while default region is `us-east-1`.

### STRUCTURE ISSUES
1. **CLAUDE.md vs docs/DEPLOYMENT.md route lists differ** — CLAUDE.md lists 5 routes including `GET /upload/status/{jobId}`; DEPLOYMENT.md lists only 4.
2. **`docs/plans/` historical phase docs** mixed under `docs/` — consider `archive/` subfolder.
3. **Version drift** — CHANGELOG shows `[1.1.0]` dated 2026-03-21, but `package.json:4` still `"version": "1.0.0"`.
