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

describe('Integration: Error Scenario Testing', () => {
  const mockSetJsonData = jest.fn();
  const mockSetCurrentRecipe = jest.fn();

  // Helper function to set up a test scenario
  const setupTest = () => {
    let mockData: S3JsonData = {
      recipe1: { Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' },
    };

    (useRecipe as jest.Mock).mockReturnValue({
      jsonData: mockData,
      setJsonData: (data: S3JsonData) => {
        mockData = data;
      },
      setCurrentRecipe: mockSetCurrentRecipe,
      mealTypeFilters: ['main dish', 'dessert'],
    });

    (ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue(['recipe1']);
    (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
      images: [{ filename: 'images/recipe1.jpg', file: 'blob:1' }],
      failedKeys: [],
    });
    (ImageQueueService.shouldRefillQueue as jest.Mock).mockReturnValue(false);
    (ImageQueueService.cleanupImages as jest.Mock).mockImplementation(() => {});
    (ToastQueue.show as jest.Mock).mockImplementation(() => {});

    return { mockData, setMockData: (data: S3JsonData) => { mockData = data; }, getMockData: () => mockData };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Network Errors', () => {
    it('should handle network timeout gracefully during image selection', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Add pending recipe
      const pendingRecipe: Recipe = {
        key: 'timeout_recipe',
        Title: 'Timeout Test Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, timeout_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, timeout_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Request timeout')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save image')
      );
      expect(result.current.showImagePickerModal).toBe(true);
      expect(result.current.pendingRecipe).toBeTruthy();
    });

    it('should handle network timeout during recipe deletion', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'delete_timeout_recipe',
        Title: 'Delete Timeout Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, delete_timeout_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, delete_timeout_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.deleteRecipe as jest.Mock).mockRejectedValue(
        new Error('Request timeout')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete recipe')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });
  });

  describe('Backend Error Responses', () => {
    it('should handle 404 Recipe not found during image selection', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'missing_recipe',
        Title: 'Missing Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, missing_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, missing_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Recipe not found')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Recipe not found')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });

    it('should handle 400 Invalid image URL error', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'invalid_url_recipe',
        Title: 'Invalid URL Recipe',
        image_search_results: ['https://invalid.example.com/img.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, invalid_url_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, invalid_url_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Invalid image URL')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onConfirmImage('https://invalid.example.com/img.jpg');
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Invalid image URL')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });

    it('should handle 500 Server error during image selection', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'server_error_recipe',
        Title: 'Server Error Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, server_error_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, server_error_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Failed to select image. Status: 500')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save image')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });

    it('should handle 404 Recipe not found during deletion', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'delete_missing_recipe',
        Title: 'Delete Missing Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, delete_missing_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, delete_missing_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.deleteRecipe as jest.Mock).mockRejectedValue(
        new Error('Recipe not found')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Recipe not found')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });
  });

  describe('Malformed Response Handling', () => {
    it('should handle error responses from backend gracefully', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'malformed_recipe',
        Title: 'Malformed Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, malformed_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, malformed_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Failed to fetch image from Google')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save image')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });
  });

  describe('Race Conditions', () => {
    it('should handle recipe already deleted scenario during selection', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'race_condition_recipe',
        Title: 'Race Condition Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, race_condition_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, race_condition_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Recipe not found')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Simulate recipe being deleted elsewhere (mock updated)
      setMockData({ ...mockData });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Recipe not found')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });
  });

  describe('Offline Scenarios', () => {
    it('should handle offline network during image selection', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'offline_recipe',
        Title: 'Offline Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, offline_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, offline_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Network request failed')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save image')
      );
      expect(result.current.showImagePickerModal).toBe(true);
      expect(result.current.pendingRecipe).toBeTruthy();
    });

    it('should handle offline network during deletion', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'offline_delete_recipe',
        Title: 'Offline Delete Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, offline_delete_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, offline_delete_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.deleteRecipe as jest.Mock).mockRejectedValue(
        new Error('Network request failed')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      expect(ToastQueue.show).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete recipe')
      );
      expect(result.current.showImagePickerModal).toBe(true);
    });
  });

  describe('State Management', () => {
    it('should keep modal open after error occurs', async () => {
      const { mockData, setMockData } = setupTest();

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      const pendingRecipe: Recipe = {
        key: 'state_test_recipe',
        Title: 'State Test Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      setMockData({ ...mockData, state_test_recipe: pendingRecipe });
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: { ...mockData, state_test_recipe: pendingRecipe },
        setJsonData: (data: S3JsonData) => setMockData(data),
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
      });

      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(
        new Error('Test error')
      );

      rerender();

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      // Modal should remain open for retry
      expect(result.current.showImagePickerModal).toBe(true);
      expect(result.current.pendingRecipe).toBeTruthy();
    });
  });
});
