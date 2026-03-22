# Feedback

## Active Feedback

<!-- No active feedback items -->

## Resolved Feedback

### PLAN_REVIEW-001: Task 5 contains unresolved design deliberation instead of clear instructions
- **Source:** Plan Reviewer
- **Phase/Task:** Phase-1, Task 5
- **Severity:** BLOCKING
- **Description:** Task 5 reads like a stream-of-consciousness design session, not actionable implementation steps. It contains multiple abandoned approaches ("Option A," "Option B," "Actually, let me reconsider," "Even simpler," "Pragmatic approach," "Final approach") inline in the implementation steps. A zero-context engineer will not know which approach to follow. The "Final approach" (pendingInjectionKeysRef in RecipeContext) is buried after 3 abandoned alternatives. The task must be rewritten so that only the chosen approach appears in the implementation steps, with clear numbered steps describing exactly what to build. Move the design rationale to a brief "Alternatives considered" note at the end of the task if desired, but the implementation steps must be unambiguous.
- **Status:** RESOLVED
- **Resolution:** Rewrote Task 5 with 7 clear numbered implementation steps. All design deliberation and abandoned approaches removed from the steps. The chosen approach (pendingInjectionKeys state in RecipeContext + onRecipeConfirmed callback in useImagePicker + GlobalImagePicker component) is presented as the sole path. Rejected alternatives moved to a brief "Alternatives Considered" section at the end of the task.

### PLAN_REVIEW-002: Task 5 does not specify the full interface for pendingInjectionKeys in RecipeContext
- **Source:** Plan Reviewer
- **Phase/Task:** Phase-1, Task 5
- **Severity:** IMPORTANT
- **Description:** The final approach adds `pendingInjectionKeys` and `addPendingInjectionKey` to RecipeContext, but there are no details on: (1) the state type (array of strings? ref?), (2) how `useRecipeInjection` consumes and clears these keys, (3) whether this requires changes to the RecipeContextType interface (it does), (4) how this interacts with the `unprocessedKeysRef` introduced in Task 2. These details must be specified with the same precision as Tasks 1-4. Additionally, the changes to RecipeContext should be reflected in Task 1 or called out as a Task 5 addition to RecipeContext, so the engineer knows the context interface is modified in two separate tasks.
- **Status:** RESOLVED
- **Resolution:** Step 1 of revised Task 5 now fully specifies: (1) `pendingInjectionKeys` is `useState<string[]>([])`, (2) `addPendingInjectionKey` appends a key if not present, (3) `consumePendingInjectionKeys` returns current keys and clears the array, (4) all three are added to the `RecipeContextType` interface with explicit TypeScript types shown. Step 4 specifies how `useRecipeInjection` consumes these keys (calls `consumePendingInjectionKeys()` after processing new keys, injects any confirmed keys found in jsonData). Task 5 is explicitly called out as a separate modification to RecipeContext (distinct from Task 1's changes).

### PLAN_REVIEW-003: Task 5 step 3 references useImagePicker needing injectRecipes but GlobalImagePicker passes addPendingInjectionKey instead -- mechanism not fully specified
- **Source:** Plan Reviewer
- **Phase/Task:** Phase-1, Task 5
- **Severity:** IMPORTANT
- **Description:** `useImagePicker` currently requires `injectRecipes` in its options interface (confirmed in source: `UseImagePickerOptions.injectRecipes`). Task 5 says GlobalImagePicker will pass `addPendingInjectionKey` as the injection mechanism, but does not specify how this maps to the `injectRecipes` parameter. Options: (a) change `useImagePicker` to accept a generic callback instead of `injectRecipes`, (b) create a wrapper that adapts `addPendingInjectionKey` to the `injectRecipes` signature, or (c) create a separate hook for GlobalImagePicker. The plan must specify which approach and show the interface change, since Task 3 also modifies `useImagePicker`.
- **Status:** RESOLVED
- **Resolution:** Chose option (a): change `useImagePicker` to accept a generic callback. Step 2 of revised Task 5 specifies replacing `injectRecipes: (recipeKeys: string[]) => Promise<void>` with `onRecipeConfirmed: (recipeKey: string) => void` in `UseImagePickerOptions`. This is a single-key synchronous callback. In `onConfirmImage`, after successful image selection, the hook calls `onRecipeConfirmed(pendingRecipe.key)` then `dequeuePendingRecipe()`. Step 3 shows `useImageQueue` passes `addPendingInjectionKey` as the `onRecipeConfirmed` value, and Step 5 shows `GlobalImagePicker` does the same. Both callers use the same interface -- no adapter or separate hook needed.

### PLAN_REVIEW-004: Task 6 claims UploadModal is "redundant with UploadListener" but does not verify ErrorDetailModal handling
- **Source:** Plan Reviewer
- **Phase/Task:** Phase-1, Task 6
- **Severity:** SUGGESTION
- **Description:** Task 6 acknowledges that UploadModal provides ErrorDetailModal display and then dismisses it as "out of scope." This is fine as a scoping decision, but the plan should explicitly note this as a known regression so it is not forgotten. Consider adding it to the "Known Limitations" section at the bottom of Phase-1.
- **Status:** RESOLVED
- **Resolution:** Added explicit "Known regression: ErrorDetailModal removed" entry to the Known Limitations section of Phase-1. Notes that UploadModal's ErrorDetailModal UI (per-file OCR failure details) is lost, upload errors are Toast-only via UploadListener, and detailed error display should be a separate follow-up task.
