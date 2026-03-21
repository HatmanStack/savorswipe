# Phase 0: Foundation

## Architecture Decisions

### ADR-1: Pending recipe queue replaces single slot

**Decision:** Replace `pendingRecipeForPicker: Recipe | null` in `RecipeContext` with `pendingRecipesForPicker: Recipe[]` (an array queue). The `ImagePickerModal` will consume from the front of the queue. When the user confirms/deletes/cancels, the next recipe in the queue is presented.

**Rationale:** The current single-slot design causes a race condition: when a second upload completes while the first upload's image picker modal is open, the second recipe has nowhere to go. The `pendingRecipe` early-return guard in `useRecipeInjection` (line 232) silently drops the new keys because `prevJsonDataKeysRef` is only partially updated (line 247). Converting to a queue means multiple pending recipes can coexist.

**Consequences:**
- `RecipeContext` API changes: `setPendingRecipeForPicker(recipe | null)` becomes `enqueuePendingRecipe(recipe)` and `dequeuePendingRecipe()`.
- All consumers of `pendingRecipeForPicker` must be updated.
- The `useRecipeInjection` effect no longer needs an early return for `pendingRecipe`; it can always enqueue.

### ADR-2: Document picker called synchronously from gesture handler

**Decision:** Move the `DocumentPicker.getDocumentAsync()` call out of the `UploadFiles` component's `useEffect` and into the click handler in `MenuContainer`/`UploadModal`. The `selectAndUploadImage` function will be called directly from `handleUploadPress`.

**Rationale:** Browsers require file input dialogs to originate from a synchronous user gesture handler. The current pattern (click -> setState -> render UploadFiles -> useEffect -> async picker) breaks the gesture trust chain, especially on heavier pages like `/recipe/[id]` where the render cost pushes the picker call outside the browser's gesture timeout window.

**Consequences:**
- `UploadFiles` component becomes unnecessary (it was only a vehicle for the useEffect trigger).
- The upload flow moves from declarative (render component to trigger) to imperative (call function from handler).
- No impact on native platforms since they don't have gesture trust requirements.

### ADR-3: ImagePickerModal moved to layout level

**Decision:** Move `ImagePickerModal` from `index.tsx` (HomeScreen) to `_layout.tsx` so it's always mounted regardless of the current route.

**Rationale:** Currently, `ImagePickerModal` only renders inside `HomeScreen`. If a user is on `/recipe/[id]` or `/search` when an upload completes, the modal cannot appear. Moving it to the layout ensures it's always available.

**Consequences:**
- `useImageQueue` hook usage needs to be restructured: the image picker state (pending recipe, modal visibility, callbacks) must be available at the layout level, while the swipe queue state stays in HomeScreen.
- The cleanest approach is to split the image picker logic into the context (where it already partially lives via `pendingRecipeForPicker`) and let the layout render the modal directly from context state.

### ADR-4: Fix prevJsonDataKeysRef update logic

**Decision:** Always update `prevJsonDataKeysRef` to the full current key set at the end of the auto-detection effect, regardless of whether recipes were enqueued for image selection or injected into the swipe queue.

**Rationale:** The current code only partially updates `prevJsonDataKeysRef` when a pending recipe is found (line 247: adds only the pending key). This means other new keys that arrived in the same `setJsonData` call are never recorded as "seen" and are silently dropped on the next effect run (because the effect early-returns due to `pendingRecipe` being non-null). Always recording all current keys as "seen" and tracking unprocessed keys separately fixes the bug.

**Consequences:**
- New keys that need processing will be tracked in a separate `unprocessedKeysRef` rather than relying on the diff between `prevJsonDataKeysRef` and current keys.
- The effect becomes simpler: detect new keys, add to unprocessed set, process the unprocessed set (enqueue pending or inject).

## Tech Stack

All changes are frontend-only:
- **Language:** TypeScript
- **Framework:** React Native / Expo (Expo Router for navigation)
- **State:** React Context API (`RecipeContext`)
- **Testing:** Jest with `@testing-library/react-native`, `renderHook` for hooks

No new dependencies are required.

## Testing Strategy

### Unit Tests
- All hook changes (`useRecipeInjection`, `useImagePicker`, `useImageQueue`) have existing test files that must be updated to cover the new behavior.
- New tests must cover:
  - Sequential upload scenario: two new recipes arriving in rapid succession
  - Concurrent upload scenario: second recipe arrives while first is pending image selection
  - Queue draining: after confirming/deleting first pending recipe, second is automatically presented
  - `prevJsonDataKeysRef` never drops keys

### Mocking Approach
- `ImageQueueService` and `ImageService` are already mocked in existing tests -- continue using the same pattern.
- `RecipeService` is mocked for `selectRecipeImage` and `deleteRecipe`.
- `DocumentPicker` from `expo-document-picker` needs mocking for the refactored upload flow.
- No live cloud resources needed; all tests run with Jest mocks.

### Test Commands
```bash
# Run all frontend tests
npm test -- --ci --forceExit

# Run specific test file
npx jest frontend/hooks/__tests__/useRecipeInjection.test.ts --no-watch

# Run full check suite (lint + typecheck + tests)
npm run check
```

## Commit Message Format

Use conventional commits:
```text
fix(hooks): description of hook fix
refactor(upload): description of upload refactor
test(hooks): description of test changes
chore(cleanup): description of dead code removal
```

## Shared Patterns

### Recipe pending image selection check
The helper `isPendingImageSelection(recipe)` in `useRecipeInjection.ts` determines if a recipe needs image selection. This function is the single source of truth for this check and should be reused, not duplicated.

### Functional state updaters
All `setJsonData`, `setQueue`, and similar state setters use functional updater form (`prev => ...`) to avoid stale closure bugs. Maintain this pattern.

### Ref-based tracking
Mutable refs (`prevJsonDataKeysRef`, `lastInjectionTimeRef`, etc.) are used to avoid triggering re-renders for tracking state. Continue this pattern for the new `unprocessedKeysRef`.
