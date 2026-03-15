import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useQueueState } from '../useQueueState';
import { ImageQueueService } from '@/services/ImageQueueService';
import { S3JsonData, MealType } from '@/types';

// Mock dependencies
jest.mock('@/services/ImageQueueService');
jest.mock('@/services/ImageService', () => ({
  ImageService: {
    getRecipeKeyFromFileName: jest.fn((filename: string) =>
      filename.replace('images/', '').replace('.jpg', '')
    ),
  },
}));

describe('useQueueState', () => {
  const mockJsonData: S3JsonData = {
    recipe1: { key: 'recipe1', Title: 'Recipe 1', Type: 'main dish' },
    recipe2: { key: 'recipe2', Title: 'Recipe 2', Type: 'dessert' },
    recipe3: { key: 'recipe3', Title: 'Recipe 3', Type: 'appetizer' },
  };

  const mockSetCurrentRecipe = jest.fn();

  const defaultOptions = {
    jsonData: mockJsonData,
    mealTypeFilters: ['main dish', 'dessert'] as MealType[],
    setCurrentRecipe: mockSetCurrentRecipe,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (ImageQueueService.createRecipeKeyPool as jest.Mock).mockReturnValue([
      'recipe1',
      'recipe2',
      'recipe3',
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

  it('initializes queue from jsonData', async () => {
    const { result } = renderHook(() => useQueueState(defaultOptions));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 3000 });

    expect(result.current.currentImage).toEqual({
      filename: 'images/recipe1.jpg',
      file: 'blob:1',
    });
    expect(result.current.queueLength).toBeGreaterThan(0);
  });

  it('advanceQueue shifts the queue and updates current/next', async () => {
    (ImageQueueService.fetchBatch as jest.Mock)
      .mockResolvedValueOnce({
        images: [
          { filename: 'images/recipe1.jpg', file: 'blob:1' },
          { filename: 'images/recipe2.jpg', file: 'blob:2' },
          { filename: 'images/recipe3.jpg', file: 'blob:3' },
        ],
        failedKeys: [],
      })
      .mockResolvedValueOnce({ images: [], failedKeys: [] })
      .mockResolvedValueOnce({ images: [], failedKeys: [] });

    const { result } = renderHook(() => useQueueState(defaultOptions));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 3000 });

    const initialLength = result.current.queueLength;

    act(() => {
      result.current.advanceQueue();
    });

    expect(result.current.queueLength).toBe(initialLength - 1);
    expect(result.current.currentImage).toEqual({
      filename: 'images/recipe2.jpg',
      file: 'blob:2',
    });
    expect(result.current.nextImage).toEqual({
      filename: 'images/recipe3.jpg',
      file: 'blob:3',
    });
  });

  it('resetQueue clears and reinitializes', async () => {
    const { result } = renderHook(() => useQueueState(defaultOptions));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 3000 });

    const cleanupSpy = ImageQueueService.cleanupImages as jest.Mock;
    cleanupSpy.mockClear();

    await act(async () => {
      await result.current.resetQueue();
    });

    expect(cleanupSpy).toHaveBeenCalled();
    // Should have re-fetched
    expect(ImageQueueService.fetchBatch).toHaveBeenCalled();
  });

  it('empty jsonData results in loading state', () => {
    const { result } = renderHook(() =>
      useQueueState({
        ...defaultOptions,
        jsonData: null,
      })
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.currentImage).toBeNull();
  });
});
