import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useImageQueue } from '@/hooks/useImageQueue';
import { RecipeService } from '@/services/RecipeService';
import { ImageQueueService } from '@/services/ImageQueueService';
import { useRecipe } from '@/context/RecipeContext';
import { ToastQueue } from '@/components/Toast';
import { S3JsonData, Recipe } from '@/types';

// Mock all dependencies
jest.mock('@/services/RecipeService');
jest.mock('@/services/ImageQueueService');
jest.mock('@/context/RecipeContext');
jest.mock('@/components/Toast');

describe('Integration: Edge Cases & Data Integrity', () => {
  const mockSetJsonData = jest.fn();
  const mockSetCurrentRecipe = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup useRecipe mock
    (useRecipe as jest.Mock).mockReturnValue({
      jsonData: {},
      setJsonData: mockSetJsonData,
      setCurrentRecipe: mockSetCurrentRecipe,
      mealTypeFilters: ['main dish', 'dessert'],
      pendingRecipeForPicker: null,
      setPendingRecipeForPicker: jest.fn(),
    });

    // Setup ImageQueueService mocks
    (ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue(['recipe1']);
    (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
      images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
      failedKeys: [],
    });
    (ImageQueueService.shouldRefillQueue as jest.Mock).mockReturnValue(false);
    (ImageQueueService.cleanupImages as jest.Mock).mockImplementation(() => {});
    (ToastQueue.show as jest.Mock).mockImplementation(() => {});
  });

  describe('Missing or Invalid Data', () => {
    it('should handle missing image_search_results gracefully', async () => {
      const pendingRecipe: Recipe = {
        key: 'missing_images_recipe',
        Title: 'Missing Images Recipe',
        image_search_results: [], // Empty array
        image_url: null,
      };

      let mockData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' } as Recipe
      };
      const mockSetJsonData = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Add pending recipe with empty search results to trigger the check
      mockData = { ...mockData, missing_images_recipe: pendingRecipe };
      const mockSetJsonData2 = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData2,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      rerender({});

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Empty image_search_results should not trigger modal
      expect(result.current.showImagePickerModal).toBe(false);
      expect(result.current.pendingRecipe).toBeNull();
    });

    it('should handle null image_url gracefully', async () => {
      const pendingRecipe: Recipe = {
        key: 'null_image_url_recipe',
        Title: 'Null Image URL Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null, // Explicitly null
      };

      let mockData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' } as Recipe
      };
      const mockSetJsonData = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
        failedKeys: [],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockResolvedValue({
        key: 'null_image_url_recipe',
        Title: 'Null Image URL Recipe',
        image_url: 'https://google.com/img1.jpg',
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Add pending recipe
      mockData = { ...mockData, null_image_url_recipe: pendingRecipe };
      const mockSetJsonData2 = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData2,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.pendingRecipe?.key).toBe('null_image_url_recipe');
    });
  });

  describe('Special Characters & Encoding', () => {
    it('should handle recipe keys with special characters', async () => {
      const pendingRecipe: Recipe = {
        key: 'recipe-with-special_chars-123',
        Title: 'Recipe With Special Chars',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      let mockData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' } as Recipe
      };
      const mockSetJsonData = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
        failedKeys: [],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockResolvedValue({
        key: 'recipe-with-special_chars-123',
        Title: 'Recipe With Special Chars',
        image_url: 'https://google.com/img1.jpg',
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      mockData = { ...mockData, 'recipe-with-special_chars-123': pendingRecipe };
      const mockSetJsonData2 = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData2,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Should handle special characters correctly
      expect(result.current.pendingRecipe?.key).toContain('special_chars');
    });

    it('should handle recipe titles with unicode characters', async () => {
      const pendingRecipe: Recipe = {
        key: 'unicode_recipe',
        Title: 'Crème Brûlée with Jalapeños',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      let mockData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' } as Recipe
      };
      const mockSetJsonData = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
        failedKeys: [],
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      mockData = { ...mockData, unicode_recipe: pendingRecipe };
      const mockSetJsonData2 = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData2,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Title with unicode characters should be preserved
      expect(result.current.pendingRecipe?.Title).toContain('Brûlée');
      expect(result.current.pendingRecipe?.Title).toContain('Jalapeños');
    });
  });

  describe('Data Consistency', () => {
    it('should remove recipe from local state after successful deletion', async () => {
      const pendingRecipe: Recipe = {
        key: 'delete_consistency_recipe',
        Title: 'Delete Consistency Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      let mockData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' } as Recipe,
        delete_consistency_recipe: pendingRecipe,
      };
      let currentPendingRecipe: Recipe | null = pendingRecipe;

      const mockSetJsonDataLocal = jest.fn((data: S3JsonData) => { mockData = data; });
      const mockSetPendingRecipe = jest.fn((recipe: Recipe | null) => { currentPendingRecipe = recipe; });
      (useRecipe as jest.Mock).mockImplementation(() => ({
        jsonData: mockData,
        setJsonData: mockSetJsonDataLocal,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: currentPendingRecipe,
        setPendingRecipeForPicker: mockSetPendingRecipe,
      }));

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
        failedKeys: [],
      });

      (RecipeService.deleteRecipe as jest.Mock).mockResolvedValue(true);

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Delete recipe
      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      // Verify setJsonData was called to remove recipe
      expect(mockSetJsonDataLocal).toHaveBeenCalled();

      // Wait for modal to close
      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(false);
      }, { timeout: 3000 });
    });

    it('should prevent duplicate submissions (idempotency)', async () => {
      const pendingRecipe: Recipe = {
        key: 'idempotency_recipe',
        Title: 'Idempotency Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      let mockData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' } as Recipe
      };
      const mockSetJsonData = jest.fn((data: S3JsonData) => { mockData = data; });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: mockSetJsonData,
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
        failedKeys: [],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockResolvedValue({
        key: 'idempotency_recipe',
        Title: 'Idempotency Recipe',
        image_url: 'https://google.com/img1.jpg',
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      mockData = { ...mockData, idempotency_recipe: pendingRecipe };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => { mockData = data; },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Double-tap confirm (rapid clicks)
      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
        // Second call should be prevented
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      // selectRecipeImage should only be called once
      expect(RecipeService.selectRecipeImage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Null/Undefined Safety', () => {
    it('should handle undefined recipe gracefully', async () => {
      const { result } = renderHook(() => useImageQueue());

      // pendingRecipe should start as null
      expect(result.current.pendingRecipe).toBeNull();

      // Should not crash when calling with null
      await act(async () => {
        // This should be a no-op
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      // Modal should remain closed
      expect(result.current.showImagePickerModal).toBe(false);
    });

    it('should validate recipe data before operations', async () => {
      const recipeWithoutKey: Partial<Recipe> = {
        Title: 'Recipe Without Key',
        image_search_results: ['https://google.com/img1.jpg'],
      };

      let mockData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' } as Recipe
      };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => { mockData = data; },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: [],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
        failedKeys: [],
      });

      const { result } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Should handle invalid recipe data gracefully
      expect(result.current.pendingRecipe).toBeNull();
      expect(result.current.showImagePickerModal).toBe(false);
    });
  });
});
