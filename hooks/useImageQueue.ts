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

  // Recipe not found - check before generic 404
  if (errorLower.includes('recipe not found') || errorLower.includes('404')) {
    return 'Recipe not found. It may have been deleted.';
  }

  // Invalid image URL - check before generic 400
  if (
    errorLower.includes('invalid image url') ||
    errorLower.includes('invalid url') ||
    errorLower.includes('400')
  ) {
    return "Image couldn't be loaded. Please select another image.";
  }

  // Server errors - check before generic "failed"
  if (errorLower.includes('500') || errorLower.includes('server error')) {
    return 'Server error. Please try again later.';
  }

  // Google image fetch failures - check before generic "failed"
  if (errorLower.includes('fetch image from google')) {
    return "Image couldn't be loaded from source. Please select another image.";
  }

  // Generic network/failed errors - check last to avoid misclassification
  if (errorLower.includes('network') || errorLower.includes('failed')) {
    return 'Unable to connect. Please check your internet connection.';
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
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const {
    jsonData,
    setCurrentRecipe,
    setJsonData,
    mealTypeFilters,
    pendingRecipeForPicker,
    setPendingRecipeForPicker
  } = useRecipe();

  // Derive modal visibility from context state
  const showImagePickerModal = pendingRecipeForPicker !== null;
  const pendingRecipe = pendingRecipeForPicker;

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

  // Effect: Update recipe context when currentImage changes
  useEffect(() => {
    if (currentImage) {
      updateCurrentRecipe(currentImage);
    }
  }, [currentImage, updateCurrentRecipe]);

  // Reset pending recipe state
  const resetPendingRecipe = useCallback(() => {
    setPendingRecipeForPicker(null);
  }, [setPendingRecipeForPicker]);

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
      } catch {
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

  // Handle image selection confirmation
  const onConfirmImage = useCallback(
    async (imageUrl: string) => {
      if (!pendingRecipe || !jsonData || isSubmitting) {

        return;
      }

      // Capture recipe key before clearing state
      const recipeKey = pendingRecipe.key;

      setIsSubmitting(true);
      ToastQueue.show('Saving image selection...');

      try {

        // Call backend to select image
        const updatedRecipe = await RecipeService.selectRecipeImage(
          recipeKey,
          imageUrl
        );

        // Update local jsonData with the returned recipe
        const updatedJsonData = {
          ...jsonData,
          [recipeKey]: updatedRecipe,
        };
        setJsonData(updatedJsonData);

        // Inject recipe into queue
        await injectRecipes([recipeKey]);

        // Hide modal only after successful completion
        resetPendingRecipe();

        ToastQueue.show('Image saved');

      } catch (error) {
        const rawError =
          error instanceof Error ? error.message : 'Unknown error occurred';
        const userFriendlyError = transformErrorMessage(rawError);

        ToastQueue.show(`Failed to save image: ${userFriendlyError}`);
        // Keep modal open on failure so user can retry
      } finally {
        setIsSubmitting(false);
      }
    },
    [pendingRecipe, jsonData, isSubmitting, setJsonData, injectRecipes, resetPendingRecipe]
  );

  // Handle recipe deletion
  const onDeleteRecipe = useCallback(async () => {
    if (!pendingRecipe || !jsonData || isSubmitting) {

      return;
    }

    // Capture recipe key before clearing state
    const recipeKey = pendingRecipe.key;

    setIsSubmitting(true);
    ToastQueue.show('Deleting recipe...');

    try {

      // Call backend to delete recipe
      await RecipeService.deleteRecipe(recipeKey);

      // Remove recipe from local jsonData
      const updatedJsonData = { ...jsonData };
      delete updatedJsonData[recipeKey];
      setJsonData(updatedJsonData);

      // Hide modal only after successful completion
      resetPendingRecipe();

      ToastQueue.show('Recipe deleted');

    } catch (error) {
      const rawError =
        error instanceof Error ? error.message : 'Unknown error occurred';
      const userFriendlyError = transformErrorMessage(rawError);

      ToastQueue.show(`Failed to delete recipe: ${userFriendlyError}`);
      // Keep modal open on failure so user can retry
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingRecipe, jsonData, isSubmitting, setJsonData, resetPendingRecipe]);

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
      }

      if (allImages[1]) {
        setNextImage(allImages[1]);
      }
    } catch {
      // Initialization error - already handled by finally block
    } finally {
      isInitializingRef.current = false;
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [jsonData, mealTypeFilters]);

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

      return;
    }

    if (isQueueEmpty) {

    }

    // If pool is empty, reshuffle to create a new pool
    if (recipeKeyPoolRef.current.length === 0 && jsonData) {


      // Create new shuffled pool
      const allKeys = ImageQueueService.createRecipeKeyPool(jsonData, mealTypeFilters);

      // Separate seen and unseen recipes
      const unseenKeys = allKeys.filter(key => !seenRecipeKeysRef.current.has(key));
      const seenKeys = allKeys.filter(key => seenRecipeKeysRef.current.has(key));

      // Put unseen recipes first, then seen recipes at the end
      recipeKeyPoolRef.current = [...unseenKeys, ...seenKeys];

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

            setCurrentImage(newQueue[0]);
            if (newQueue.length > 1) {
              setNextImage(newQueue[1]);
            }
            setIsLoading(false);
          }

          return newQueue;
        });
      }

      // Remove fetched keys from pool
      const fetchedCount = result.images.length + result.failedKeys.length;
      recipeKeyPoolRef.current = recipeKeyPoolRef.current.slice(fetchedCount);
    } catch {
      // Refill error - handled by finally block
    } finally {
      isRefillingRef.current = false;
    }
  }, [jsonData, mealTypeFilters]);

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

      // Mark recipe as seen if exists
      if (newCurrent) {
        const recipeKey = ImageService.getRecipeKeyFromFileName(newCurrent.filename);
        seenRecipeKeysRef.current.add(recipeKey);

      }

      return newQueue;
    });
  }, []);

  // Reset queue (called on filter change)
  const resetQueue = useCallback(async () => {
    // Clean up existing queue using ref to avoid stale closure
    ImageQueueService.cleanupImages(queueRef.current);

    // Clear seen recipes tracker (new filter context)
    seenRecipeKeysRef.current.clear();

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

        // Only set pending recipe if not already set to this recipe
        // This prevents infinite loops from creating new object references
        if (!pendingRecipe || pendingRecipe.key !== key) {
          setPendingRecipeForPicker({ ...recipe, key });
        }

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
  }, [jsonData, injectRecipes, pendingRecipe, setPendingRecipeForPicker]);

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
