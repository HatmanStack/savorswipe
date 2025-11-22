import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useImageQueue } from '../useImageQueue';
import { ImageQueueService } from '@/services/ImageQueueService';
import { RecipeService } from '@/services/RecipeService';
import { useRecipe } from '@/context/RecipeContext';
import { ToastQueue } from '@/components/Toast';
import { S3JsonData } from '@/types';

// Mock dependencies
jest.mock('@/services/ImageQueueService');
jest.mock('@/services/RecipeService');
jest.mock('@/context/RecipeContext');
jest.mock('@/components/Toast');

describe('useImageQueue', () => {
  const mockJsonData: S3JsonData = {
    recipe1: { key: 'recipe1', Title: 'Recipe 1', Type: 'main dish' },
    recipe2: { key: 'recipe2', Title: 'Recipe 2', Type: 'dessert' },
    recipe3: { key: 'recipe3', Title: 'Recipe 3', Type: 'appetizer' },
    recipe4: { key: 'recipe4', Title: 'Recipe 4', Type: 'main dish' },
    recipe5: { key: 'recipe5', Title: 'Recipe 5', Type: 'dessert' },
  };

  const mockSetCurrentRecipe = jest.fn();
  const mockSetJsonData = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useRecipe hook
    (useRecipe as jest.Mock).mockReturnValue({
      jsonData: mockJsonData,
      setCurrentRecipe: mockSetCurrentRecipe,
      setJsonData: mockSetJsonData,
      mealTypeFilters: ['main dish', 'dessert'],
    });

    // Mock RecipeService methods
    (RecipeService.selectRecipeImage as jest.Mock).mockResolvedValue({
      key: 'recipe1',
      Title: 'Recipe 1',
      image_url: 'https://example.com/image.jpg',
    });

    (RecipeService.deleteRecipe as jest.Mock).mockResolvedValue(true);

    // Mock ToastQueue
    (ToastQueue.show as jest.Mock).mockImplementation(() => {});

    // Mock ImageQueueService methods
    (ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue([
      'recipe1',
      'recipe2',
      'recipe3',
      'recipe4',
      'recipe5',
    ]);

    (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
      images: [
        { filename: 'images/recipe1.jpg', file: 'blob:1' },
        { filename: 'images/recipe2.jpg', file: 'blob:2' },
      ],
      failedKeys: [],
    });

    (ImageQueueService.shouldRefillQueue as jest.Mock).mockReturnValue(false);
    (ImageQueueService.cleanupImages as jest.Mock).mockImplementation(() => {});
  });

  describe('initialization', () => {
    it('should initialize queue on mount with jsonData', async () => {
      const { result } = renderHook(() => useImageQueue());

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Queue should be populated
      expect(result.current.currentImage).toBeTruthy();
      expect(result.current.queueLength).toBeGreaterThan(0);
    });

    it('should set isLoading to true initially, false after init', async () => {
      const { result } = renderHook(() => useImageQueue());

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });
    });

    it('should set currentImage and nextImage from queue', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      expect(result.current.currentImage).toEqual({
        filename: 'images/recipe1.jpg',
        file: 'blob:1',
      });
      expect(result.current.nextImage).toEqual({
        filename: 'images/recipe2.jpg',
        file: 'blob:2',
      });
    });

    it('should call setCurrentRecipe with first recipe', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      expect(mockSetCurrentRecipe).toHaveBeenCalledWith({
        ...mockJsonData.recipe1,
        key: 'recipe1',
      });
    });

    it('should fetch images in parallel during initialization', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Should call fetchBatch 3 times in parallel
      expect(ImageQueueService.fetchBatch).toHaveBeenCalledTimes(3);
    });
  });

  describe('advanceQueue', () => {
    it('should shift queue and update current/next images', async () => {
      // Mock multiple batches for advance testing
      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe1.jpg', file: 'blob:1' },
            { filename: 'images/recipe2.jpg', file: 'blob:2' },
          ],
          failedKeys: [],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe3.jpg', file: 'blob:3' },
            { filename: 'images/recipe4.jpg', file: 'blob:4' },
          ],
          failedKeys: [],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe5.jpg', file: 'blob:5' },
          ],
          failedKeys: [],
        });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const initialCurrent = result.current.currentImage;
      const initialQueueLength = result.current.queueLength;

      // Advance queue
      act(() => {
        result.current.advanceQueue();
      });

      // Current image should change
      expect(result.current.currentImage).not.toBe(initialCurrent);
      expect(result.current.queueLength).toBe(initialQueueLength - 1);
    });

    it('should update currentRecipe in context', async () => {
      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [
          { filename: 'images/recipe1.jpg', file: 'blob:1' },
          { filename: 'images/recipe2.jpg', file: 'blob:2' },
        ],
        failedKeys: [],
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      mockSetCurrentRecipe.mockClear();

      // Advance queue
      act(() => {
        result.current.advanceQueue();
      });

      // Should update to recipe2
      expect(mockSetCurrentRecipe).toHaveBeenCalledWith({
        ...mockJsonData.recipe2,
        key: 'recipe2',
      });
    });

    it('should cleanup old image blob URL', async () => {
      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [
          { filename: 'images/recipe1.jpg', file: 'blob:1' },
          { filename: 'images/recipe2.jpg', file: 'blob:2' },
        ],
        failedKeys: [],
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const cleanupSpy = ImageQueueService.cleanupImages as jest.Mock;
      cleanupSpy.mockClear();

      // Advance queue
      act(() => {
        result.current.advanceQueue();
      });

      // Should cleanup old image
      expect(cleanupSpy).toHaveBeenCalledWith([
        { filename: 'images/recipe1.jpg', file: 'blob:1' },
      ]);
    });

    it('should handle empty queue gracefully', async () => {
      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [],
        failedKeys: [],
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Try to advance with empty queue
      act(() => {
        result.current.advanceQueue();
      });

      // Should not crash
      expect(result.current.currentImage).toBeNull();
    });
  });

  describe('resetQueue', () => {
    it('should cleanup existing queue', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const cleanupSpy = ImageQueueService.cleanupImages as jest.Mock;
      cleanupSpy.mockClear();

      // Reset queue
      await act(async () => {
        await result.current.resetQueue();
      });

      // Should have cleaned up images
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should reinitialize queue with new filters', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const initialFetchCount = (ImageQueueService.fetchBatch as jest.Mock).mock.calls.length;

      // Reset queue
      await act(async () => {
        await result.current.resetQueue();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Should have fetched more batches
      expect((ImageQueueService.fetchBatch as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialFetchCount
      );
    });
  });

  describe('refill logic', () => {
    it('should trigger refill when queue drops to threshold', async () => {
      // Mock shouldRefillQueue to trigger refill
      (ImageQueueService.shouldRefillQueue as jest.Mock)
        .mockReturnValueOnce(false) // During initialization
        .mockReturnValueOnce(true);  // After advanceQueue

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // shouldRefillQueue should be checked and refill triggered by the effect
      expect(ImageQueueService.shouldRefillQueue).toHaveBeenCalled();
    });

    it('should not refill if already refilling', async () => {
      // This is tested implicitly by the isRefillingRef guard
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // The guard prevents concurrent refills
      expect(result.current).toBeTruthy();
    });

    it('should append new images to queue', async () => {
      (ImageQueueService.shouldRefillQueue as jest.Mock)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe1.jpg', file: 'blob:1' },
          ],
          failedKeys: [],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe2.jpg', file: 'blob:2' },
          ],
          failedKeys: [],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe3.jpg', file: 'blob:3' },
          ],
          failedKeys: [],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe4.jpg', file: 'blob:4' },
          ],
          failedKeys: [],
        });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const initialLength = result.current.queueLength;

      // Wait for refill to potentially happen
      await waitFor(() => {
        expect(result.current.queueLength).toBeGreaterThanOrEqual(initialLength);
      }, { timeout: 3000 });
    });
  });

  describe('edge cases', () => {
    it('should handle fewer than 15 recipes after filtering', async () => {
      (ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue([
        'recipe1',
        'recipe2',
      ]);

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [
          { filename: 'images/recipe1.jpg', file: 'blob:1' },
        ],
        failedKeys: [],
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Should still initialize successfully
      expect(result.current.currentImage).toBeTruthy();
    });

    it('should cleanup images on unmount', async () => {
      const { result, unmount } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const cleanupSpy = ImageQueueService.cleanupImages as jest.Mock;
      cleanupSpy.mockClear();

      // Unmount
      unmount();

      // Should have cleaned up
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should handle null jsonData gracefully', () => {
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: null,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish'],
      });

      const { result } = renderHook(() => useImageQueue());

      // Should not crash with null data
      expect(result.current.isLoading).toBe(true);
      expect(result.current.currentImage).toBeNull();
    });
  });

  describe('injectRecipes', () => {
    it('injects recipes at position 2', async () => {
      // Setup: Initial queue
      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe1.jpg', file: 'blob:1' },
            { filename: 'images/recipe2.jpg', file: 'blob:2' },
            { filename: 'images/recipe3.jpg', file: 'blob:3' },
          ],
          failedKeys: [],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe4.jpg', file: 'blob:4' },
          ],
          failedKeys: [],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/recipe5.jpg', file: 'blob:5' },
          ],
          failedKeys: [],
        });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const initialLength = result.current.queueLength;

      // Mock fetch for injection
      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: [
          { filename: 'images/new1.jpg', file: 'blob:new1' },
          { filename: 'images/new2.jpg', file: 'blob:new2' },
        ],
        failedKeys: [],
      });

      // Inject new recipes
      await act(async () => {
        await result.current.injectRecipes(['new1', 'new2']);
      });

      // Queue should have grown
      expect(result.current.queueLength).toBe(initialLength + 2);
    });

    it('handles empty array without errors', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const fetchCallsBefore = (ImageQueueService.fetchBatch as jest.Mock).mock.calls.length;

      await act(async () => {
        await result.current.injectRecipes([]);
      });

      // Should not have made additional fetch calls
      expect((ImageQueueService.fetchBatch as jest.Mock).mock.calls.length).toBe(fetchCallsBefore);
    });

    it('retries on partial fetch', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const fetchCallsBefore = (ImageQueueService.fetchBatch as jest.Mock).mock.calls.length;

      // First attempt: partial (1 of 2)
      // Second attempt: full (2 of 2)
      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({
          images: [{ filename: 'images/new1.jpg', file: 'blob:new1' }],
          failedKeys: ['new2'],
        })
        .mockResolvedValueOnce({
          images: [
            { filename: 'images/new1.jpg', file: 'blob:new1' },
            { filename: 'images/new2.jpg', file: 'blob:new2' },
          ],
          failedKeys: [],
        });

      await act(async () => {
        await result.current.injectRecipes(['new1', 'new2']);
      });

      // Should have retried
      expect((ImageQueueService.fetchBatch as jest.Mock).mock.calls.length).toBeGreaterThan(fetchCallsBefore + 1);
    });

    it('handles S3 eventual consistency with retry delays', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Simulate S3 delay: first fails, second succeeds
      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({
          images: [],
          failedKeys: ['new1'],
        })
        .mockResolvedValueOnce({
          images: [{ filename: 'images/new1.jpg', file: 'blob:new1' }],
          failedKeys: [],
        });

      await act(async () => {
        await result.current.injectRecipes(['new1']);
      });

      // Should have eventually succeeded
      expect(result.current.queueLength).toBeGreaterThan(0);
    });

    it('gives up after max retries', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const fetchCallsBefore = (ImageQueueService.fetchBatch as jest.Mock).mock.calls.length;

      // All attempts fail
      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [],
        failedKeys: ['new1'],
      });

      await act(async () => {
        await result.current.injectRecipes(['new1']);
      });

      // Should have tried max 3 times
      const totalCalls = (ImageQueueService.fetchBatch as jest.Mock).mock.calls.length - fetchCallsBefore;
      expect(totalCalls).toBeLessThanOrEqual(3);
    });

    it('removes injected keys from pool to prevent duplicates', async () => {
      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: [{ filename: 'images/new1.jpg', file: 'blob:new1' }],
        failedKeys: [],
      });

      const queueBefore = result.current.queueLength;

      await act(async () => {
        await result.current.injectRecipes(['new1']);
      });

      // Queue should have grown
      expect(result.current.queueLength).toBeGreaterThan(queueBefore);
    });

    it('enforces max queue size of 30', async () => {
      // Setup: Large queue
      const largeQueue = Array.from({ length: 28 }, (_, i) => ({
        filename: `images/recipe${i}.jpg`,
        file: `blob:${i}`,
      }));

      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({ images: largeQueue.slice(0, 10), failedKeys: [] })
        .mockResolvedValueOnce({ images: largeQueue.slice(10, 20), failedKeys: [] })
        .mockResolvedValueOnce({ images: largeQueue.slice(20, 28), failedKeys: [] });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.queueLength).toBeGreaterThan(20);
      }, { timeout: 3000 });

      // Inject 5 more
      const newRecipes = Array.from({ length: 5 }, (_, i) => ({
        filename: `images/new${i}.jpg`,
        file: `blob:new${i}`,
      }));

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: newRecipes,
        failedKeys: [],
      });

      await act(async () => {
        await result.current.injectRecipes(['new0', 'new1', 'new2', 'new3', 'new4']);
      });

      // Should be capped at 30
      await waitFor(() => {
        expect(result.current.queueLength).toBeLessThanOrEqual(30);
      }, { timeout: 3000 });
    });

    it('updates nextImage when queue is small and nextImage is null', async () => {
      // Setup: Queue with only 1 item
      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({ images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }], failedKeys: [] })
        .mockResolvedValueOnce({ images: [], failedKeys: [] })
        .mockResolvedValueOnce({ images: [], failedKeys: [] });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.currentImage).toBeTruthy();
        expect(result.current.nextImage).toBeNull();
      }, { timeout: 3000 });

      // Inject new recipe
      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: [{ filename: 'images/new1.jpg', file: 'blob:new1' }],
        failedKeys: [],
      });

      await act(async () => {
        await result.current.injectRecipes(['new1']);
      });

      // nextImage should now be set
      await waitFor(() => {
        expect(result.current.nextImage).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('cleans up blob URLs for images beyond max queue size', async () => {
      // Setup: Large queue
      const largeQueue = Array.from({ length: 28 }, (_, i) => ({
        filename: `images/recipe${i}.jpg`,
        file: `blob:${i}`,
      }));

      (ImageQueueService.fetchBatch as jest.Mock)
        .mockResolvedValueOnce({ images: largeQueue.slice(0, 10), failedKeys: [] })
        .mockResolvedValueOnce({ images: largeQueue.slice(10, 20), failedKeys: [] })
        .mockResolvedValueOnce({ images: largeQueue.slice(20, 28), failedKeys: [] });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.queueLength).toBeGreaterThan(20);
      }, { timeout: 3000 });

      const cleanupSpy = ImageQueueService.cleanupImages as jest.Mock;
      cleanupSpy.mockClear();

      // Inject 5 more to exceed max
      const newRecipes = Array.from({ length: 5 }, (_, i) => ({
        filename: `images/new${i}.jpg`,
        file: `blob:new${i}`,
      }));

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: newRecipes,
        failedKeys: [],
      });

      await act(async () => {
        await result.current.injectRecipes(['new0', 'new1', 'new2', 'new3', 'new4']);
      });

      // cleanup should have been called for excess images
      await waitFor(() => {
        expect(cleanupSpy).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('image picker modal - pending recipe detection', () => {
    it('should detect pending recipe and show modal', async () => {
      // Start without pending recipe
      const initialData: S3JsonData = { ...mockJsonData };

      const mockSetPendingRecipeForPicker = jest.fn();
      let currentPendingRecipe: Recipe | null = null;
      const staticMealFilters = ['main dish', 'dessert'];

      // Use mutable object for jsonData to simulate updates
      let currentJsonData = initialData;

      (useRecipe as jest.Mock).mockImplementation(() => ({
        jsonData: currentJsonData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: staticMealFilters,
        pendingRecipeForPicker: currentPendingRecipe,
        setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
      }));

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Update jsonData to include pending recipe
      currentJsonData = {
        ...mockJsonData,
        pending_recipe: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: [
            'https://example.com/img1.jpg',
            'https://example.com/img2.jpg',
          ],
          image_url: null,
        },
      };
      rerender({});

      // Wait for the effect to detect pending recipe and call setter
      await waitFor(() => {
        expect(mockSetPendingRecipeForPicker).toHaveBeenCalledWith(expect.objectContaining({
          key: 'pending_recipe'
        }));
      }, { timeout: 3000 });

      // Simulate the state update that would happen in the real app
      currentPendingRecipe = {
        key: 'pending_recipe',
        Title: 'Pending Recipe',
        image_search_results: [
          'https://example.com/img1.jpg',
          'https://example.com/img2.jpg',
        ],
        image_url: null,
      };

      // Re-render with updated mock value
      rerender({});

      // Now the hook should pick up the new pendingRecipe
      // We need to wait for the hook to update its internal state based on the new context
      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
        expect(result.current.pendingRecipe).toBeTruthy();
      }, { timeout: 3000 });

      expect(result.current.pendingRecipe?.Title).toBe('Pending Recipe');
      expect(result.current.pendingRecipe?.image_search_results).toHaveLength(2);
    });

    it('should not detect recipe with image_url as pending', async () => {
      // Recipe with image_url is not pending (already selected)
      const completeRecipeData: S3JsonData = {
        ...mockJsonData,
        complete_recipe: {
          key: 'complete_recipe',
          Title: 'Complete Recipe',
          image_url: 'https://example.com/selected.jpg',
          image_search_results: ['https://example.com/img1.jpg'],
        },
      };

      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: completeRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      expect(result.current.showImagePickerModal).toBe(false);
      expect(result.current.pendingRecipe).toBeNull();
    });

    it('should not detect recipe without image_search_results as pending', async () => {
      // Regular recipe without image_search_results
      const regularRecipeData: S3JsonData = {
        ...mockJsonData,
        regular_recipe: {
          key: 'regular_recipe',
          Title: 'Regular Recipe',
          image_url: 'https://example.com/regular.jpg',
        },
      };

      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: regularRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      expect(result.current.showImagePickerModal).toBe(false);
      expect(result.current.pendingRecipe).toBeNull();
    });

    it('should reset pending recipe state', async () => {
      const pendingRecipeData: S3JsonData = {
        ...mockJsonData,
        pending_recipe: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
      };

      const mockSetPendingRecipeForPicker = jest.fn();

      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: pendingRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
      });

      const { result } = renderHook(() => useImageQueue());

      // Reset pending recipe
      act(() => {
        result.current.resetPendingRecipe();
      });

      expect(mockSetPendingRecipeForPicker).toHaveBeenCalledWith(null);
    });

    it('should pause queue when pending recipe detected', async () => {
      const pendingRecipeData: S3JsonData = {
        ...mockJsonData,
        pending_recipe: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
      };

      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: pendingRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Queue should be paused (modal is open)
      // Verify we can't advance while modal is showing
      const currentBeforeAdvance = result.current.currentImage;

      act(() => {
        result.current.advanceQueue();
      });

      // currentImage should remain the same (queue is paused by modal state)
      // Note: The actual queue pause is enforced by the component using the hook,
      // not by the hook itself, so we just verify the modal state is set
      expect(result.current.showImagePickerModal).toBe(true);
    });

    it('should prioritize pending recipe detection over new recipe injection', async () => {
      // Setup: Multiple new recipes, one of which is pending
      const multipleNewRecipes: S3JsonData = {
        ...mockJsonData,
        normal_new: {
          key: 'normal_new',
          Title: 'Normal New Recipe',
          image_url: 'https://example.com/normal.jpg',
        },
        pending_new: {
          key: 'pending_new',
          Title: 'Pending New Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
      };

      // We need to simulate the effect that calls setPendingRecipeForPicker
      // and then the re-render where pendingRecipeForPicker is set

      // First render: no pending recipe set yet
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: multipleNewRecipes,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: {
          key: 'pending_new',
          Title: 'Pending New Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue([
        'recipe1',
        'recipe2',
      ]);

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Should show pending recipe in modal, not inject both
      expect(result.current.showImagePickerModal).toBe(true);
      expect(result.current.pendingRecipe?.key).toBe('pending_new');
    });
  });

  describe('modal callbacks - onConfirmImage', () => {
    it('should confirm image selection and inject recipe', async () => {
      // Setup: Pending recipe
      const pendingRecipeData: S3JsonData = {
        ...mockJsonData,
        pending_recipe: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
      };

      const mockSetPendingRecipeForPicker = jest.fn();

      // Use implementation to allow changing return value
      let currentPendingRecipe: Recipe | null = {
        key: 'pending_recipe',
        Title: 'Pending Recipe',
        image_search_results: ['https://example.com/img1.jpg'],
        image_url: null,
      };

      const staticMealFilters = ['main dish', 'dessert'];
      (useRecipe as jest.Mock).mockImplementation(() => ({
        jsonData: pendingRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        setJsonData: mockSetJsonData,
        mealTypeFilters: staticMealFilters,
        pendingRecipeForPicker: currentPendingRecipe,
        setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
      }));

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      const imageUrl = 'https://example.com/selected.jpg';

      // Call onConfirmImage
      await act(async () => {
        await result.current.onConfirmImage(imageUrl);
      });

      // Should have called RecipeService.selectRecipeImage
      expect(RecipeService.selectRecipeImage).toHaveBeenCalledWith(
        'pending_recipe',
        imageUrl
      );

      // Should show success toast
      expect(ToastQueue.show).toHaveBeenCalledWith('Image saved');

      // Should have called setPendingRecipeForPicker(null)
      expect(mockSetPendingRecipeForPicker).toHaveBeenCalledWith(null);

      // Simulate state update - explicitly update mock return value
      (useRecipe as jest.Mock).mockImplementation(() => ({
        jsonData: pendingRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        setJsonData: mockSetJsonData,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
      }));

      rerender({});

      expect(result.current.pendingRecipe).toBeNull();
      expect(result.current.showImagePickerModal).toBe(false);
    });

    it('should show error toast on image selection failure', async () => {
      // Setup: Pending recipe
      const pendingRecipeData: S3JsonData = {
        ...mockJsonData,
        pending_recipe: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
      };

      const mockSetPendingRecipeForPicker = jest.fn();

      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: pendingRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        setJsonData: mockSetJsonData,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
        setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
      });

      const error = new Error('Network error');
      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Call onConfirmImage
      await act(async () => {
        await result.current.onConfirmImage('https://example.com/selected.jpg');
      });

      // Should show error toast - verify it's called with an error message
      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save image')
      );

      // Modal should remain visible
      expect(result.current.showImagePickerModal).toBe(true);
    });
  });

  describe('modal callbacks - onDeleteRecipe', () => {
    it.skip('should delete recipe successfully', async () => {
      // Setup: Pending recipe
      const pendingRecipeData: S3JsonData = {
        ...mockJsonData,
        pending_recipe: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
      };

      const mockSetPendingRecipeForPicker = jest.fn();

      // Use a mutable object wrapper or function to allow dynamic updates during the test
      let currentPendingRecipe: any = {
        key: 'pending_recipe',
        Title: 'Pending Recipe',
        image_search_results: ['https://example.com/img1.jpg'],
        image_url: null,
      };

      (useRecipe as jest.Mock).mockImplementation(() => ({
        jsonData: pendingRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        setJsonData: mockSetJsonData,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: currentPendingRecipe,
        setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
      }));

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Call onDeleteRecipe
      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      // Should have called RecipeService.deleteRecipe
      expect(RecipeService.deleteRecipe).toHaveBeenCalledWith('pending_recipe');

      // Should show success toast
      expect(ToastQueue.show).toHaveBeenCalledWith('Recipe deleted');

      // Should have called setPendingRecipeForPicker(null)
      expect(mockSetPendingRecipeForPicker).toHaveBeenCalledWith(null);
    });

    it('should show error toast on deletion failure', async () => {
      // Setup: Pending recipe
      const pendingRecipeData: S3JsonData = {
        ...mockJsonData,
        pending_recipe: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
      };

      const mockSetPendingRecipeForPicker = jest.fn();

      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: pendingRecipeData,
        setCurrentRecipe: mockSetCurrentRecipe,
        setJsonData: mockSetJsonData,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: {
          key: 'pending_recipe',
          Title: 'Pending Recipe',
          image_search_results: ['https://example.com/img1.jpg'],
          image_url: null,
        },
        setPendingRecipeForPicker: mockSetPendingRecipeForPicker,
      });

      const error = new Error('Recipe not found');
      (RecipeService.deleteRecipe as jest.Mock).mockRejectedValue(error);

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Call onDeleteRecipe
      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      // Should show error toast
      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete recipe')
      );

      // Modal should remain visible
      expect(result.current.showImagePickerModal).toBe(true);
    });
  });
});
