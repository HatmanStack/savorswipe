# Feature: Upload Propagation Bug Fixes

## Overview

Three related issues in the upload-to-frontend propagation pipeline need to be addressed. The primary bug is that after a successful first upload (where the image picker modal appears correctly), subsequent sequential uploads fail to show the image picker modal until yet another upload completes — at which point both the 2nd and 3rd uploads' image pickers appear together.

A secondary bug prevents uploads from working on the `/recipe/[id]` route on web: the document picker never opens because the browser's user gesture chain is broken by routing through a `useEffect` mount cycle. The heavier render cost on the recipe detail page pushes the `DocumentPicker.getDocumentAsync()` call outside the browser's gesture timeout window.

Finally, the system should be hardened to handle concurrent/back-to-back uploads where a second upload completes while the first upload's image picker modal is still open.

## Decisions

1. **Sequential upload bug is in frontend state management** — the root cause is in the interaction between `useRecipeInjection`'s `prevJsonDataKeysRef` tracking, the `pendingRecipe` early-return guard, and the timing of `setJsonData` calls from `onConfirmImage` + `UploadListener.refetchRecipes()`. The backend atomic writes and S3 data are functioning correctly.
2. **Document picker must be called synchronously from user gesture** — the current `UploadFiles` component pattern (mount → useEffect → async picker) breaks the browser's gesture trust chain. The fix is to invoke `DocumentPicker.getDocumentAsync()` directly from the click handler in `Menu.tsx` rather than delegating to a component mount lifecycle.
3. **Concurrent upload hardening via pending queue** — when multiple uploads complete and recipes need image selection, the system should queue pending recipes rather than relying on a single `pendingRecipe` slot with an early-return guard that can miss new keys.
4. **OOM on device is out of scope** — the user confirmed this is a device-specific memory constraint, not a code bug.
5. **ImagePickerModal only renders in index.tsx** — the modal for image selection is only rendered in `HomeScreen`. After fixing the document picker trigger, we need to ensure the image picker modal is accessible from any route (or that the user is navigated back to home for image selection).

## Scope: In

- Fix the sequential upload image picker propagation bug in `useRecipeInjection.ts`
- Fix the `prevJsonDataKeysRef` update logic so new recipe keys are never silently dropped
- Refactor the `pendingRecipe` guard to properly queue multiple pending recipes
- Fix the web document picker issue by calling it directly from the click handler instead of via `useEffect` mount
- Ensure `UploadFiles` / `selectAndUploadImage` works from any route on web
- Harden for concurrent uploads: multiple recipes pending image selection should be queued and presented sequentially
- Ensure `ImagePickerModal` is accessible regardless of current route

## Scope: Out

- Backend changes (atomic writes, S3 storage, Lambda processing are working correctly)
- OOM / memory optimization for device-specific constraints
- Changes to the image queue prefetch size or memory footprint
- Android/iOS-specific upload fixes (bug is web-specific for the document picker issue)
- Changes to the upload status polling mechanism
- UI/UX redesign of the image picker modal

## Open Questions

1. **Root cause confirmation**: The exact sequence of `setJsonData` calls and effect re-runs that causes recipe 2's keys to be missed needs to be traced with logging or debugger. The `prevJsonDataKeysRef` update at line 247 (partial update for pending recipe) vs line 256 (full update for non-pending) and the early return at line 232 (pendingRecipe guard) are the primary suspects.
2. **Pending recipe queue storage**: Should the pending recipe queue be stored in `RecipeContext` (replacing the single `pendingRecipeForPicker` state) or managed locally within `useRecipeInjection`? Context gives visibility to other components; local keeps it encapsulated.
3. **ImagePickerModal on recipe route**: Should we move `ImagePickerModal` to the layout level (always mounted), or navigate the user back to home when a new upload completes and needs image selection?

## Relevant Codebase Context

- `frontend/hooks/useRecipeInjection.ts` — Auto-detection effect (line 205-257) with `prevJsonDataKeysRef`, `pendingRecipe` guard (line 232), and partial ref update (line 247). Primary bug location.
- `frontend/hooks/useImagePicker.ts` — `onConfirmImage` calls `setJsonData` then `injectRecipes` then `resetPendingRecipe` sequentially (lines 92-105). Timing of these calls interacts with the injection effect.
- `frontend/hooks/useImageQueue.ts` — Orchestrator that wires `useRecipeInjection` and `useImagePicker` together.
- `frontend/components/UploadRecipe.tsx` — `UploadFiles` component triggers document picker via `useEffect` on mount (line 167-176). Root cause of web upload failure on recipe route.
- `frontend/components/Menu.tsx` — `handleUploadPress` (line 63-67) sets state to render `UploadFiles`. Needs refactoring to call picker directly.
- `frontend/components/UploadListener.tsx` — Persistent listener at layout level that calls `refetchRecipes()` on upload completion (line 30-33).
- `frontend/context/RecipeContext.tsx` — `pendingRecipeForPicker` is a single `Recipe | null` state (line 36). May need to become a queue.
- `frontend/app/_layout.tsx` — Layout renders `Menu` and `UploadListener` globally, but `ImagePickerModal` is only in `index.tsx`.
- `frontend/app/index.tsx` — `HomeScreen` renders `ImagePickerModal` (lines 142-148, 189-195) and is the only consumer of `useImageQueue`.
- `frontend/components/Menu/UploadModal.tsx` — Subscribes to `UploadService` and calls `setJsonData(job.result.jsonData)` (line 44), but appears to be dead code (not imported anywhere in active components).
- `backend/upload.py:346-351` — Recipes stored with `image_search_results` but no `image_url`, triggering frontend image picker flow.

## Technical Constraints

- Browser security: File input dialogs on web must originate from a synchronous user gesture handler. Cannot be deferred through React lifecycle (`useEffect`, `setTimeout`, etc.) beyond the browser's gesture timeout.
- React 18 automatic batching: State updates within async functions may or may not batch, affecting the order effects see state changes. The `onConfirmImage` async flow (`setJsonData` → `await injectRecipes` → `resetPendingRecipe`) creates multiple render cycles with different state snapshots.
- Stack navigator screen lifecycle: `HomeScreen` may remain mounted when navigating to `/recipe/[id]`, meaning `useImageQueue` stays active. This is currently relied upon for injection to work but is fragile.
- `UploadModal.tsx` appears to be dead code — `UploadListener` replaced its role. Should be confirmed and cleaned up if so.
