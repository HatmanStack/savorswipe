import { useEffect, useRef, useCallback } from 'react';
import { ImageQueueService } from '@/services/ImageQueueService';
import { ImageService } from '@/services/ImageService';
import { ImageFile, Recipe, S3JsonData } from '@/types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum queue size to prevent memory leaks */
const MAX_QUEUE_SIZE = 30;

/** Maximum number of injection retry attempts */
const INJECT_RETRY_MAX = 3;

/** Base delay between retry attempts in milliseconds */
const INJECT_RETRY_DELAY = 1000;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a recipe is pending image selection.
 * A recipe is pending if it has image_search_results but no image_url set.
 */
export function isPendingImageSelection(recipe: Recipe | undefined): boolean {
  if (!recipe) return false;
  return (
    Array.isArray(recipe.image_search_results) &&
    recipe.image_search_results.length > 0 &&
    !recipe.image_url
  );
}

// ============================================================================
// Types
// ============================================================================

export interface UseRecipeInjectionOptions {
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

export interface RecipeInjectionReturn {
  injectRecipes: (recipeKeys: string[]) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useRecipeInjection({
  jsonData,
  setQueue,
  setCurrentImage,
  setNextImage,
  setIsLoading,
  recipeKeyPoolRef,
  lastInjectionTimeRef,
  nextImageRef,
  pendingRecipe,
  setPendingRecipeForPicker,
}: UseRecipeInjectionOptions): RecipeInjectionReturn {
  const prevJsonDataKeysRef = useRef<Set<string>>(new Set());

  // Inject new recipes into queue with retry logic
  const injectRecipes = useCallback(async (recipeKeys: string[]): Promise<void> => {
    // Early return for empty array
    if (recipeKeys.length === 0) {
      return;
    }

    let fetchedImages: ImageFile[] = [];
    let attemptCount = 0;
    const chunkSize = ImageQueueService.CONFIG.BATCH_SIZE;

    // Retry loop for S3 eventual consistency.
    // attemptCount is incremented in two places: the partial-fetch path and the catch path.
    // These are mutually exclusive per iteration, so total attempts never exceed INJECT_RETRY_MAX (3).
    // - Success path: breaks immediately on full fetch.
    // - Partial path: retries with backoff on attempts 0 and 1; on attempt 2 uses partial results.
    // - Error path: increments and breaks at INJECT_RETRY_MAX.
    while (attemptCount < INJECT_RETRY_MAX) {
      try {
        // Fetch in chunks respecting batch size
        const chunkResults: ImageFile[] = [];
        for (let i = 0; i < recipeKeys.length; i += chunkSize) {
          const chunk = recipeKeys.slice(i, i + chunkSize);
          const result = await ImageQueueService.fetchBatch(chunk, chunk.length);
          chunkResults.push(...result.images);
        }

        // Success: all images fetched
        if (chunkResults.length === recipeKeys.length) {
          fetchedImages = chunkResults;
          break;
        }

        // Partial fetch: retry with exponential backoff
        if (attemptCount < INJECT_RETRY_MAX - 1) {
          const delay = INJECT_RETRY_DELAY * (attemptCount + 1);
          await new Promise(resolve => setTimeout(resolve, delay));
          attemptCount++;
          continue;
        }

        // Last retry: use what we got
        fetchedImages = chunkResults;
        break;
      } catch (error) {
        console.warn('[ImageQueue] Inject fetch attempt failed:', error);
        attemptCount++;

        if (attemptCount >= INJECT_RETRY_MAX) {
          break;
        }
      }
    }

    // No images fetched
    if (fetchedImages.length === 0) {
      return;
    }

    // Update queue with functional state update (single call to avoid race conditions)
    setQueue(prev => {
      // Get recipe keys already in queue to avoid duplicates
      const existingKeys = new Set(
        prev.map(img => ImageService.getRecipeKeyFromFileName(img.filename))
      );

      // Filter out images that are already in the queue
      const duplicatesToCleanup: ImageFile[] = [];
      const uniqueNewImages = fetchedImages.filter(img => {
        const key = ImageService.getRecipeKeyFromFileName(img.filename);
        if (existingKeys.has(key)) {
          duplicatesToCleanup.push(img);
          return false;
        }
        return true;
      });

      // Clean up duplicate blob URLs after a delay
      if (duplicatesToCleanup.length > 0) {
        setTimeout(() => {
          ImageQueueService.cleanupImages(duplicatesToCleanup);
        }, 300);
      }

      if (uniqueNewImages.length === 0) {
        return prev;
      }

      // Calculate insert position (min of 2 or queue length)
      const insertPosition = Math.min(2, prev.length);

      // Split queue
      const before = prev.slice(0, insertPosition);
      const after = prev.slice(insertPosition);

      // Combine
      let newQueue = [...before, ...uniqueNewImages, ...after];

      // Enforce max queue size
      if (newQueue.length > MAX_QUEUE_SIZE) {
        const excess = newQueue.slice(MAX_QUEUE_SIZE);
        ImageQueueService.cleanupImages(excess);
        newQueue = newQueue.slice(0, MAX_QUEUE_SIZE);
      }

      // Update nextImage if needed (use ref to avoid stale closure)
      if (newQueue.length >= 2 && nextImageRef.current === null) {
        setNextImage(newQueue[1]);
      }

      // Injecting a new recipe (especially with high priority) should update currentImage if queue was effectively empty
      if (prev.length === 0 && newQueue.length > 0) {
        setCurrentImage(newQueue[0]);
        setIsLoading(false); // Ensure loading state is cleared if we inject into an empty queue
      }

      return newQueue;
    });

    // Remove injected keys from pool to avoid duplicates
    recipeKeyPoolRef.current = recipeKeyPoolRef.current.filter(
      key => !recipeKeys.includes(key)
    );

    // Set timestamp to block refill for 2 seconds
    lastInjectionTimeRef.current = Date.now();
  }, []); // Empty deps - all state reads use refs or functional updates

  // Effect: Auto-detect new recipes in jsonData and inject them
  useEffect(() => {
    if (!jsonData) return;

    // Get current keys
    const currentKeys = new Set(Object.keys(jsonData));

    // Get previous keys
    const previousKeys = prevJsonDataKeysRef.current;

    // Skip injection on first mount (prevJsonDataKeysRef is empty Set)
    if (previousKeys.size === 0) {
      // Just initialize the ref without injecting (queue already initialized)
      prevJsonDataKeysRef.current = currentKeys;
      return;
    }

    // Find new keys
    const newKeys = Array.from(currentKeys).filter(key => !previousKeys.has(key));

    // Early exit if no new keys - prevents unnecessary work when effect runs
    // due to pendingRecipe changes without actual jsonData changes
    if (newKeys.length === 0) {
      return;
    }

    // If a pending recipe is already being resolved, defer processing new keys
    // to avoid overwriting the active pendingRecipe with a different one
    if (pendingRecipe) {
      return;
    }

    // Check for pending recipes (recipes with image_search_results but no image_url)
    // Prioritize pending recipes over injecting all new recipes
    for (const key of newKeys) {
      const recipe = jsonData[key];

      if (isPendingImageSelection(recipe)) {
        const recipeWithKey = { ...recipe, key };
        setPendingRecipeForPicker(recipeWithKey);

        // Mark only this specific pending key as processed so other new keys
        // remain available for later injection
        prevJsonDataKeysRef.current = new Set([...previousKeys, key]);
        return;
      }
    }

    // If new keys found and no pending recipes, inject them
    injectRecipes(newKeys);

    // Update previous keys ref
    prevJsonDataKeysRef.current = currentKeys;
  }, [jsonData, injectRecipes, pendingRecipe, setPendingRecipeForPicker]);

  return { injectRecipes };
}
