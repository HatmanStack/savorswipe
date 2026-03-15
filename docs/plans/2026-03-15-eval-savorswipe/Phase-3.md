# Phase 3: Architecture & Performance

## Phase Goal

Decompose the 660-line "god hook" (`useImageQueue.ts`) into focused composable hooks, parallelize sequential URL validation in the backend, and add missing test coverage. This phase targets Architecture (7/10 to 9/10), Performance (7/10 to 9/10), and Test Value (7/10 to 9/10).

**Success criteria:** `useImageQueue.ts` decomposed into 3 focused hooks with the same public API, URL validation parallelized, RecipeContext test coverage added, all existing tests pass.

**Estimated tokens:** ~40,000

## Prerequisites

- Phase 2 completed (logger migration done, so new hooks won't contain print-style logging)
- Phase 0 read and understood (especially ADR-2 hook decomposition)

---

## Tasks

### Task 1: Extract useQueueState Hook

**Goal:** Extract queue array management, initialization, refill, and advance logic from `useImageQueue.ts` into a new `useQueueState` hook. This is the core state management extracted from the god hook.

**Files to Create:**
- `frontend/hooks/useQueueState.ts` — New hook for queue state management

**Files to Modify:**
- `frontend/hooks/index.ts` — Export the new hook (optional, only if existing pattern exports all hooks)

**Prerequisites:**
- Read the full `useImageQueue.ts` to understand the queue lifecycle
- Understand dependencies between queue state, injection, and image picker

**Implementation Steps:**
1. Create `frontend/hooks/useQueueState.ts` with the following responsibilities extracted from `useImageQueue`:
   - State: `queue`, `currentImage`, `nextImage`, `isLoading`
   - Refs: `recipeKeyPoolRef`, `isRefillingRef`, `isMountedRef`, `isInitializingRef`, `queueRef`, `nextImageRef`, `lastInjectionTimeRef`, `seenRecipeKeysRef`
   - Functions: `initializeQueue`, `refillQueue`, `advanceQueue`, `resetQueue`
   - Effects: mount/unmount cleanup, auto-initialize when jsonData available, auto-refill when queue low, filter change reset
2. The hook should accept parameters for its dependencies:
   ```typescript
   interface UseQueueStateOptions {
     jsonData: S3JsonData | null;
     mealTypeFilters: MealType[];
     setCurrentRecipe: (recipe: Recipe | null) => void;
   }
   ```
3. The hook should return:
   ```typescript
   interface QueueStateReturn {
     queue: ImageFile[];
     currentImage: ImageFile | null;
     nextImage: ImageFile | null;
     isLoading: boolean;
     queueLength: number;
     advanceQueue: () => void;
     resetQueue: () => Promise<void>;
     // Internal methods needed by other hooks:
     setQueue: React.Dispatch<React.SetStateAction<ImageFile[]>>;
     setCurrentImage: React.Dispatch<React.SetStateAction<ImageFile | null>>;
     setNextImage: React.Dispatch<React.SetStateAction<ImageFile | null>>;
     setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
     recipeKeyPoolRef: React.MutableRefObject<string[]>;
     lastInjectionTimeRef: React.MutableRefObject<number>;
     nextImageRef: React.MutableRefObject<ImageFile | null>;
   }
   ```
4. Carefully move the relevant state, refs, callbacks, and effects. Ensure `useCallback` dependencies are correct.
5. Do NOT delete anything from `useImageQueue.ts` yet — this task creates the new hook. Task 4 will wire everything together.

**Verification Checklist:**
- [x] `useQueueState.ts` created with all queue management logic
- [x] Hook accepts `UseQueueStateOptions` parameter
- [x] All moved functions maintain their existing behavior
- [x] File compiles: `cd frontend && npx tsc --noEmit`
- [x] No lint errors: `npm run lint`

**Testing Instructions:**
- Write unit tests in `frontend/hooks/__tests__/useQueueState.test.ts` using `renderHook`:
  1. Test initialization creates queue from jsonData
  2. Test `advanceQueue` shifts the queue and updates current/next
  3. Test `resetQueue` clears and reinitializes
  4. Test that empty jsonData results in loading state
- Mock `ImageQueueService` and `ImageService` as done in existing `useImageQueue.test.ts`
- Run: `npm test -- --ci --forceExit --testPathPattern=useQueueState`

**Commit Message Template:**
```text
refactor(frontend): extract useQueueState hook from useImageQueue

- Move queue array management, init, refill, and advance logic
- Single-responsibility: queue lifecycle management only
- First step of god-hook decomposition (ADR-2)
```

---

### Task 2: Extract useRecipeInjection Hook

**Goal:** Extract the recipe injection logic (detecting new recipes in jsonData, fetching images, and inserting into queue) into a focused hook.

**Files to Create:**
- `frontend/hooks/useRecipeInjection.ts` — New hook for recipe injection

**Prerequisites:**
- Task 1 completed (useQueueState exists)

**Implementation Steps:**
1. Create `frontend/hooks/useRecipeInjection.ts` with responsibilities extracted from `useImageQueue`:
   - Functions: `injectRecipes` callback
   - Refs: `prevJsonDataKeysRef`
   - Effects: auto-detect new recipes in jsonData effect (lines 584-633)
   - Helper: `isPendingImageSelection` function
2. The hook should accept:
   ```typescript
   interface UseRecipeInjectionOptions {
     jsonData: S3JsonData | null;
     setQueue: React.Dispatch<React.SetStateAction<ImageFile[]>>;
     setCurrentImage: React.Dispatch<React.SetStateAction<ImageFile | null>>;
     setNextImage: React.Dispatch<React.SetStateAction<ImageFile | null>>;
     setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
     recipeKeyPoolRef: React.MutableRefObject<string[]>;
     lastInjectionTimeRef: React.MutableRefObject<number>;
     nextImageRef: React.MutableRefObject<ImageFile | null>;
     pendingRecipe: Recipe | null;
     setPendingRecipeForPicker: (recipe: Recipe | null) => void;
   }
   ```
3. The hook should return:
   ```typescript
   interface RecipeInjectionReturn {
     injectRecipes: (recipeKeys: string[]) => Promise<void>;
   }
   ```
4. Move `isPendingImageSelection` helper function into this file (it is only used by the injection effect).
5. Move `MAX_QUEUE_SIZE`, `INJECT_RETRY_MAX`, `INJECT_RETRY_DELAY` constants into this file (they are only used by injection logic).

**Verification Checklist:**
- [x] `useRecipeInjection.ts` created with injection logic
- [x] `isPendingImageSelection` moved to this file
- [x] Injection constants moved to this file
- [x] File compiles: `cd frontend && npx tsc --noEmit`
- [x] No lint errors

**Testing Instructions:**
- Write unit tests in `frontend/hooks/__tests__/useRecipeInjection.test.ts`:
  1. Test `injectRecipes` fetches images and updates queue
  2. Test duplicate detection (already-in-queue recipes not re-added)
  3. Test auto-detection of new keys in jsonData triggers injection
  4. Test pending image selection pauses injection
- Run: `npm test -- --ci --forceExit --testPathPattern=useRecipeInjection`

**Commit Message Template:**
```text
refactor(frontend): extract useRecipeInjection hook from useImageQueue

- Move recipe detection, injection with retry, and queue insertion
- Move isPendingImageSelection helper and injection constants
- Second step of god-hook decomposition (ADR-2)
```

---

### Task 3: Extract useImagePicker Hook

**Goal:** Extract image picker modal state management and confirm/delete handlers into a focused hook.

**Files to Create:**
- `frontend/hooks/useImagePicker.ts` — New hook for image picker interactions

**Prerequisites:**
- Task 1 completed (useQueueState exists)

**Implementation Steps:**
1. Create `frontend/hooks/useImagePicker.ts` with responsibilities extracted from `useImageQueue`:
   - Functions: `onConfirmImage`, `onDeleteRecipe`, `resetPendingRecipe`
   - Derived state: `showImagePickerModal`, `pendingRecipe`
   - State: `isSubmitting`
2. The hook should accept:
   ```typescript
   interface UseImagePickerOptions {
     jsonData: S3JsonData | null;
     setJsonData: React.Dispatch<React.SetStateAction<S3JsonData | null>>;
     pendingRecipeForPicker: Recipe | null;
     setPendingRecipeForPicker: (recipe: Recipe | null) => void;
     injectRecipes: (recipeKeys: string[]) => Promise<void>;
   }
   ```
3. The hook should return:
   ```typescript
   interface ImagePickerReturn {
     pendingRecipe: Recipe | null;
     showImagePickerModal: boolean;
     isSubmitting: boolean;
     onConfirmImage: (imageUrl: string) => Promise<void>;
     onDeleteRecipe: () => Promise<void>;
     resetPendingRecipe: () => void;
   }
   ```
4. Move `transformErrorMessage` and `ERROR_PATTERNS` (from Phase 2, Task 11) into this file since they are only used by the confirm/delete handlers.

**Verification Checklist:**
- [x] `useImagePicker.ts` created with modal and handler logic
- [x] `transformErrorMessage` and `ERROR_PATTERNS` moved here
- [x] File compiles: `cd frontend && npx tsc --noEmit`
- [x] No lint errors

**Testing Instructions:**
- Write unit tests in `frontend/hooks/__tests__/useImagePicker.test.ts`:
  1. Test `onConfirmImage` calls RecipeService and updates jsonData
  2. Test `onDeleteRecipe` calls RecipeService and removes from jsonData
  3. Test `resetPendingRecipe` clears modal state
  4. Test `showImagePickerModal` derived state
  5. Test error handling shows toast with user-friendly message
- Run: `npm test -- --ci --forceExit --testPathPattern=useImagePicker`

**Commit Message Template:**
```text
refactor(frontend): extract useImagePicker hook from useImageQueue

- Move image selection confirm/delete handlers and modal state
- Move transformErrorMessage and ERROR_PATTERNS
- Third step of god-hook decomposition (ADR-2)
```

---

### Task 4: Compose Hooks in useImageQueue

**Goal:** Rewrite `useImageQueue.ts` as a thin composition layer that uses the three extracted hooks and exposes the same public API. No consumers should need to change.

**Files to Modify:**
- `frontend/hooks/useImageQueue.ts` — Rewrite as composition of extracted hooks
- `frontend/hooks/index.ts` — Update exports if needed

**Prerequisites:**
- Tasks 1-3 completed (all three sub-hooks exist)

**Implementation Steps:**
1. Rewrite `useImageQueue.ts` to be a slim composition hook:
   ```typescript
   export function useImageQueue(): ImageQueueHook {
     const {
       jsonData, setCurrentRecipe, setJsonData,
       mealTypeFilters, pendingRecipeForPicker, setPendingRecipeForPicker
     } = useRecipe();

     const queueState = useQueueState({ jsonData, mealTypeFilters, setCurrentRecipe });

     const { injectRecipes } = useRecipeInjection({
       jsonData,
       setQueue: queueState.setQueue,
       setCurrentImage: queueState.setCurrentImage,
       setNextImage: queueState.setNextImage,
       setIsLoading: queueState.setIsLoading,
       recipeKeyPoolRef: queueState.recipeKeyPoolRef,
       lastInjectionTimeRef: queueState.lastInjectionTimeRef,
       nextImageRef: queueState.nextImageRef,
       pendingRecipe: pendingRecipeForPicker,
       setPendingRecipeForPicker,
     });

     const imagePicker = useImagePicker({
       jsonData, setJsonData,
       pendingRecipeForPicker, setPendingRecipeForPicker,
       injectRecipes,
     });

     return {
       currentImage: queueState.currentImage,
       nextImage: queueState.nextImage,
       isLoading: queueState.isLoading,
       queueLength: queueState.queueLength,
       advanceQueue: queueState.advanceQueue,
       resetQueue: queueState.resetQueue,
       injectRecipes,
       pendingRecipe: imagePicker.pendingRecipe,
       showImagePickerModal: imagePicker.showImagePickerModal,
       resetPendingRecipe: imagePicker.resetPendingRecipe,
       onConfirmImage: imagePicker.onConfirmImage,
       onDeleteRecipe: imagePicker.onDeleteRecipe,
     };
   }
   ```
2. Remove all code that was moved to the sub-hooks. The file should be ~40-60 lines.
3. Ensure the `ImageQueueHook` type interface is unchanged.
4. Run the full test suite to verify the public API hasn't changed.

**Verification Checklist:**
- [x] `useImageQueue.ts` is under 80 lines
- [x] Public return type `ImageQueueHook` is unchanged
- [x] No consumers of `useImageQueue` need modification
- [x] `frontend/app/index.tsx` still works (uses `useImageQueue`)
- [x] `cd frontend && npx tsc --noEmit` passes
- [x] `npm test -- --ci --forceExit` passes (all existing hook tests)
- [x] `npm run lint` passes

**Testing Instructions:**
- Run existing `useImageQueue` tests: `npm test -- --ci --forceExit --testPathPattern=useImageQueue`
- Run full suite: `npm test -- --ci --forceExit`
- The existing tests should pass unchanged since the public API is preserved.

**Commit Message Template:**
```text
refactor(frontend): compose useImageQueue from focused sub-hooks

- useImageQueue is now a thin composition layer (~50 lines)
- Composes useQueueState, useRecipeInjection, useImagePicker
- Public API (ImageQueueHook) unchanged - no consumer changes needed
- Completes god-hook decomposition (ADR-2)
```

---

### Task 5: Parallelize URL Validation in search_image.py

**Goal:** Replace sequential HEAD requests in `validate_image_urls` with parallel requests using `ThreadPoolExecutor`. Currently, N sequential network calls create a bottleneck proportional to the number of URLs. This addresses Performance.

**Files to Modify:**
- `backend/search_image.py` — Parallelize `validate_image_urls`

**Prerequisites:**
- Phase 2 Task 4 completed (search_image.py uses StructuredLogger)

**Implementation Steps:**
1. Import `ThreadPoolExecutor` and `as_completed` from `concurrent.futures`.
2. Rewrite `validate_image_urls` to use a thread pool:
   ```python
   def validate_image_urls(image_urls: List[str], timeout: int = 5) -> List[str]:
       if not image_urls:
           log.info("No image URLs to validate")
           return []

       log.info("Validating image URLs", count=len(image_urls))

       def _validate_single(url: str) -> Optional[str]:
           if not url:
               return None
           try:
               headers = {
                   'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
               }
               response = requests.head(url, headers=headers, timeout=timeout, allow_redirects=True)
               if response.status_code == 200:
                   content_type = response.headers.get('Content-Type', '')
                   if 'image' in content_type.lower():
                       return url
               return None
           except Exception:
               return None

       valid_urls = []
       with ThreadPoolExecutor(max_workers=5) as executor:
           future_to_url = {executor.submit(_validate_single, url): url for url in image_urls}
           for future in as_completed(future_to_url):
               result = future.result()
               if result:
                   valid_urls.append(result)

       # Preserve original order (as_completed returns in completion order)
       ordered_valid = [url for url in image_urls if url in set(valid_urls)]

       log.info("URL validation complete", valid=len(ordered_valid), total=len(image_urls))
       return ordered_valid
   ```
3. Key detail: preserve the original URL order (not completion order) so search result ranking is maintained.
4. Import `Optional` from `typing` if not already imported.
5. Run tests.

**Verification Checklist:**
- [x] `ThreadPoolExecutor` used in `validate_image_urls`
- [x] URL order preserved (not returned in completion order)
- [x] `max_workers` set to a reasonable value (5)
- [x] `ruff check search_image.py` passes
- [x] Backend tests pass

**Testing Instructions:**
- Update or add test in `tests/backend/test_search_image.py`:
  1. Test that validation returns URLs in original order even when later URLs validate faster
  2. Test that invalid URLs are filtered out
  3. Test with empty input returns empty list
- Run: `PYTHONPATH=backend pytest tests/backend/test_search_image.py -v --tb=short`

**Commit Message Template:**
```text
perf(backend): parallelize URL validation with ThreadPoolExecutor

- Replace sequential HEAD requests with parallel validation (5 workers)
- Preserve original URL ordering for search result ranking
- With max_workers=5, reduces worst-case validation time from O(n*timeout) to O(ceil(n/5)*timeout); for typical ~10-URL batches this significantly reduces wall time
```

---

### Task 6: Add Test Coverage for RecipeContext

**Goal:** Add test coverage for `RecipeContext` and the `RecipeProvider` component. The eval flagged missing test coverage for this critical context. This addresses Test Value.

**Files to Create:**
- `frontend/context/__tests__/RecipeContext.test.tsx` — Tests for RecipeContext

**Prerequisites:**
- None

**Implementation Steps:**
1. Create `frontend/context/__tests__/RecipeContext.test.tsx`.
2. Write tests using `renderHook` wrapped in `RecipeProvider`:
   ```typescript
   import { renderHook, act } from '@testing-library/react-native';
   import { RecipeProvider, useRecipe } from '@/context/RecipeContext';
   ```
3. Test cases:
   1. **Initial state:** `jsonData` is null initially, `currentRecipe` is null, all meal type filters are selected
   2. **setCurrentRecipe:** Updates `currentRecipe` state
   3. **setJsonData:** Updates `jsonData` state
   4. **setMealTypeFilters:** Updates filter state
   5. **setPendingRecipeForPicker:** Updates pending recipe state
   6. **Stale-while-revalidate:** Mock `RecipeService.getLocalRecipes` to return cached data and `RecipeService.getRecipesFromS3` to return fresh data. Verify local data loads first, then fresh data replaces it.
   7. **useRecipe outside provider:** Verify it throws an error when used outside `RecipeProvider`
4. Mock `RecipeService` methods:
   ```typescript
   jest.mock('@/services/RecipeService', () => ({
     RecipeService: {
       getLocalRecipes: jest.fn(),
       getRecipesFromS3: jest.fn(),
     },
   }));
   ```

**Verification Checklist:**
- [x] `frontend/context/__tests__/RecipeContext.test.tsx` exists
- [x] At least 6 test cases covering all context methods
- [x] Stale-while-revalidate behavior tested
- [x] Tests pass: `npm test -- --ci --forceExit --testPathPattern=RecipeContext`
- [x] No lint errors

**Testing Instructions:**
- Run: `npm test -- --ci --forceExit --testPathPattern=RecipeContext`

**Commit Message Template:**
```text
test(frontend): add test coverage for RecipeContext

- Test initial state, state updates, and stale-while-revalidate
- Test useRecipe throws outside provider
- Mock RecipeService for isolated testing
```

---

## Phase Verification

After completing all 6 tasks:

1. Verify hook decomposition:
   - `frontend/hooks/useImageQueue.ts` is under 80 lines
   - `frontend/hooks/useQueueState.ts` exists
   - `frontend/hooks/useRecipeInjection.ts` exists
   - `frontend/hooks/useImagePicker.ts` exists
2. Run TypeScript compilation: `cd frontend && npx tsc --noEmit`
3. Run full frontend test suite: `npm test -- --ci --forceExit`
4. Run full backend test suite: `PYTHONPATH=backend pytest tests/backend -v --tb=short`
5. Run all linting: `npm run lint && cd backend && uvx ruff check .`
6. Verify `ImageQueueHook` type is unchanged (no consumer changes needed)

**Known limitations:**
- The hook interfaces between `useQueueState`, `useRecipeInjection`, and `useImagePicker` pass setters and refs as props. This is intentional — it avoids introducing a new state management layer while keeping hooks composable.
- The URL validation parallelization uses 5 threads. For very large URL sets (>50), this could be increased, but 5 is appropriate for the typical 10-URL batch from Google search.
