import { useState, useEffect, useRef, useCallback } from 'react';
import { useRecipe } from '@/context/RecipeContext';
import { ImageQueueService } from '@/services/ImageQueueService';
import { ImageService } from '@/services/ImageService';
import { ImageFile } from '@/types';
import { ImageQueueHook } from '@/types/queue';

// Constants for queue injection
const MAX_QUEUE_SIZE = 30;  // Prevent memory leaks
const INJECT_RETRY_MAX = 3;
const INJECT_RETRY_DELAY = 1000;  // milliseconds

export function useImageQueue(): ImageQueueHook {
  // Local state
  const [queue, setQueue] = useState<ImageFile[]>([]);
  const [currentImage, setCurrentImage] = useState<ImageFile | null>(null);
  const [nextImage, setNextImage] = useState<ImageFile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Recipe key pool (mutable ref, doesn't trigger re-renders)
  const recipeKeyPoolRef = useRef<string[]>([]);
  const isRefillingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isInitializingRef = useRef(false);
  const queueRef = useRef<ImageFile[]>([]); // Track latest queue for cleanup
  const prevJsonDataKeysRef = useRef<Set<string>>(new Set());
  const nextImageRef = useRef<ImageFile | null>(null); // Track nextImage for injection without causing re-creation

  // Context
  const { jsonData, setCurrentRecipe, mealTypeFilters } = useRecipe();

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
      if (__DEV__) {
        console.error('Error initializing image queue:', error);
      }
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

    // If pool is empty, reshuffle to create a new pool
    if (recipeKeyPoolRef.current.length === 0 && jsonData) {
      if (__DEV__) {
        console.log('Recipe pool exhausted, reshuffling...');
      }
      recipeKeyPoolRef.current = ImageQueueService.createRecipeKeyPool(jsonData, mealTypeFilters);
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
        setQueue(prev => [...prev, ...result.images]);
      }

      // Remove fetched keys from pool
      const fetchedCount = result.images.length + result.failedKeys.length;
      recipeKeyPoolRef.current = recipeKeyPoolRef.current.slice(fetchedCount);
    } catch (error) {
      if (__DEV__) {
        console.error('Error refilling queue:', error);
      }
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

      // Update recipe in context if new current image exists
      if (newCurrent) {
        updateCurrentRecipe(newCurrent);
      }

      return newQueue;
    });
  }, [updateCurrentRecipe]);

  // Reset queue (called on filter change)
  const resetQueue = useCallback(async () => {
    // Clean up existing queue using ref to avoid stale closure
    ImageQueueService.cleanupImages(queueRef.current);

    // Clear state
    setQueue([]);
    setCurrentImage(null);
    setNextImage(null);
    setIsLoading(true);

    // Reinitialize
    await initializeQueue();
  }, [initializeQueue]);

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
        if (__DEV__) {
          console.error('Error fetching images for injection:', error);
        }
        attemptCount++;

        if (attemptCount >= INJECT_RETRY_MAX) {
          break;
        }
      }
    }

    // No images fetched
    if (fetchedImages.length === 0) {
      if (__DEV__) {
        console.log('No images fetched for injection after retries');
      }
      return;
    }

    // Update queue with functional state update (single call to avoid race conditions)
    setQueue(prev => {
      // Calculate insert position (min of 2 or queue length)
      const insertPosition = Math.min(2, prev.length);

      // Split queue
      const before = prev.slice(0, insertPosition);
      const after = prev.slice(insertPosition);

      // Combine
      let newQueue = [...before, ...fetchedImages, ...after];

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

    if (__DEV__) {
      console.log(`Successfully injected ${fetchedImages.length} recipes into queue`);
    }
  }, []); // Empty deps - all state reads use refs or functional updates

  // Effect: Initialize queue on mount
  useEffect(() => {
    isMountedRef.current = true;

    if (jsonData && queue.length === 0 && !isLoading) {
      initializeQueue();
    }

    // Cleanup on unmount - use queueRef to avoid stale closure
    return () => {
      isMountedRef.current = false;
      ImageQueueService.cleanupImages(queueRef.current);
    };
  }, [jsonData]); // Only run when jsonData is available

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

    // If new keys found, inject them
    if (newKeys.length > 0) {
      if (__DEV__) {
        console.log(`Detected ${newKeys.length} new recipes, injecting into queue`);
      }
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
  };
}
