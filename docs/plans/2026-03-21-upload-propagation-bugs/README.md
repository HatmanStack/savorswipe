# Upload Propagation Bug Fixes

## Overview

This plan addresses three related bugs in the upload-to-frontend propagation pipeline of the SavorSwipe app. The primary bug causes sequential uploads to fail to show the image picker modal: after a successful first upload, the second upload's image picker is silently dropped until a third upload triggers, at which point both the 2nd and 3rd pickers appear together. The root cause is in `useRecipeInjection`'s `prevJsonDataKeysRef` tracking combined with the `pendingRecipe` early-return guard that causes new recipe keys to be permanently missed.

A secondary bug prevents the document picker from opening on the `/recipe/[id]` route on web. The current pattern mounts the `UploadFiles` component which invokes `DocumentPicker.getDocumentAsync()` inside a `useEffect`, breaking the browser's user gesture trust chain. The fix is to call the document picker synchronously from the click handler.

Finally, the system needs hardening for concurrent uploads where multiple recipes need image selection simultaneously. The current single `pendingRecipeForPicker` slot in `RecipeContext` can only hold one recipe at a time, causing later recipes to be dropped.

## Prerequisites

- Node v24 LTS (managed via nvm)
- Project dependencies installed: `npm install`
- Familiarity with React hooks and React Native
- No backend changes required -- all fixes are frontend-only

## Phase Summary

| Phase | Goal | Token Estimate |
|-------|------|----------------|
| 0 | Foundation: Architecture decisions, testing strategy, shared patterns | ~3,000 |
| 1 | Fix sequential upload bug, pending recipe queue, document picker, dead code cleanup | ~35,000 |

## Navigation

- [Phase-0.md](./Phase-0.md) -- Foundation (ADRs, testing strategy, conventions)
- [Phase-1.md](./Phase-1.md) -- Implementation (all bug fixes)
- [feedback.md](./feedback.md) -- Review feedback tracking
