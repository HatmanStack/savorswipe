import { useState, useEffect, useRef, useCallback } from 'react';
import { useRecipe } from '@/context/RecipeContext';
import { ImageQueueService } from '@/services/ImageQueueService';
import { ImageService } from '@/services/ImageService';
import { RecipeService } from '@/services/RecipeService';
import { ToastQueue } from '@/components/Toast';
import { ImageFile, Recipe } from '@/types';
import { ImageQueueHook } from '@/types/queue';

// Constants for queue injection
const MAX_QUEUE_SIZE = 30;  // Prevent memory leaks
const INJECT_RETRY_MAX = 3;
const INJECT_RETRY_DELAY = 1000;  // milliseconds

/**
 * Check if a recipe is pending image selection.
 * A recipe is pending if it has image_search_results but no image_url set.
 */
function isPendingImageSelection(recipe: Recipe | undefined): boolean {
  if (!recipe) return false;
  return (
    Array.isArray(recipe.image_search_results) &&
    recipe.image_search_results.length > 0 &&
    !recipe.image_url
  );
}

/**
 * Transform raw error messages into user-friendly messages.
 * Maps technical errors to actionable, non-technical language.
 *
 * @param rawError - Raw error message from backend or network
 * @returns User-friendly error message
 */
function transformErrorMessage(rawError: string): string {
  const errorLower = rawError.toLowerCase();

  // Network and timeout errors
  if (errorLower.includes('timeout') || errorLower.includes('request timeout')) {
    return 'Taking longer than expected. Please check your internet and try again.';
  }

  if (errorLower.includes('network') || errorLower.includes('failed')) {
    return 'Unable to connect. Please check your internet connection.';
  }

  // Recipe not found
  if (errorLower.includes('recipe not found') || errorLower.includes('404')) {
    return 'Recipe not found. It may have been deleted.';
  }

  // Invalid image URL
  if (
    errorLower.includes('invalid image url') ||
    errorLower.includes('invalid url') ||
    errorLower.includes('400')
  ) {
    return "Image couldn't be loaded. Please select another image.";
  }

  // Server errors
  if (errorLower.includes('500') || errorLower.includes('server error')) {
    return 'Server error. Please try again later.';
  }

  // Google image fetch failures
  if (errorLower.includes('fetch image from google')) {
    return "Image couldn't be loaded from source. Please select another image.";
  }

  // Fallback for unknown errors
  return 'An error occurred. Please try again.';
}

