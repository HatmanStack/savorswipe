# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-03-21

### Bug Fixes

- **Sequential upload propagation** — Image picker modal now appears for every upload, not just the first. Fixed `prevJsonDataKeysRef` in `useRecipeInjection` to always update to the full key set, preventing new recipe keys from being silently dropped.
- **Web document picker on /recipe route** — Moved `DocumentPicker.getDocumentAsync()` before `requestMediaLibraryPermissionsAsync()` in `selectAndUploadImage` to preserve the browser's user gesture trust chain.
- **Concurrent upload hardening** — Replaced single `pendingRecipeForPicker` slot with a queue (`pendingRecipesForPicker[]`) so multiple uploads completing simultaneously each get their image picker modal.
- **Confirmed recipe injection** — `consumePendingInjectionKeys` now uses a ref-backed queue for reliable synchronous consumption. Confirmed keys are consumed before early returns in the detection effect.
- **Upload error display** — Restored `ErrorDetailModal` in `UploadListener` with error accumulation across jobs and clear-on-dismiss behavior.

### Refactoring

- **ImagePickerModal moved to layout** — New `GlobalImagePicker` component in `_layout.tsx` renders the modal from any route, replacing the home-screen-only rendering.
- **Dead picker APIs removed from useImageQueue** — `useImagePicker` instantiation moved exclusively to `GlobalImagePicker`. `useImageQueue` derives `showImagePickerModal` from context directly.
- **Dead code cleanup** — Removed old `Menu.tsx`, `UploadModal.tsx`, `UploadFiles` component, and vestigial `setUploadVisible` parameter from `selectAndUploadImage`.
- **Consistent dequeue** — `onDeleteRecipe` calls `dequeuePendingRecipe()` directly, matching `onConfirmImage` behavior.

### Testing

- Added sequential and concurrent upload regression tests in `useRecipeInjection-sequential.test.ts`
- Integration tests updated to use `useCombinedHook` pattern (useImageQueue + useImagePicker)
- Fixed mock inconsistencies (`pendingRecipesForPicker` now consistent with `pendingRecipeForPicker`)

## [1.0.0] - 2026-02-05

First tagged release. SavorSwipe is a recipe discovery app with swipe-based browsing,
search, multi-file upload with OCR, and image picker.

### Features

- **Swipe interface** with 10-15 image prefetch queue, batch fetching, and slide animations (#3)
- **Recipe search** with real-time filtering by title and ingredients, recent search history (#2)
- **Multi-file upload** with background job queue, PDF chunking, parallel OCR (3 workers), and AsyncStorage persistence (#5)
- **Semantic duplicate detection** using OpenAI embeddings with cosine similarity (0.85 threshold) (#5)
- **Image picker** modal with 3x3 Google image search grid, full-size preview, and recipe deletion (#12, #14)
- **Serving size scaling** with fraction normalization and unit pluralization (#4)
- **New recipe indicator** with "NEW" badge and pulse animation for uploads within 72 hours (#10)
- **Stale-while-revalidate** pattern for recipe loading from local assets then S3 (#8)
- **Meal type filters** (main dish, dessert, appetizer, breakfast, side dish, beverage)

### Infrastructure

- **Monorepo structure** with npm workspaces: `frontend/`, `backend/`, `tests/` (#20)
- **Self-contained deploy** script (`npm run deploy`) that creates S3, Lambda, API Gateway v2, and CloudFront (#20)
- **SAM template** with Python 3.13 Lambda runtime, 1024 MB memory, 600s timeout (#13)
- **API Gateway v2** migration from Lambda Function URLs with CORS and throttling (#19)
- **CloudFront CDN** with Origin Access Control for S3 image serving
- **GitHub Actions CI** with frontend lint/type-check/tests and backend lint/tests (#15, #17)
- **Async upload processing** with polling-based status checks and S3 completion flags (#21)

### Backend

- **Lambda handler** with routes: GET /recipes, POST /recipe/upload, DELETE /recipe/{recipe_key}, POST /recipe/{recipe_key}/image, GET /upload/status/{jobId}
- **OCR processing** via OpenAI Vision API with truncated JSON repair
- **Google Custom Search** integration for recipe image discovery (up to 9 results)
- **Atomic S3 writes** with ETag-based optimistic locking and retry logic
- **Centralized config module** (`config.py`) with environment variable overrides
- **Structured JSON logger** (`logger.py`) for CloudWatch Insights compatibility
- **SSRF protection** in image fetching (HTTPS + public IP validation)

### Frontend

- **Discriminated union type system** with branded types (RecipeKey, JobId), exhaustive pattern matching via `kind` field, and type guards
- **Recipe normalization** (`normalizeRecipe.ts`) transforms raw API data to type-safe discriminated unions
- **SEO infrastructure** with JSON-LD structured data, Open Graph meta tags, and sitemap generation
- **Upload timeout** (60s) with AbortController for initial upload requests
- **Fisher-Yates shuffle** for uniform recipe key randomization
- **Error logging** in silent catch blocks throughout useImageQueue (#22)

### Testing

- ~300 frontend tests (Jest + React Native Testing Library)
- ~150 backend tests (pytest + moto + requests-mock)
- Integration tests for upload flow, image picker, and error scenarios
