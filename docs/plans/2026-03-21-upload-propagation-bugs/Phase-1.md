# Phase 1: Upload Propagation Bug Fixes

## Phase Goal

Fix three related bugs in the upload-to-frontend propagation pipeline: (1) sequential uploads silently dropping image picker modals, (2) document picker failing on web from non-home routes, and (3) concurrent upload hardening via a pending recipe queue. Also clean up confirmed dead code.

**Success criteria:**
- Sequential uploads: uploading recipe A then recipe B (both needing image selection) results in both image pickers appearing one after another
- Web document picker: clicking "Upload Recipe" from `/recipe/[id]` route successfully opens the file picker
- Concurrent uploads: if upload B completes while upload A's image picker is open, upload B's picker appears after A's is dismissed
- `ImagePickerModal` is visible from any route
- All existing tests pass, new tests cover the fixed scenarios
- `npm run check` passes (lint + typecheck + tests)

**Estimated tokens:** ~35,000

## Prerequisites

- Phase 0 read and understood
- `npm install` completed
- Existing tests pass: `npm test -- --ci --forceExit`

## Tasks

---

### Task 1: Convert pendingRecipeForPicker to a queue in RecipeContext

**Goal:** Replace the single `pendingRecipeForPicker: Recipe | null` state with an array queue `pendingRecipesForPicker: Recipe[]`. Provide `enqueuePendingRecipe` and `dequeuePendingRecipe` functions. Maintain backward compatibility by deriving `pendingRecipeForPicker` (the first element) for consumers that only need the current pending recipe.

**Files to Modify:**
- `frontend/context/RecipeContext.tsx` -- Change state type, add queue operations, update context interface

**Prerequisites:** None

**Implementation Steps:**

1. In `RecipeContext.tsx`, change the state:
   - Replace `useState<Recipe | null>(null)` with `useState<Recipe[]>([])`
   - Name it `pendingRecipesForPicker` / `setPendingRecipesForPicker`

2. Add queue helper functions:
   - `enqueuePendingRecipe(recipe: Recipe)`: appends to the array, but only if a recipe with the same `key` is not already in the queue (prevent duplicates)
   - `dequeuePendingRecipe()`: removes the first element from the array (shifts)

3. Derive the single-recipe view for backward compatibility:
   - `pendingRecipeForPicker`: computed as `pendingRecipesForPicker[0] ?? null`
   - Keep this in the context value so consumers that only read the current pending recipe don't need changes yet

4. Update the `RecipeContextType` interface:
   - Add `pendingRecipesForPicker: Recipe[]`
   - Add `enqueuePendingRecipe: (recipe: Recipe) => void`
   - Add `dequeuePendingRecipe: () => void`
   - Keep `pendingRecipeForPicker: Recipe | null` (derived, read-only)
   - Remove `setPendingRecipeForPicker: (recipe: Recipe | null) => void`

5. Update the `useMemo` provider value to include all new fields.