export function useImageQueue(): ImageQueueHook {
  // Local state
  const [queue, setQueue] = useState<ImageFile[]>([]);
  const [currentImage, setCurrentImage] = useState<ImageFile | null>(null);
  const [nextImage, setNextImage] = useState<ImageFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Image picker modal state
  const [pendingRecipe, setPendingRecipe] = useState<Recipe | null>(null);
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);

  // Recipe key pool (mutable ref, doesn't trigger re-renders)
  const recipeKeyPoolRef = useRef<string[]>([]);
  const isRefillingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isInitializingRef = useRef(false);
  const queueRef = useRef<ImageFile[]>([]); // Track latest queue for cleanup
  const prevJsonDataKeysRef = useRef<Set<string>>(new Set());
  const nextImageRef = useRef<ImageFile | null>(null); // Track nextImage for injection without causing re-creation
  const lastInjectionTimeRef = useRef<number>(0); // Track last injection time to block refills
  const seenRecipeKeysRef = useRef<Set<string>>(new Set()); // Track seen recipes to avoid duplicates

  // Context - extract all needed values at top level (React Hook Rules)
  const { jsonData, setCurrentRecipe, setJsonData, mealTypeFilters } = useRecipe();

  // Keep queueRef and nextImageRef in sync with state
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    nextImageRef.current = nextImage;
  }, [nextImage]);

  // Internal helper to update current recipe in context
  const updateCurrentRecipe = useCallback((image: ImageFile) => {
    if (!jsonData) return;

    const recipeKey = ImageService.getRecipeKeyFromFileName(image.filename);
    const recipe = jsonData[recipeKey];

    if (recipe) {
      setCurrentRecipe({ ...recipe, key: recipeKey });
    }
  }, [jsonData, setCurrentRecipe]);

  // Reset pending recipe state
  const resetPendingRecipe = useCallback(() => {
    setPendingRecipe(null);
    setShowImagePickerModal(false);
  }, []);

  // Inject new recipes into queue with retry logic
  const injectRecipes = useCallback(async (recipeKeys: string[]): Promise<void> => {
    // Early return for empty array
    if (recipeKeys.length === 0) {
      return;
    }

    let fetchedImages: ImageFile[] = [];
    let attemptCount = 0;

    // Retry loop for S3 eventual consistency
    while (attemptCount < INJECT_RETRY_MAX) {
      try {
        const result = await ImageQueueService.fetchBatch(recipeKeys, recipeKeys.length);

        // Success: all images fetched
        if (result.images.length === recipeKeys.length) {
          fetchedImages = result.images;
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
        fetchedImages = result.images;
        break;
      } catch (error) {
          console.error('Error fetching images for injection:', error);
        attemptCount++;

        if (attemptCount >= INJECT_RETRY_MAX) {
          break;
        }
      }
    }

    // No images fetched
    if (fetchedImages.length === 0) {
      console.log('[QUEUE] No images fetched for injection after retries');
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
          console.log('[QUEUE] Recipe', key, 'already in queue - skipping duplicate injection');
          duplicatesToCleanup.push(img);
          return false;
        }
        return true;
      });

      // Clean up duplicate blob URLs after a delay
      if (duplicatesToCleanup.length > 0) {
        setTimeout(() => {
          console.log('[QUEUE] Cleaning up', duplicatesToCleanup.length, 'duplicate blob URLs (delayed)');
          ImageQueueService.cleanupImages(duplicatesToCleanup);
        }, 300);
      }

      if (uniqueNewImages.length === 0) {
        console.log('[QUEUE] No new unique recipes to inject after deduplication');
        return prev;
      }

      console.log('[QUEUE] Injecting', uniqueNewImages.length, 'unique recipes (filtered', duplicatesToCleanup.length, 'duplicates)');

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

      return newQueue;
    });

    // Remove injected keys from pool to avoid duplicates
    recipeKeyPoolRef.current = recipeKeyPoolRef.current.filter(
      key => !recipeKeys.includes(key)
    );

    // Set timestamp to block refill for 2 seconds
    lastInjectionTimeRef.current = Date.now();
    console.log('[QUEUE] Injection complete - refill blocked for 2 seconds');
    console.log('Successfully injected', fetchedImages.length, 'recipes into queue');

  }, []); // Empty deps - all state reads use refs or functional updates

  // Handle image selection confirmation
  const onConfirmImage = useCallback(
    async (imageUrl: string) => {
      if (!pendingRecipe || !jsonData || !setJsonData) {
        console.warn('[QUEUE] No pending recipe to confirm');
        return;
      }

      ToastQueue.show('Saving image selection...');

      try {
        console.log('[QUEUE] Confirming image selection for:', pendingRecipe.key);

        // Call backend to select image
        const updatedRecipe = await RecipeService.selectRecipeImage(
          pendingRecipe.key,
          imageUrl
        );

        // Update local jsonData with the returned recipe
        const updatedJsonData = {
          ...jsonData,
          [pendingRecipe.key]: updatedRecipe,
        };
        setJsonData(updatedJsonData);

        // Inject recipe into queue
        await injectRecipes([pendingRecipe.key]);

        // Clear pending state
        resetPendingRecipe();

        ToastQueue.show('Image saved');
        console.log('[QUEUE] Image selection confirmed for:', pendingRecipe.key);
      } catch (error) {
        const rawError =
          error instanceof Error ? error.message : 'Unknown error occurred';
        const userFriendlyError = transformErrorMessage(rawError);
        console.error('[QUEUE] Image selection failed:', error);
        ToastQueue.show(`Failed to save image: ${userFriendlyError}`);
        // Keep modal visible for retry
      }
    },
    [pendingRecipe, jsonData, setJsonData, injectRecipes, resetPendingRecipe]
  );

  // Handle recipe deletion
  const onDeleteRecipe = useCallback(async () => {
    if (!pendingRecipe || !jsonData || !setJsonData) {
      console.warn('[QUEUE] No pending recipe to delete');
      return;
    }

    ToastQueue.show('Deleting recipe...');

    try {
      console.log('[QUEUE] Deleting recipe:', pendingRecipe.key);

      // Call backend to delete recipe
      await RecipeService.deleteRecipe(pendingRecipe.key);

      // Remove recipe from local jsonData
      const updatedJsonData = { ...jsonData };
      delete updatedJsonData[pendingRecipe.key];
      setJsonData(updatedJsonData);

      // Clear pending state
      resetPendingRecipe();

      ToastQueue.show('Recipe deleted');
      console.log('[QUEUE] Recipe deleted:', pendingRecipe.key);
    } catch (error) {
      const rawError =
        error instanceof Error ? error.message : 'Unknown error occurred';
      const userFriendlyError = transformErrorMessage(rawError);
      console.error('[QUEUE] Recipe deletion failed:', error);
      ToastQueue.show(`Failed to delete recipe: ${userFriendlyError}`);
      // Keep modal visible for retry
    }
  }, [pendingRecipe, jsonData, setJsonData, resetPendingRecipe]);

  // Initialize queue on first load
  const initializeQueue = useCallback(async () => {
    if (!jsonData) return;

    // Prevent double initialization
    if (isInitializingRef.current) return;

    isInitializingRef.current = true;
    setIsLoading(true);

    try {
      // Create shuffled recipe key pool
      const recipeKeyPool = ImageQueueService.createRecipeKeyPool(jsonData, mealTypeFilters);
      recipeKeyPoolRef.current = recipeKeyPool;

      // Calculate batch sizes for initial load
      const totalRecipes = recipeKeyPool.length;
      const targetSize = Math.min(ImageQueueService.CONFIG.INITIAL_QUEUE_SIZE, totalRecipes);
      const batchSize = Math.min(ImageQueueService.CONFIG.BATCH_SIZE, Math.ceil(targetSize / 3));

      // Fetch initial batches in parallel for faster initialization
      const [batch1, batch2, batch3] = await Promise.all([
        ImageQueueService.fetchBatch(recipeKeyPool.slice(0, batchSize), batchSize),
        ImageQueueService.fetchBatch(recipeKeyPool.slice(batchSize, batchSize * 2), batchSize),
        ImageQueueService.fetchBatch(recipeKeyPool.slice(batchSize * 2, batchSize * 3), batchSize),
      ]);

      // Combine all successfully fetched images
      const allImages = [...batch1.images, ...batch2.images, ...batch3.images];

      // Only update state if component is still mounted
      if (!isMountedRef.current) return;

      // Update queue
      setQueue(allImages);

      // Remove fetched keys from pool (including failed ones to avoid retrying)
      const fetchedCount = batch1.images.length + batch1.failedKeys.length +
                          batch2.images.length + batch2.failedKeys.length +
                          batch3.images.length + batch3.failedKeys.length;
      recipeKeyPoolRef.current = recipeKeyPool.slice(fetchedCount);

      // Set current and next images
      if (allImages[0]) {
        setCurrentImage(allImages[0]);
        updateCurrentRecipe(allImages[0]);
      }

      if (allImages[1]) {
        setNextImage(allImages[1]);
      }
    } catch (error) {
        console.error('Error initializing image queue:', error);
    } finally {
      isInitializingRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [jsonData, mealTypeFilters, updateCurrentRecipe]);

  // Refill queue in background
  const refillQueue = useCallback(async () => {
    // Don't refill if already refilling
    if (isRefillingRef.current) {
      return;
    }

    // Don't refill immediately after injection (wait 2 seconds)
    // UNLESS the queue is completely empty (emergency refill)
    const timeSinceInjection = Date.now() - lastInjectionTimeRef.current;
    const isQueueEmpty = queueRef.current.length === 0;
    if (timeSinceInjection < 2000 && !isQueueEmpty) {
      console.log('[QUEUE] Skipping refill - injection happened', timeSinceInjection, 'ms ago');
      return;
    }

    if (isQueueEmpty) {
      console.log('[QUEUE] Emergency refill - queue is completely empty');
    }

    // If pool is empty, reshuffle to create a new pool
    if (recipeKeyPoolRef.current.length === 0 && jsonData) {
      console.log('[QUEUE] Recipe pool exhausted, reshuffling with seen recipes at end...');
      console.log('[QUEUE] Seen recipes this session:', seenRecipeKeysRef.current.size);

      // Create new shuffled pool
      const allKeys = ImageQueueService.createRecipeKeyPool(jsonData, mealTypeFilters);

      // Separate seen and unseen recipes
      const unseenKeys = allKeys.filter(key => !seenRecipeKeysRef.current.has(key));
      const seenKeys = allKeys.filter(key => seenRecipeKeysRef.current.has(key));

      // Put unseen recipes first, then seen recipes at the end
      recipeKeyPoolRef.current = [...unseenKeys, ...seenKeys];

      console.log('[QUEUE] Total recipes in jsonData:', Object.keys(jsonData).length);
      console.log('[QUEUE] Recipes matching filters:', allKeys.length);
      console.log('[QUEUE] Missing recipes:', Object.keys(jsonData).length - allKeys.length);
      console.log('[QUEUE] Reshuffled pool:', unseenKeys.length, 'unseen,', seenKeys.length, 'seen');
    }

    // If still no keys available (no recipes match filters), return
    if (recipeKeyPoolRef.current.length === 0) {
      return;
    }

    isRefillingRef.current = true;

    try {
      const result = await ImageQueueService.fetchBatch(
        recipeKeyPoolRef.current,
        ImageQueueService.CONFIG.BATCH_SIZE
      );

      // Only update if component is still mounted
      if (!isMountedRef.current) return;

      // Append new images to queue
      if (result.images.length > 0) {
        const wasEmpty = queueRef.current.length === 0;

        setQueue(prev => {
          const newQueue = [...prev, ...result.images];

          // If queue was empty, initialize currentImage and nextImage
          if (wasEmpty && newQueue.length > 0) {
            console.log('[QUEUE] Queue was empty, initializing currentImage and nextImage');
            setCurrentImage(newQueue[0]);
            if (newQueue.length > 1) {
              setNextImage(newQueue[1]);
            }
            // Update recipe context
            if (newQueue[0]) {
              updateCurrentRecipe(newQueue[0]);
            }
            setIsLoading(false);
          }

          return newQueue;
        });
      }

      // Remove fetched keys from pool
      const fetchedCount = result.images.length + result.failedKeys.length;
      recipeKeyPoolRef.current = recipeKeyPoolRef.current.slice(fetchedCount);
    } catch (error) {
        console.error('Error refilling queue:', error);
    } finally {
      isRefillingRef.current = false;
    }
  }, [jsonData, mealTypeFilters, updateCurrentRecipe]);

  // Advance to next image in queue
  const advanceQueue = useCallback(() => {
    // Use functional state update to avoid stale closure
    setQueue(prev => {
      // Don't advance if queue is empty
      if (prev.length <= 0) {
        return prev;
      }

      // Clean up current image blob URL
      if (prev[0]) {
        ImageQueueService.cleanupImages([prev[0]]);
      }

      // Shift queue
      const newQueue = prev.slice(1);

      // Update current and next images with null fallbacks
      const newCurrent = newQueue[0] || null;
      const newNext = newQueue[1] || null;

      setCurrentImage(newCurrent);
      setNextImage(newNext);

      // Update recipe in context if new current image exists
      if (newCurrent) {
        updateCurrentRecipe(newCurrent);

        // Mark recipe as seen
        const recipeKey = ImageService.getRecipeKeyFromFileName(newCurrent.filename);
        seenRecipeKeysRef.current.add(recipeKey);
        console.log('[QUEUE] Marked recipe as seen:', recipeKey, '- Total seen:', seenRecipeKeysRef.current.size);
      }

      return newQueue;
    });
  }, [updateCurrentRecipe]);

  // Reset queue (called on filter change)
  const resetQueue = useCallback(async () => {
    // Clean up existing queue using ref to avoid stale closure
    ImageQueueService.cleanupImages(queueRef.current);

    // Clear seen recipes tracker (new filter context)
    seenRecipeKeysRef.current.clear();
    console.log('[QUEUE] Cleared seen recipes tracker for filter change');

    // Clear state
    setQueue([]);
    setCurrentImage(null);
    setNextImage(null);
    setIsLoading(true);

    // Reinitialize
    await initializeQueue();
  }, [initializeQueue]);

  // Effect: Initialize queue on mount
  useEffect(() => {
    isMountedRef.current = true;

    if (jsonData && queue.length === 0 && !isLoading) {
      initializeQueue();
    }

    // Cleanup on unmount ONLY - don't run when jsonData changes
    return () => {
      isMountedRef.current = false;
      ImageQueueService.cleanupImages(queueRef.current);
    };
  }, []); // Empty deps - only run on mount/unmount

  // Effect: Auto-initialize when jsonData becomes available
  useEffect(() => {
    if (jsonData && queue.length === 0 && isLoading) {
      initializeQueue();
    }
  }, [jsonData, queue.length, isLoading, initializeQueue]);

  // Effect: Reset queue when filters change
  useEffect(() => {
    // Skip on initial mount (jsonData will be null)
    if (!jsonData) return;

    // Only reset if we already have a queue (avoid double initialization)
    if (queue.length > 0 || currentImage !== null) {
      resetQueue();
    }
  }, [mealTypeFilters]); // Only depend on filters, not the functions

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

    // Check for pending recipes (recipes with image_search_results but no image_url)
    // Prioritize pending recipes over injecting all new recipes
    for (const key of newKeys) {
      const recipe = jsonData[key];
      if (isPendingImageSelection(recipe)) {
        console.log('[QUEUE] Pending recipe detected:', key);
        setPendingRecipe({ ...recipe, key });
        setShowImagePickerModal(true);
        // Don't inject pending recipe into queue yet - pause until selection is complete
        prevJsonDataKeysRef.current = currentKeys;
        return;
      }
    }

    // If new keys found and no pending recipes, inject them
    if (newKeys.length > 0) {
      injectRecipes(newKeys);
    }

    // Update previous keys ref
    prevJsonDataKeysRef.current = currentKeys;
  }, [jsonData, injectRecipes]);

  // Effect: Check if queue needs refilling
  useEffect(() => {
    if (
      ImageQueueService.shouldRefillQueue(queue.length) &&
      !isRefillingRef.current
    ) {
      refillQueue();
    }
  }, [queue.length, refillQueue]);

  return {
    currentImage,
    nextImage,
    isLoading,
    queueLength: queue.length,
    advanceQueue,
    resetQueue,
    injectRecipes,
    pendingRecipe,
    showImagePickerModal,
    resetPendingRecipe,
    onConfirmImage,
    onDeleteRecipe,
  };
}
