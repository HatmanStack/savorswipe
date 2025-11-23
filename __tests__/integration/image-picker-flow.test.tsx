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

describe('Integration: Image Picker Modal Flow', () => {
  jest.setTimeout(30000); // Increase timeout for all tests in this file

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
    (ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue([
      'recipe1',
      'recipe2',
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

    // Setup RecipeService mocks
    (RecipeService.selectRecipeImage as jest.Mock).mockResolvedValue({
      key: 'pending_recipe',
      Title: 'Pending Recipe',
      image_url: 'https://example.com/selected.jpg',
    });

    (RecipeService.deleteRecipe as jest.Mock).mockResolvedValue(true);

    // Setup ToastQueue mock
    (ToastQueue.show as jest.Mock).mockImplementation(() => {});
  });

  describe('Scenario 1: Upload recipe -> modal appears -> select image -> recipe injected', () => {
    it('should show modal, handle image selection, and inject recipe into queue', async () => {
      // Setup: Initial state with normal recipes
      const initialData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' },
        recipe2: { key: 'recipe2', Title: 'Recipe 2', image_url: 'https://s3.../recipe2.jpg' },
      };

      let mockData = { ...initialData };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      // Wait for initial queue load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Step 1: Recipe with pending image selection is added to jsonData
      const pendingRecipe: Recipe = {
        key: 'pending_recipe',
        Title: 'Pending Recipe',
        image_search_results: [
          'https://google.com/img1.jpg',
          'https://google.com/img2.jpg',
          'https://google.com/img3.jpg',
        ],
        image_url: null,
      };

      mockData = { ...mockData, pending_recipe: pendingRecipe };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      // Trigger re-render to detect new pending recipe
      rerender({});

      // Wait for modal to appear
      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.pendingRecipe?.key).toBe('pending_recipe');
      expect(result.current.pendingRecipe?.image_search_results).toHaveLength(3);

      // Step 2: User selects an image
      const selectedImageUrl = 'https://google.com/img2.jpg';

      await act(async () => {
        await result.current.onConfirmImage(selectedImageUrl);
      });

      // Verify backend calls
      expect(RecipeService.selectRecipeImage).toHaveBeenCalledWith(
        'pending_recipe',
        selectedImageUrl
      );

      // Verify success toast
      expect(ToastQueue.show).toHaveBeenCalledWith('Image saved');

      // Manually update the mock since useRecipe mock is static
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: null, // Recipe processed
        setPendingRecipeForPicker: jest.fn(),
      });
      rerender({});

      // Wait for modal to close
      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(false);
      }, { timeout: 3000 });
      expect(result.current.pendingRecipe).toBeNull();
    });

    it('should inject recipe at position 2 in queue', async () => {
      // Setup existing queue
      const existingQueue = [
        { filename: 'images/recipe1.jpg', file: 'blob:1' },
        { filename: 'images/recipe2.jpg', file: 'blob:2' },
      ];

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: existingQueue,
        failedKeys: [],
      });

      const initialData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' },
        recipe2: { key: 'recipe2', Title: 'Recipe 2', image_url: 'https://s3.../recipe2.jpg' },
      };

      let mockData = { ...initialData };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: null,
        setPendingRecipeForPicker: jest.fn(),
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      // Add pending recipe
      const pendingRecipe: Recipe = {
        key: 'pending_recipe',
        Title: 'Pending Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      mockData = { ...mockData, pending_recipe: pendingRecipe };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Mock the fetch for injected image
      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValueOnce({
        images: [{ filename: 'images/pending_recipe.jpg', file: 'blob:pending' }],
        failedKeys: [],
      });

      // Confirm image
      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      // Verify injection was called
      expect(ImageQueueService.fetchBatch).toHaveBeenCalled();
    });
  });

  describe('Scenario 2: Upload recipe -> delete -> queue continues', () => {
    it('should remove recipe and clear modal on deletion', async () => {
      // Setup with pending recipe
      const pendingRecipe: Recipe = {
        key: 'delete_test_recipe',
        Title: 'Delete Test Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      const initialData: S3JsonData = {
        recipe1: { key: 'recipe1', Title: 'Recipe 1', image_url: 'https://s3.../recipe1.jpg' },
        delete_test_recipe: pendingRecipe,
      };

      let mockData = { ...initialData };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [
          { filename: 'images/recipe1.jpg', file: 'blob:1' },
          { filename: 'images/delete_test_recipe.jpg', file: 'blob:delete' },
        ],
        failedKeys: [],
      });

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      rerender({});

      // Wait for modal
      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      expect(result.current.pendingRecipe?.key).toBe('delete_test_recipe');

      // Delete recipe
      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      // Verify deletion was called
      expect(RecipeService.deleteRecipe).toHaveBeenCalledWith('delete_test_recipe');

      // Verify success toast
      expect(ToastQueue.show).toHaveBeenCalledWith('Recipe deleted');

      // Manually update the mock since useRecipe mock is static
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: null, // Recipe processed
        setPendingRecipeForPicker: jest.fn(),
      });
      rerender({});

      // Wait for modal to close
      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(false);
      }, { timeout: 3000 });
      expect(result.current.pendingRecipe).toBeNull();
    });
  });

  describe('Scenario 3: Error handling', () => {
    it('should show error toast and keep modal open on image selection failure', async () => {
      // Setup pending recipe
      const pendingRecipe: Recipe = {
        key: 'error_test_recipe',
        Title: 'Error Test Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      const initialData: S3JsonData = {
        error_test_recipe: pendingRecipe,
      };

      let mockData = { ...initialData };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/error_test_recipe.jpg', file: 'blob:error' }],
        failedKeys: [],
      });

      // Mock service to throw error
      const error = new Error('Failed to fetch image from Google');
      (RecipeService.selectRecipeImage as jest.Mock).mockRejectedValue(error);

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Try to confirm image
      await act(async () => {
        await result.current.onConfirmImage('https://google.com/img1.jpg');
      });

      // Verify error was shown (transformed to user-friendly message)
      expect(ToastQueue.show).toHaveBeenCalledWith(
        "Failed to save image: Image couldn't be loaded from source. Please select another image."
      );

      // Modal should remain open
      expect(result.current.showImagePickerModal).toBe(true);
      expect(result.current.pendingRecipe).toBeTruthy();
    });

    it('should show error toast and keep modal open on deletion failure', async () => {
      // Setup pending recipe
      const pendingRecipe: Recipe = {
        key: 'delete_error_recipe',
        Title: 'Delete Error Recipe',
        image_search_results: ['https://google.com/img1.jpg'],
        image_url: null,
      };

      const initialData: S3JsonData = {
        delete_error_recipe: pendingRecipe,
      };

      let mockData = { ...initialData };
      (useRecipe as jest.Mock).mockReturnValue({
        jsonData: mockData,
        setJsonData: (data: S3JsonData) => {
          mockData = data;
        },
        setCurrentRecipe: mockSetCurrentRecipe,
        mealTypeFilters: ['main dish', 'dessert'],
        pendingRecipeForPicker: pendingRecipe,
        setPendingRecipeForPicker: jest.fn(),
      });

      (ImageQueueService.fetchBatch as jest.Mock).mockResolvedValue({
        images: [{ filename: 'images/delete_error_recipe.jpg', file: 'blob:error' }],
        failedKeys: [],
      });

      // Mock service to throw error
      const error = new Error('Recipe not found');
      (RecipeService.deleteRecipe as jest.Mock).mockRejectedValue(error);

      const { result, rerender } = renderHook(() => useImageQueue());

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 3000 });

      rerender({});

      await waitFor(() => {
        expect(result.current.showImagePickerModal).toBe(true);
      }, { timeout: 3000 });

      // Try to delete
      await act(async () => {
        await result.current.onDeleteRecipe();
      });

      // Verify error was shown (transformed to user-friendly message)
      expect(ToastQueue.show).toHaveBeenCalledWith('Failed to delete recipe: Recipe not found. It may have been deleted.');

      // Modal should remain open
      expect(result.current.showImagePickerModal).toBe(true);
      expect(result.current.pendingRecipe).toBeTruthy();
    });
  });
});
