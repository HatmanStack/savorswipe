import { useState, useEffect, useRef, useCallback } from 'react';
import { ImageQueueService } from '@/services/ImageQueueService';
import { ImageService } from '@/services/ImageService';
import { ImageFile, Recipe, S3JsonData, MealType } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface UseQueueStateOptions {
  jsonData: S3JsonData | null;
  mealTypeFilters: MealType[];
  setCurrentRecipe: (recipe: Recipe | null) => void;
}

export interface QueueStateReturn {
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

// ============================================================================
// Hook
// ============================================================================

export function useQueueState({
  jsonData,
  mealTypeFilters,
  setCurrentRecipe,
}: UseQueueStateOptions): QueueStateReturn {
  // State
  const [queue, setQueue] = useState<ImageFile[]>([]);
  const [currentImage, setCurrentImage] = useState<ImageFile | null>(null);
  const [nextImage, setNextImage] = useState<ImageFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs
  const recipeKeyPoolRef = useRef<string[]>([]);
  const isRefillingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isInitializingRef = useRef(false);
  const initializingGenerationRef = useRef(0);
  const queueRef = useRef<ImageFile[]>([]);
  const nextImageRef = useRef<ImageFile | null>(null);
  const lastInjectionTimeRef = useRef<number>(0);
  const seenRecipeKeysRef = useRef<Set<string>>(new Set());
  const generationRef = useRef(0);

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
    } else {
      setCurrentRecipe(null);
    }
  }, [currentImage, updateCurrentRecipe, setCurrentRecipe]);

  // Initialize queue on first load
  const initializeQueue = useCallback(async () => {
    if (!jsonData) return;

    const currentGeneration = ++generationRef.current;

    // Prevent double initialization, but allow newer generations to proceed
    if (isInitializingRef.current && currentGeneration <= initializingGenerationRef.current) return;

    isInitializingRef.current = true;
    initializingGenerationRef.current = currentGeneration;
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

      // Bail if generation changed (stale async result)
      if (generationRef.current !== currentGeneration || !isMountedRef.current) return;

      // Combine all successfully fetched images
      const allImages = [...batch1.images, ...batch2.images, ...batch3.images];

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
    } catch (error) {
      console.error('[ImageQueue] Queue initialization failed:', error);
    } finally {
      isInitializingRef.current = false;
      if (isMountedRef.current && generationRef.current === currentGeneration) {
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

    // If pool is empty, reshuffle to create a new pool
    if (recipeKeyPoolRef.current.length === 0 && jsonData) {
      // Create new shuffled pool
      const allKeys = ImageQueueService.createRecipeKeyPool(jsonData, mealTypeFilters);

      // Exclude keys already in the queue to avoid duplicates
      const queuedKeys = new Set(
        queueRef.current.map(img => ImageService.getRecipeKeyFromFileName(img.filename))
      );

      // Separate seen and unseen recipes, excluding already-queued keys
      const unseenKeys = allKeys.filter(key => !seenRecipeKeysRef.current.has(key) && !queuedKeys.has(key));
      const seenKeys = allKeys.filter(key => seenRecipeKeysRef.current.has(key) && !queuedKeys.has(key));

      // Put unseen recipes first, then seen recipes at the end
      recipeKeyPoolRef.current = [...unseenKeys, ...seenKeys];
    }

    // If still no keys available (no recipes match filters), return
    if (recipeKeyPoolRef.current.length === 0) {
      return;
    }

    isRefillingRef.current = true;
    const currentGeneration = generationRef.current;

    try {
      const result = await ImageQueueService.fetchBatch(
        recipeKeyPoolRef.current,
        ImageQueueService.CONFIG.BATCH_SIZE
      );

      // Bail if generation changed or unmounted (stale async result)
      if (!isMountedRef.current || generationRef.current !== currentGeneration) return;

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
    } catch (error) {
      console.warn('[ImageQueue] Queue refill failed:', error);
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

      // Mark the consumed (swiped) card as seen, not the new current
      if (prev[0]) {
        const recipeKey = ImageService.getRecipeKeyFromFileName(prev[0].filename);
        seenRecipeKeysRef.current.add(recipeKey);
      }

      return newQueue;
    });
  }, []);

  // Reset queue (called on filter change)
  const resetQueue = useCallback(async () => {
    // Increment generation to invalidate any in-flight async operations
    generationRef.current++;

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

    // Always reset when filters change so in-flight initializations
    // don't apply results for previous filters
    resetQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetQueue is memoized
    // and stable. jsonData is intentionally excluded: it arrives once on mount before
    // filters ever change, so including it would cause unnecessary double-resets.
  }, [mealTypeFilters]);

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
    queue,
    currentImage,
    nextImage,
    isLoading,
    queueLength: queue.length,
    advanceQueue,
    resetQueue,
    setQueue,
    setCurrentImage,
    setNextImage,
    setIsLoading,
    recipeKeyPoolRef,
    lastInjectionTimeRef,
    nextImageRef,
  };
}