**Verification Checklist:**
- [ ] `pendingRecipesForPicker` is an array state
- [ ] `enqueuePendingRecipe` appends to array, prevents duplicate keys
- [ ] `dequeuePendingRecipe` removes first element
- [ ] `pendingRecipeForPicker` derived as first element or null
- [ ] TypeScript compiles: `npx tsc --noEmit` (will have errors in consumers -- that's expected, fixed in later tasks)

**Testing Instructions:**

No separate test file for RecipeContext currently exists. The context will be tested indirectly through the hook tests updated in later tasks. If desired, add a minimal test:
- Render `RecipeProvider` with a test consumer component
- Verify `enqueuePendingRecipe` adds recipes
- Verify `dequeuePendingRecipe` removes from front
- Verify `pendingRecipeForPicker` reflects queue head

**Commit Message Template:**
```
fix(context): convert pendingRecipeForPicker to queue

- Replace single Recipe slot with Recipe[] array
- Add enqueuePendingRecipe and dequeuePendingRecipe
- Derive pendingRecipeForPicker from queue head for compatibility
```

---

### Task 2: Fix useRecipeInjection auto-detection to never drop keys

**Goal:** Rewrite the auto-detection effect in `useRecipeInjection` so that new recipe keys are never silently dropped. The fix involves: (1) always updating `prevJsonDataKeysRef` to the full current key set, (2) tracking unprocessed keys in a separate ref, and (3) removing the `pendingRecipe` early-return guard in favor of enqueuing to the pending recipe queue.

**Files to Modify:**
- `frontend/hooks/useRecipeInjection.ts` -- Rewrite the effect (lines 204-257), update options interface

**Prerequisites:** Task 1 (RecipeContext queue API)

**Implementation Steps:**

1. Update the `UseRecipeInjectionOptions` interface:
   - Replace `pendingRecipe: Recipe | null` with `pendingRecipesForPicker: Recipe[]` (needed to check queue length for processing order, or simply remove -- the effect no longer needs to guard on pending state)
   - Replace `setPendingRecipeForPicker: (recipe: Recipe | null) => void` with `enqueuePendingRecipe: (recipe: Recipe) => void`

2. Add a new ref: `unprocessedKeysRef = useRef<string[]>([])`. This tracks keys that have been detected as new but not yet processed (because they were pending image selection and a modal was already showing, or because they need to wait for the queue to drain).

3. Rewrite the auto-detection effect (the `useEffect` at line 204):

   ```
   Effect logic (pseudocode):

   a. If !jsonData, return
   b. Compute currentKeys from Object.keys(jsonData)
   c. If prevJsonDataKeysRef is empty (first mount), initialize it and return
   d. Find newKeys = currentKeys that are not in prevJsonDataKeysRef
   e. ALWAYS update prevJsonDataKeysRef to currentKeys (this is the critical fix)
   f. Add newKeys to unprocessedKeysRef (append, deduplicate)
   g. If unprocessedKeysRef is empty, return
   h. Partition unprocessedKeysRef into:
      - pendingKeys: recipes that need image selection (isPendingImageSelection)
      - readyKeys: recipes that have images and can be injected
   i. Enqueue all pendingKeys via enqueuePendingRecipe (one at a time, in order)
   j. Inject all readyKeys via injectRecipes
   k. Clear unprocessedKeysRef (all keys have been dispatched)
   ```

4. Update the effect dependency array to reflect the new props. The effect should depend on `jsonData` and the stable callback refs. Since `enqueuePendingRecipe` will be a new function from context, ensure it's stable (wrapped in useCallback in the context or consumed via ref).

5. Remove `pendingRecipe` from the effect's dependency array entirely. The effect no longer needs to re-run when pending state changes; it only runs when `jsonData` changes.

**Verification Checklist:**
- [ ] `prevJsonDataKeysRef` is always set to the full current key set, not a partial update
- [ ] No early return based on `pendingRecipe` state
- [ ] New keys are accumulated in `unprocessedKeysRef` and drained in a single pass
- [ ] Pending recipes are enqueued (not set), allowing multiple to coexist
- [ ] Ready recipes are injected as before
- [ ] TypeScript compiles after this task + Task 1

**Testing Instructions:**

Update `frontend/hooks/__tests__/useRecipeInjection.test.ts`:

1. **Update test setup:** Change `mockSetPendingRecipeForPicker` to `mockEnqueuePendingRecipe`. Update `createDefaultOptions` to use the new interface (remove `pendingRecipe`, add `pendingRecipesForPicker: []`, add `enqueuePendingRecipe: mockEnqueuePendingRecipe`).

2. **Update "pending image selection pauses injection" test:** Rename to "pending image selection enqueues recipe". Verify `mockEnqueuePendingRecipe` is called with the pending recipe. Verify the non-pending new keys are still injected (not dropped).

3. **Add new test: "sequential new recipes are all processed":**
   - Start with `jsonData = { recipe1 }` (initial mount)
   - Rerender with `jsonData = { recipe1, new1 (pending), new2 (ready) }`
   - Assert: `mockEnqueuePendingRecipe` called with `new1`, `injectRecipes` called with `['new2']`

4. **Add new test: "second jsonData update does not re-process already-dispatched keys":**
   - Start with `jsonData = { recipe1 }`
   - Rerender with `jsonData = { recipe1, new1 }`
   - Rerender again with same `jsonData = { recipe1, new1 }` (simulating a re-render)
   - Assert: `injectRecipes` called only once total

5. **Add new test: "multiple pending recipes are all enqueued":**
   - Start with `jsonData = { recipe1 }`
   - Rerender with `jsonData = { recipe1, pending1, pending2 }` (both pending image selection)
   - Assert: `mockEnqueuePendingRecipe` called twice, once for each

Run: `npx jest frontend/hooks/__tests__/useRecipeInjection.test.ts --no-watch`

**Commit Message Template:**
```
fix(hooks): prevent useRecipeInjection from dropping new recipe keys

- Always update prevJsonDataKeysRef to full current key set
- Track unprocessed keys in separate ref
- Remove pendingRecipe early-return guard
- Enqueue pending recipes instead of setting single slot
```

---

### Task 3: Update useImagePicker for queue-based pending recipes

**Goal:** Update `useImagePicker` to work with the queue-based pending recipe system. When a recipe is confirmed/deleted/cancelled, it should dequeue from the front, causing the next pending recipe to automatically become active.

**Files to Modify:**
- `frontend/hooks/useImagePicker.ts` -- Update interface and callbacks to use dequeue

**Prerequisites:** Task 1

**Implementation Steps:**

1. Update `UseImagePickerOptions` interface:
   - Replace `pendingRecipeForPicker: Recipe | null` with `pendingRecipeForPicker: Recipe | null` (keep the derived single value -- it comes from context)
   - Replace `setPendingRecipeForPicker: (recipe: Recipe | null) => void` with `dequeuePendingRecipe: () => void`

2. Update `resetPendingRecipe` callback:
   - Instead of `setPendingRecipeForPicker(null)`, call `dequeuePendingRecipe()`
   - This shifts the queue, so the next pending recipe (if any) automatically becomes `pendingRecipeForPicker`

3. Update the `onConfirmImage` flow:
   - After successful image confirmation, call `dequeuePendingRecipe()` instead of `resetPendingRecipe()` (or keep `resetPendingRecipe` which now calls dequeue internally)
   - The modal will automatically show the next pending recipe because `pendingRecipeForPicker` will update to the new queue head

4. Update `onDeleteRecipe` similarly.

5. The `showImagePickerModal` derivation remains the same: `pendingRecipeForPicker !== null`.

**Verification Checklist:**
- [ ] `resetPendingRecipe` calls `dequeuePendingRecipe`
- [ ] After confirming image for recipe A, if recipe B is queued, modal remains visible with recipe B
- [ ] After deleting recipe A, if recipe B is queued, modal shows recipe B
- [ ] If queue is empty after dequeue, modal closes

**Testing Instructions:**

Update `frontend/hooks/__tests__/useImagePicker.test.ts`:

1. Update mock setup to use `dequeuePendingRecipe` instead of `setPendingRecipeForPicker(null)`.

2. **Add test: "confirming image dequeues and shows next pending recipe":**
   - Provide `pendingRecipeForPicker` as recipe A
   - Call `onConfirmImage` with a URL
   - Assert `dequeuePendingRecipe` was called

3. **Add test: "deleting recipe dequeues and shows next pending recipe":**
   - Same pattern as above but with `onDeleteRecipe`

Run: `npx jest frontend/hooks/__tests__/useImagePicker.test.ts --no-watch`

**Commit Message Template:**
```
fix(hooks): update useImagePicker to dequeue from pending recipe queue

- Replace setPendingRecipeForPicker(null) with dequeuePendingRecipe
- Queue-based dismissal enables sequential image picker presentation
```

---

### Task 4: Update useImageQueue to wire new queue API

**Goal:** Update `useImageQueue` orchestrator hook to pass the new queue-based props from `RecipeContext` to `useRecipeInjection` and `useImagePicker`.

**Files to Modify:**
- `frontend/hooks/useImageQueue.ts` -- Update prop wiring

**Prerequisites:** Tasks 1, 2, 3

**Implementation Steps:**

1. Update the destructured values from `useRecipe()`:
   - Add `pendingRecipesForPicker`, `enqueuePendingRecipe`, `dequeuePendingRecipe`
   - Keep `pendingRecipeForPicker` (derived value for the modal)

2. Update `useRecipeInjection` call:
   - Pass `enqueuePendingRecipe` instead of `setPendingRecipeForPicker`
   - Remove `pendingRecipe` prop (no longer needed by the injection hook)

3. Update `useImagePicker` call:
   - Pass `dequeuePendingRecipe` instead of `setPendingRecipeForPicker`
   - Keep `pendingRecipeForPicker` for modal visibility derivation

**Verification Checklist:**
- [ ] TypeScript compiles with no errors: `npx tsc --noEmit`
- [ ] All three hooks are wired together correctly
- [ ] No references to old `setPendingRecipeForPicker` remain

**Testing Instructions:**

The `useImageQueue` hook is an integration point. Verify by running all hook tests:
```bash
npx jest frontend/hooks/__tests__/ --no-watch
```

**Commit Message Template:**
```
fix(hooks): wire useImageQueue to new pending recipe queue API

- Pass enqueuePendingRecipe to useRecipeInjection
- Pass dequeuePendingRecipe to useImagePicker
- Remove single-slot setPendingRecipeForPicker usage
```

---

### Task 5: Move ImagePickerModal to layout level

**Goal:** Move `ImagePickerModal` rendering from `index.tsx` (HomeScreen) to `_layout.tsx` so the image picker modal is accessible from any route. Use a `pendingInjectionKeys` mechanism in `RecipeContext` to defer swipe queue injection when `HomeScreen` is not mounted.

**Files to Modify:**
- `frontend/context/RecipeContext.tsx` -- Add `pendingInjectionKeys` state and `addPendingInjectionKey` function
- `frontend/hooks/useImagePicker.ts` -- Change `injectRecipes` parameter type from `(keys: string[]) => Promise<void>` to `(key: string) => void` (single-key injection callback)
- `frontend/hooks/useRecipeInjection.ts` -- Consume `pendingInjectionKeys` from context, inject them when queue is available
- `frontend/hooks/useImageQueue.ts` -- Update wiring: pass `addPendingInjectionKey` to `useImagePicker` instead of `injectRecipes`
- `frontend/app/_layout.tsx` -- Add `GlobalImagePicker` rendering
- `frontend/app/index.tsx` -- Remove ImagePickerModal rendering (both instances)

**Files to Create:**
- `frontend/components/GlobalImagePicker.tsx` -- Layout-level image picker component

**Prerequisites:** Tasks 1-4

**Implementation Steps:**

1. **Add `pendingInjectionKeys` to RecipeContext** (`frontend/context/RecipeContext.tsx`):
   - Add state: `const [pendingInjectionKeys, setPendingInjectionKeys] = useState<string[]>([])`
   - Add function: `addPendingInjectionKey(key: string)` -- appends `key` to array if not already present
   - Add function: `consumePendingInjectionKeys(): string[]` -- returns current keys and clears the array (set to `[]`)
   - Update `RecipeContextType` interface to include:
     ```typescript
     pendingInjectionKeys: string[];
     addPendingInjectionKey: (key: string) => void;
     consumePendingInjectionKeys: () => string[];
     ```
   - Add all three to the `useMemo` provider value

2. **Change `useImagePicker` injection interface** (`frontend/hooks/useImagePicker.ts`):
   - In `UseImagePickerOptions`, replace `injectRecipes: (recipeKeys: string[]) => Promise<void>` with `onRecipeConfirmed: (recipeKey: string) => void`
   - This is a generic callback that the caller uses to signal "this recipe's image was confirmed." The caller decides what to do (either inject directly into the swipe queue or defer via `addPendingInjectionKey`).
   - In `onConfirmImage`, after the successful `RecipeService.selectImage` call and `setJsonData` update, replace `await injectRecipes([pendingRecipe.key])` with `onRecipeConfirmed(pendingRecipe.key)`, then call `dequeuePendingRecipe()`.
   - Update the function destructuring to use `onRecipeConfirmed` instead of `injectRecipes`.

3. **Update `useImageQueue` wiring** (`frontend/hooks/useImageQueue.ts`):
   - From `useRecipe()`, destructure `addPendingInjectionKey`
   - When calling `useImagePicker`, pass `onRecipeConfirmed: addPendingInjectionKey` instead of `injectRecipes`
   - This means: when `useImagePicker` confirms an image (whether called from HomeScreen or GlobalImagePicker), the key goes into `pendingInjectionKeys` in context

4. **Update `useRecipeInjection` to consume pending injection keys** (`frontend/hooks/useRecipeInjection.ts`):
   - Add `consumePendingInjectionKeys` to the `UseRecipeInjectionOptions` interface
   - In the auto-detection effect, after processing new keys (step k in Task 2), also check: `const confirmedKeys = consumePendingInjectionKeys()`. If any confirmed keys exist and the recipes are in `jsonData` with image URLs, inject them via `injectRecipes`.
   - Wire `consumePendingInjectionKeys` from `useRecipe()` through `useImageQueue`.

5. **Create `frontend/components/GlobalImagePicker.tsx`:**
   ```typescript
   // Reads from RecipeContext, calls useImagePicker, renders ImagePickerModal
   export function GlobalImagePicker() {
     const {
       jsonData, setJsonData,
       pendingRecipeForPicker,
       dequeuePendingRecipe,
       addPendingInjectionKey,
     } = useRecipe();

     const {
       pendingRecipe, showImagePickerModal, isSubmitting,
       onConfirmImage, onDeleteRecipe, resetPendingRecipe,
     } = useImagePicker({
       jsonData, setJsonData,
       pendingRecipeForPicker,
       dequeuePendingRecipe,
       onRecipeConfirmed: addPendingInjectionKey,
     });

     if (!showImagePickerModal) return null;

     return (
       <ImagePickerModal
         visible={showImagePickerModal}
         recipe={pendingRecipe}
         isSubmitting={isSubmitting}
         onConfirmImage={onConfirmImage}
         onDeleteRecipe={onDeleteRecipe}
         onClose={resetPendingRecipe}
       />
     );
   }
   ```

6. **Add `GlobalImagePicker` to `_layout.tsx`** (`frontend/app/_layout.tsx`):
   - Import `GlobalImagePicker` from `@/components/GlobalImagePicker`
   - Render `<GlobalImagePicker />` inside `AppProvider` (after `<Stack>` or as a sibling)
   - Since `_layout.tsx` renders `AppProvider` which provides `RecipeContext`, the component has access to all needed context

7. **Remove ImagePickerModal from `index.tsx`** (`frontend/app/index.tsx`):
   - Remove both `ImagePickerModal` renderings (lines 142-148 and 189-195)
   - Remove `pendingRecipe`, `showImagePickerModal`, `onConfirmImage`, `onDeleteRecipe`, `resetPendingRecipe` from the `useImageQueue` destructuring (they are no longer consumed here)

**Alternatives Considered:**
- *Passing `injectRecipes` directly to GlobalImagePicker*: Rejected because `injectRecipes` depends on `useImageQueue` queue state that only exists when HomeScreen is mounted.
- *Keeping ImagePickerModal in HomeScreen and duplicating in layout*: Rejected because it would cause duplicate modals.
- *Calling `injectRecipes` via a context ref*: Rejected as overly complex; the pending keys pattern is simpler and testable.

**Verification Checklist:**
- [ ] `RecipeContextType` includes `pendingInjectionKeys`, `addPendingInjectionKey`, `consumePendingInjectionKeys`
- [ ] `UseImagePickerOptions.injectRecipes` is replaced with `onRecipeConfirmed: (key: string) => void`
- [ ] `GlobalImagePicker` renders `ImagePickerModal` and calls `useImagePicker` with context values
- [ ] `ImagePickerModal` renders in layout, not in HomeScreen
- [ ] Image picker modal appears when upload completes on any route (home, search, recipe detail)
- [ ] After confirming an image, the recipe key is added to `pendingInjectionKeys` and injected into the swipe queue when `useRecipeInjection` next runs
- [ ] No duplicate ImagePickerModal renderings

**Testing Instructions:**

- Update `frontend/hooks/__tests__/useImagePicker.test.ts`: replace `injectRecipes` mock with `onRecipeConfirmed` mock. Verify `onRecipeConfirmed` is called with the recipe key after successful image confirmation.
- Verify `npm run check` passes
- Add a test for `GlobalImagePicker` if time permits (render with mock context, verify modal appears when queue has items)

**Commit Message Template:**
```
refactor(layout): move ImagePickerModal to layout level via GlobalImagePicker

- Create GlobalImagePicker component for route-independent image selection
- Add pendingInjectionKeys to RecipeContext for deferred queue injection
- Change useImagePicker to accept generic onRecipeConfirmed callback
- Remove ImagePickerModal from HomeScreen
```

---

### Task 6: Fix document picker web gesture chain

**Goal:** Refactor the upload trigger so `DocumentPicker.getDocumentAsync()` is called synchronously from the user's click handler, fixing the web gesture trust chain issue.

**Files to Modify:**
- `frontend/components/Menu/MenuContainer.tsx` -- Call `selectAndUploadImage` directly from handler
- `frontend/components/Menu/UploadModal.tsx` -- Remove `UploadImage` component rendering, simplify to status display only
- `frontend/components/UploadRecipe.tsx` -- The `UploadFiles` component will no longer be rendered; `selectAndUploadImage` remains as an exported function

**Prerequisites:** None (independent of Tasks 1-5, but should be done after for clean integration)

**Implementation Steps:**

1. In `MenuContainer.tsx`, update `handleUploadPress`:
   ```
   Current: setMenuVisible(false) -> setUploadCount++ -> setUploadVisible(true)
            (which renders UploadModal -> which renders UploadFiles -> useEffect -> picker)

   New:     setMenuVisible(false) -> selectAndUploadImage(closeUpload)
            (calls picker synchronously from the gesture handler)
   ```
   - Import `selectAndUploadImage` from `@/components/UploadRecipe`
   - Call it directly in `handleUploadPress`
   - Remove `uploadVisible` and `uploadCount` state (no longer needed to trigger the component mount)
   - Remove `UploadModal` rendering entirely if it's only used for triggering the picker

2. Evaluate `UploadModal.tsx`:
   - It currently renders `UploadImage` (the picker trigger) and shows upload progress
   - The upload progress/status display is handled by `UploadListener` + `Toast` already
   - The `UploadModal` subscribes to `UploadService` and calls `setJsonData(job.result.jsonData)` on completion -- but `UploadListener` already calls `refetchRecipes()` which does the same thing (and is more correct since it fetches from S3)
   - `UploadModal` appears to be redundant with `UploadListener`. The only unique thing it does is show the `ErrorDetailModal`.
   - Decision: Remove `UploadModal` rendering from `MenuContainer`. If error detail display is needed, it can be added to `UploadListener` later (out of scope for this plan).

3. In `UploadRecipe.tsx`:
   - Keep `selectAndUploadImage` as an exported function (it's already exported)
   - The `UploadFiles` component can remain for backward compatibility but mark it with a deprecation comment, or remove it if no other consumers exist

4. Verify no other files import `UploadFiles` or the default export of `UploadRecipe.tsx`:
   - `Menu.tsx` (old, dead code) imports it
   - `UploadModal.tsx` imports it
   - After removing UploadModal rendering, UploadFiles has no live consumers

**Verification Checklist:**
- [ ] Clicking "Upload Recipe" from any route on web opens the document picker
- [ ] The document picker opens without delay (synchronous from gesture)
- [ ] Upload progress is still shown via Toast (handled by UploadListener)
- [ ] Upload completion still triggers `refetchRecipes` (handled by UploadListener)
- [ ] TypeScript compiles

**Testing Instructions:**

- This is primarily a behavioral fix for web. No new unit tests needed for the refactoring itself.
- Verify `UploadModal` tests still pass if the component is kept, or remove `frontend/components/Menu/__tests__/UploadModal.test.tsx` if UploadModal is removed.
- Run: `npm run check`

**Commit Message Template:**
```
fix(upload): call document picker synchronously from gesture handler

- Move DocumentPicker.getDocumentAsync call to MenuContainer.handleUploadPress
- Remove UploadFiles component mount pattern that broke web gesture chain
- Remove UploadModal rendering (redundant with UploadListener)
```

---

### Task 7: Clean up dead code

**Goal:** Remove confirmed dead code files that are no longer imported by any active component.

**Files to Modify/Delete:**
- `frontend/components/Menu.tsx` -- DELETE (old monolithic menu, replaced by `Menu/MenuContainer.tsx`)
- `frontend/components/Menu/UploadModal.tsx` -- DELETE if removed in Task 6
- `frontend/components/Menu/__tests__/UploadModal.test.tsx` -- DELETE if UploadModal deleted
- `frontend/components/Menu/index.ts` -- Remove UploadModal export if deleted

**Prerequisites:** Task 6

**Implementation Steps:**

1. Verify `frontend/components/Menu.tsx` (the file at the top level, not the directory) is not imported anywhere:
   - Search for `from '@/components/Menu'` or `from '../Menu'` -- these resolve to the `Menu/index.ts`, not `Menu.tsx`
   - The top-level `Menu.tsx` file sits alongside the `Menu/` directory. In Node resolution, `@/components/Menu` resolves to `Menu/index.ts` first (directory index takes precedence over adjacent file). Confirm this.
   - If confirmed dead, delete it.

2. If `UploadModal` was removed from rendering in Task 6:
   - Delete `frontend/components/Menu/UploadModal.tsx`
   - Delete `frontend/components/Menu/__tests__/UploadModal.test.tsx`
   - Remove the export from `frontend/components/Menu/index.ts`

3. Check if `UploadFiles` default export from `UploadRecipe.tsx` has any remaining consumers. If not, remove the component (keep the `selectAndUploadImage` function export).

**Verification Checklist:**
- [ ] No import errors after deletion: `npx tsc --noEmit`
- [ ] All tests pass: `npm test -- --ci --forceExit`
- [ ] `npm run check` passes

**Testing Instructions:**
```bash
npm run check
```

**Commit Message Template:**
```
chore(cleanup): remove dead code (old Menu.tsx, UploadModal)

- Delete monolithic Menu.tsx (replaced by Menu/MenuContainer.tsx)
- Delete UploadModal component and tests (redundant with UploadListener)
- Remove unused UploadFiles component from UploadRecipe.tsx
```

---

### Task 8: Add integration-level test for sequential upload scenario

**Goal:** Add a test that validates the full sequential upload scenario: two uploads completing in sequence, both with pending image selection, resulting in both image pickers being presented.

**Files to Create:**
- `frontend/hooks/__tests__/useRecipeInjection-sequential.test.ts` -- Focused test for the sequential upload bug fix

**Prerequisites:** Tasks 1-4

**Implementation Steps:**

1. Create a test file that simulates the exact bug scenario:
   - Render `useRecipeInjection` with initial jsonData containing existing recipes
   - Simulate first upload completion: rerender with jsonData containing `newRecipe1` (pending image selection)
   - Assert: `enqueuePendingRecipe` called with `newRecipe1`
   - Simulate `onConfirmImage` for newRecipe1 (update jsonData so newRecipe1 now has image_url)
   - Simulate second upload completion: rerender with jsonData containing `newRecipe1` (now with image) + `newRecipe2` (pending)
   - Assert: `enqueuePendingRecipe` called with `newRecipe2`
   - Assert: `newRecipe2` was NOT silently dropped

2. Add a test for the concurrent scenario:
   - Render with initial jsonData
   - Simulate first upload: jsonData gets `pending1`
   - Assert: `enqueuePendingRecipe` called with `pending1`
   - WITHOUT confirming pending1, simulate second upload: jsonData gets `pending1` + `pending2`
   - Assert: `enqueuePendingRecipe` called with `pending2` (not dropped due to pending1 being active)

3. Mock the same dependencies as the existing test file (ImageQueueService, ImageService).

**Verification Checklist:**
- [ ] Sequential upload test passes
- [ ] Concurrent upload test passes
- [ ] Tests demonstrate the specific bug that was fixed (would have failed before the fix)

**Testing Instructions:**
```bash
npx jest frontend/hooks/__tests__/useRecipeInjection-sequential.test.ts --no-watch
```

**Commit Message Template:**
```
test(hooks): add sequential and concurrent upload scenario tests

- Verify sequential uploads both present image pickers
- Verify concurrent uploads don't drop pending recipes
- Regression tests for the prevJsonDataKeysRef drop bug
```

---

## Phase Verification

After all tasks are complete:

1. **TypeScript compilation:**
   ```bash
   cd frontend && npx tsc --noEmit
   ```

2. **Lint:**
   ```bash
   npm run lint
   ```

3. **All tests:**
   ```bash
   npm test -- --ci --forceExit
   ```

4. **Full check:**
   ```bash
   npm run check
   ```

5. **Manual verification scenarios** (if dev server available):
   - Upload recipe A (needs image selection) -> image picker appears -> confirm -> recipe appears in swipe queue
   - Upload recipe A then recipe B (both need images) -> picker for A appears -> confirm A -> picker for B appears -> confirm B -> both in queue
   - While on `/recipe/[id]` page, click Upload -> document picker opens (web only)
   - Upload recipe while on `/search` page -> image picker modal appears over search page

## Known Limitations

- The `GlobalImagePicker` component introduces a new component that calls `useImagePicker` at the layout level. If HomeScreen is not mounted, confirmed recipes are deferred via `pendingInjectionKeys` in RecipeContext and injected into the swipe queue when `useRecipeInjection` next runs. There may be a brief delay before the recipe appears in the swipe queue if the user is on another route.
- The `UploadFiles` component pattern is removed but the `selectAndUploadImage` function is kept as the canonical way to trigger uploads. If native platforms relied on the component mount pattern for any reason, this should be verified on device.
- **Known regression: ErrorDetailModal removed.** `UploadModal` previously rendered `ErrorDetailModal` for detailed upload error display (e.g., per-file OCR failures). Removing `UploadModal` in Task 6 means this UI is lost. Upload errors are shown via Toast only (from `UploadListener`), which provides less detail. If detailed error display is needed, it should be added to `UploadListener` as a separate follow-up task.
