# Feedback Log

## Active Feedback

(No open items.)

---

## Resolved Feedback

### PLAN_REVIEW: Phase 1, Task 1 — aws-sdk mock in wrong file

**Severity:** HIGH — implementer will produce a broken test suite

**Issue:** The plan instructs the implementer to check `frontend/jest.mocks.js` for `aws-sdk` mock references. However, the actual `jest.mock('aws-sdk')` call is in `frontend/jest.setup.js` (line 9), not `jest.mocks.js`. The file `jest.setup.js` is configured as `setupFilesAfterEnv` in `package.json` (line 39). If the implementer removes `aws-sdk` from `package.json` but only checks `jest.mocks.js` (where there is no match), the `jest.mock('aws-sdk')` in `jest.setup.js` will cause test failures because Jest cannot mock a module that is not installed.

**Fix:** In Phase 1, Task 1, replace the reference to `frontend/jest.mocks.js` with `frontend/jest.setup.js`. Update the "Files to Modify" list and step 2 to instruct the implementer to remove the `jest.mock('aws-sdk')` line from `frontend/jest.setup.js`.

**Resolution:** Fixed in Phase-1.md Task 1. Replaced `frontend/jest.mocks.js` with `frontend/jest.setup.js` in both the "Files to Modify" list and implementation step 2. Step 2 now explicitly instructs the implementer to remove the `jest.mock('aws-sdk')` line (line 9) from `frontend/jest.setup.js`.

---

### PLAN_REVIEW: Phase 4, Task 4 — .env.example uses wrong variable name and is missing a variable

**Severity:** HIGH — implementer will produce a broken .env.example

**Issue 1 — Wrong variable name:** The plan specifies `EXPO_PUBLIC_CLOUDFRONT_URL` but the actual codebase uses `EXPO_PUBLIC_CLOUDFRONT_BASE_URL` (see `frontend/services/ImageService.ts:3`, `frontend/services/RecipeService.ts:30`, `frontend/services/UploadPersistence.ts:11`, `frontend/components/SearchResultItem.tsx:18`, and `frontend/jest.setup.js:7`). An implementer following the plan will create a `.env.example` with the wrong variable name, and developers copying it will get runtime errors ("EXPO_PUBLIC_CLOUDFRONT_BASE_URL environment variable is not set").

**Fix:** Replace `EXPO_PUBLIC_CLOUDFRONT_URL` with `EXPO_PUBLIC_CLOUDFRONT_BASE_URL` in the example content.

**Issue 2 — Missing variable:** The plan does not include `EXPO_PUBLIC_UPLOAD_URL`, which is used in `frontend/services/RecipeService.ts:168` and throws if not configured. Add it to the `.env.example` template.

**Fix:** Add the following line to the `.env.example` template:
```
# Upload endpoint URL (for recipe image uploads)
EXPO_PUBLIC_UPLOAD_URL=https://your-upload-endpoint-url
```

**Resolution:** Both issues addressed in Phase-4.md Task 4. Replaced `EXPO_PUBLIC_CLOUDFRONT_URL` with `EXPO_PUBLIC_CLOUDFRONT_BASE_URL` in the variable list and `.env.example` template. Added `EXPO_PUBLIC_UPLOAD_URL` with descriptive comment to both the variable list and the `.env.example` template.

---
