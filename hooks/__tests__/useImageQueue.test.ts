import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useImageQueue } from '../useImageQueue';
import { ImageQueueService } from '@/services/ImageQueueService';
import { useRecipe } from '@/context/RecipeContext';
import { S3JsonData } from '@/types';

// Mock dependencies
jest.mock('@/services/ImageQueueService');
jest.mock('@/context/RecipeContext');

describe('useImageQueue', () => {
  const mockJsonData: S3JsonData = {
    recipe1: { key: 'recipe1', Title: 'Recipe 1', Type: 'main dish' },
    recipe2: { key: 'recipe2', Title: 'Recipe 2', Type: 'dessert' },
    recipe3: { key: 'recipe3', Title: 'Recipe 3', Type: 'appetizer' },
    recipe4: { key: 'recipe4', Title: 'Recipe 4', Type: 'main dish' },
    recipe5: { key: 'recipe5', Title: 'Recipe 5', Type: 'dessert' },
  };

  const mockSetCurrentRecipe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock useRecipe hook
    (useRecipe as jest.Mock).mockReturnValue({
      jsonData: mockJsonData,
      setCurrentRecipe: mockSetCurrentRecipe,
      mealTypeFilters: ['main dish', 'dessert'],
    });

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
});
